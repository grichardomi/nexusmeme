/**
 * Monthly Billing Job
 * Runs on 1st of each month at 2 AM UTC
 * Aggregates pending fees and creates USDC invoices
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import {
  sendPerformanceFeeChargedEmail,
  sendPerformanceFeeFailedEmail,
  sendUpcomingBillingEmail,
} from '@/services/email/triggers';
import { createUSDCInvoice, isUSDCPaymentEnabled } from './usdc-payment';
import { markFeesAsBilled } from './performance-fee';

interface PendingUserFees {
  user_id: string;
  email: string;
  name?: string;
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

  // USDC is the only payment method
  if (!isUSDCPaymentEnabled()) {
    logger.error('Monthly billing job failed: USDC payment is not enabled');
    return {
      success: false,
      billingRunId: '',
      successCount: 0,
      failureCount: 0,
      totalBilled: 0,
      errors: ['USDC payment is not enabled (set USDC_PAYMENT_ENABLED=true)'],
    };
  }

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
  const { PERFORMANCE_FEE_MIN_INVOICE_USD } = getEnvironmentConfig();

  const result = await query(
    `SELECT
       u.id as user_id,
       u.email,
       u.name,
       SUM(pf.fee_amount)::DECIMAL as total_fees,
       COUNT(pf.id)::INT as fee_count,
       ARRAY_AGG(pf.id) as fee_ids
     FROM users u
     JOIN performance_fees pf ON u.id = pf.user_id
     WHERE pf.status = 'pending_billing'
     GROUP BY u.id, u.email, u.name
     HAVING SUM(pf.fee_amount) >= $1
     ORDER BY u.id`,
    [PERFORMANCE_FEE_MIN_INVOICE_USD]
  );

  logger.debug('Pending fees query', {
    minInvoiceThreshold: PERFORMANCE_FEE_MIN_INVOICE_USD,
    usersWithFees: result.length,
  });

  return result;
}

/**
 * Process billing for a single user
 * Creates a USDC invoice for the user to pay
 * @param userFees - Fees to bill for this user
 * @param billingRunId - ID of the current billing run (for metrics scoping, optional for admin functions)
 */
async function processSingleUserBilling(userFees: PendingUserFees, billingRunId?: string): Promise<void> {
  const env = getEnvironmentConfig();
  const billingUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

  try {
    let chargeReference = '';
    let chargeUrl = billingUrl;

    // Create a USDC invoice (only payment method)
    const invoice = await createUSDCInvoice(
      userFees.user_id,
      userFees.fee_ids,
      userFees.total_fees
    );
    chargeReference = invoice.payment_reference;
    chargeUrl = billingUrl;

    await markFeesAsBilled(userFees.user_id, invoice.payment_reference, userFees.fee_ids);

    logger.info('USDC invoice created for monthly billing', {
      userId: userFees.user_id,
      reference: invoice.payment_reference,
      amount: userFees.total_fees,
    });

    // Mark fees as billed
    if (billingRunId) {
      await transaction(async (client) => {
        await client.query(
          `UPDATE performance_fees
           SET billing_run_id = $1
           WHERE id = ANY($2)`,
          [billingRunId, userFees.fee_ids]
        );
      });
    }

    // Create charge history record
    await query(
      `INSERT INTO fee_charge_history
       (user_id, billing_period_start, billing_period_end, total_fees_amount,
        total_fees_count, payment_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [
        userFees.user_id,
        getStartOfLastMonth(),
        getEndOfLastMonth(),
        userFees.total_fees,
        userFees.fee_count,
        chargeReference,
      ]
    );

    // Send invoice email with payment instructions
    try {
      await sendPerformanceFeeChargedEmail(
        userFees.email,
        userFees.name || 'Trader',
        userFees.total_fees,
        chargeReference,
        chargeUrl,
        userFees.fee_count
      );
    } catch (emailError) {
      logger.warn('Failed to send billing notification email', {
        userId: userFees.user_id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    logger.info('User billing processed successfully', {
      userId: userFees.user_id,
      amount: userFees.total_fees,
      reference: chargeReference,
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
        parseFloat(String(userFees.total_fees)),
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

  if (!isUSDCPaymentEnabled()) {
    throw new Error('USDC payment is not enabled (set USDC_PAYMENT_ENABLED=true)');
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Get pending fees for the month
  const pendingFees = await query(
    `SELECT
       u.id as user_id,
       u.email,
       u.name,
       SUM(pf.fee_amount)::DECIMAL as total_fees,
       COUNT(pf.id)::INT as fee_count,
       ARRAY_AGG(pf.id) as fee_ids
     FROM users u
     JOIN performance_fees pf ON u.id = pf.user_id
     WHERE pf.status = 'pending_billing'
       AND pf.created_at >= $1
       AND pf.created_at < $2
     GROUP BY u.id, u.email, u.name`,
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

/**
 * Send upcoming billing notification emails
 * Runs on 28th of each month to warn users about upcoming charges on the 1st
 */
export async function sendUpcomingBillingNotifications(): Promise<{
  success: boolean;
  notificationsSent: number;
  errors: string[];
}> {
  logger.info('Starting upcoming billing notifications');
  const errors: string[] = [];
  let notificationsSent = 0;

  try {
    const pendingFees = await getPendingFeesPerUser();

    if (pendingFees.length === 0) {
      logger.info('No users with pending fees for upcoming billing notification');
      return { success: true, notificationsSent: 0, errors: [] };
    }

    // Billing date is the 1st of next month
    const now = new Date();
    const billingDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const billingDateStr = billingDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    for (const userFees of pendingFees) {
      try {
        await sendUpcomingBillingEmail(
          userFees.email,
          userFees.name || 'Trader',
          userFees.total_fees,
          userFees.fee_count,
          billingDateStr
        );
        notificationsSent++;

        logger.info('Upcoming billing notification sent', {
          userId: userFees.user_id,
          amount: userFees.total_fees,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Failed to send upcoming billing notification', {
          userId: userFees.user_id,
          error: errorMsg,
        });
        errors.push(`User ${userFees.user_id}: ${errorMsg}`);
      }
    }

    logger.info('Upcoming billing notifications completed', {
      notificationsSent,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      notificationsSent,
      errors,
    };
  } catch (error) {
    logger.error('Upcoming billing notifications failed', error instanceof Error ? error : null);
    return {
      success: false,
      notificationsSent,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}
