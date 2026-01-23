/**
 * Monthly Billing Job
 * Runs on 1st of each month at 2 AM UTC
 * Aggregates pending fees and creates Stripe invoices
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  sendPerformanceFeeChargedEmail,
  sendPerformanceFeeFailedEmail,
} from '@/services/email/triggers';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set - cannot initialize Stripe client');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

interface PendingUserFees {
  user_id: string;
  email: string;
  name?: string;
  stripe_customer_id: string;
  total_fees: number;
  fee_count: number;
  fee_ids: string[];
}

/**
 * Main monthly billing job
 * Should be triggered via cron: "0 2 1 * *" (1st of month, 2 AM UTC)
 */
export async function runMonthlyBillingJob(): Promise<{
  success: boolean;
  billingRunId: string;
  successCount: number;
  failureCount: number;
  totalBilled: number;
  errors: string[];
}> {
  logger.info('Starting monthly billing job');

  const startOfLastMonth = getStartOfLastMonth();
  const endOfLastMonth = getEndOfLastMonth();

  let billingRunId = '';
  const errors: string[] = [];

  try {
    // Create billing run record
    const billingRunResult = await query(
      `INSERT INTO billing_runs (period_start, period_end, status)
       VALUES ($1, $2, 'processing')
       RETURNING id`,
      [startOfLastMonth, endOfLastMonth]
    );

    billingRunId = billingRunResult[0].id;

    logger.info('Billing run created', {
      billingRunId,
      period: `${startOfLastMonth} to ${endOfLastMonth}`,
    });

    // Get all users with pending fees
    const pendingFees = await getPendingFeesPerUser();

    if (pendingFees.length === 0) {
      logger.info('No pending fees found');
      await query(
        `UPDATE billing_runs
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [billingRunId]
      );

      return {
        success: true,
        billingRunId,
        successCount: 0,
        failureCount: 0,
        totalBilled: 0,
        errors: [],
      };
    }

    let successCount = 0;
    let failureCount = 0;
    let totalBilled = 0;

    // Process each user
    for (const userFees of pendingFees) {
      try {
        await processSingleUserBilling(userFees, billingRunId);
        successCount++;
        totalBilled += userFees.total_fees;
      } catch (error) {
        failureCount++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to bill user', error instanceof Error ? error : null, {
          userId: userFees.user_id,
          feesAmount: userFees.total_fees,
        });
        errors.push(`User ${userFees.user_id}: ${errorMsg}`);
      }
    }

    // Update billing run with accurate counts from this specific run
    // Count actual fees associated with this billing_run (not all-time billed fees)
    const billingRunStats = await query(
      `SELECT COUNT(*) as total_fees_billed
       FROM performance_fees
       WHERE billing_run_id = $1 AND status = 'billed'`,
      [billingRunId]
    );

    const totalFeesBilled = billingRunStats[0]?.total_fees_billed || 0;

    await query(
      `UPDATE billing_runs
       SET status = 'completed',
           total_users_billed = $1,
           total_fees_amount = $2,
           total_fees_count = $3,
           completed_at = NOW()
       WHERE id = $4`,
      [successCount, totalBilled, totalFeesBilled, billingRunId]
    );

    logger.info('Monthly billing job completed', {
      billingRunId,
      successCount,
      failureCount,
      totalBilled,
      errorCount: errors.length,
    });

    return {
      success: failureCount === 0,
      billingRunId,
      successCount,
      failureCount,
      totalBilled,
      errors,
    };
  } catch (error) {
    logger.error('Monthly billing job failed', error instanceof Error ? error : null);

    if (billingRunId) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await query(
        `UPDATE billing_runs
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [errorMsg, billingRunId]
      );
    }

    return {
      success: false,
      billingRunId,
      successCount: 0,
      failureCount: 1,
      totalBilled: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Get pending fees aggregated per user
 */
async function getPendingFeesPerUser(): Promise<PendingUserFees[]> {
  const result = await query(
    `SELECT
       u.id as user_id,
       u.email,
       u.name,
       usb.stripe_customer_id,
       SUM(pf.fee_amount)::DECIMAL as total_fees,
       COUNT(pf.id)::INT as fee_count,
       ARRAY_AGG(pf.id) as fee_ids
     FROM users u
     JOIN user_stripe_billing usb ON u.id = usb.user_id
     JOIN performance_fees pf ON u.id = pf.user_id
     WHERE pf.status = 'pending_billing'
       AND usb.billing_status = 'active'
     GROUP BY u.id, u.email, u.name, usb.stripe_customer_id
     HAVING SUM(pf.fee_amount) > 0
     ORDER BY u.id`
  );

  return result;
}

/**
 * Process billing for a single user
 * @param userFees - Fees to bill for this user
 * @param billingRunId - ID of the current billing run (for metrics scoping, optional for admin functions)
 */
async function processSingleUserBilling(userFees: PendingUserFees, billingRunId?: string): Promise<void> {
  try {
    // Create Stripe invoice item first
    await stripe.invoiceItems.create({
      customer: userFees.stripe_customer_id,
      amount: Math.round(userFees.total_fees * 100), // Stripe uses cents
      currency: 'usd',
      description: `Trading Bot Performance Fee - ${userFees.fee_count} profitable trade(s)`,
    });

    // Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: userFees.stripe_customer_id,
      collection_method: 'charge_automatically',
      auto_advance: true, // Auto-finalize and attempt payment
      description: `Performance fees for ${userFees.fee_count} profitable trades`,
    });

    logger.info('Stripe invoice created', {
      userId: userFees.user_id,
      invoiceId: invoice.id,
      amount: userFees.total_fees,
    });

    // Mark fees as billed
    await transaction(async (client) => {
      // Update performance_fees (with billing_run_id for proper scoping)
      await client.query(
        `UPDATE performance_fees
         SET stripe_invoice_id = $1,
             status = 'billed',
             billed_at = NOW(),
             billing_run_id = $3,
             updated_at = NOW()
         WHERE id = ANY($2)`,
        [invoice.id, userFees.fee_ids, billingRunId]
      );

      // Create charge history record
      await client.query(
        `INSERT INTO fee_charge_history
         (user_id, billing_period_start, billing_period_end, total_fees_amount,
          total_fees_count, stripe_invoice_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [
          userFees.user_id,
          getStartOfLastMonth(),
          getEndOfLastMonth(),
          userFees.total_fees,
          userFees.fee_count,
          invoice.id,
        ]
      );
    });

    // Send notification email
    try {
      await sendPerformanceFeeChargedEmail(
        userFees.email,
        userFees.name || 'Trader',
        userFees.total_fees,
        invoice.id,
        invoice.hosted_invoice_url || undefined,
        userFees.fee_count
      );
    } catch (emailError) {
      logger.warn('Failed to send billing notification email', {
        userId: userFees.user_id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      // Don't fail the entire billing if email fails
    }

    logger.info('User billed successfully', {
      userId: userFees.user_id,
      amount: userFees.total_fees,
    });
  } catch (error) {
    logger.error('Failed to process user billing', error instanceof Error ? error : null, {
      userId: userFees.user_id,
    });

    // Send error notification to user
    try {
      await sendPerformanceFeeFailedEmail(
        userFees.email,
        userFees.name || 'Trader',
        userFees.total_fees,
        1
      );
    } catch (emailError) {
      logger.warn('Failed to send billing failure email', {
        userId: userFees.user_id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    throw error;
  }
}

/**
 * Helper: Get start of last month
 */
function getStartOfLastMonth(): Date {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return lastMonth;
}

/**
 * Helper: Get end of last month
 */
function getEndOfLastMonth(): Date {
  const now = new Date();
  const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  return lastDayOfLastMonth;
}

/**
 * Run billing job for a specific month (for admin/testing)
 */
export async function runBillingJobForMonth(year: number, month: number): Promise<any> {
  logger.info('Running billing job for specific month', { year, month });

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Get pending fees for the month
  const pendingFees = await query(
    `SELECT
       u.id as user_id,
       u.email,
       usb.stripe_customer_id,
       SUM(pf.fee_amount)::DECIMAL as total_fees,
       COUNT(pf.id)::INT as fee_count,
       ARRAY_AGG(pf.id) as fee_ids
     FROM users u
     JOIN user_stripe_billing usb ON u.id = usb.user_id
     JOIN performance_fees pf ON u.id = pf.user_id
     WHERE pf.status = 'pending_billing'
       AND usb.billing_status = 'active'
       AND pf.created_at >= $1
       AND pf.created_at < $2
     GROUP BY u.id, u.email, usb.stripe_customer_id`,
    [startDate, endDate]
  );

  let processed = 0;
  let failed = 0;

  for (const userFees of pendingFees) {
    try {
      await processSingleUserBilling(userFees);
      processed++;
    } catch (error) {
      failed++;
    }
  }

  return {
    month: `${year}-${month}`,
    processed,
    failed,
    totalUsers: pendingFees.length,
  };
}
