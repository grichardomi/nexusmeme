/**
 * Performance Fee Service
 * Handles 5% fee calculation on profitable trades
 * Manages fee tracking, Stripe billing integration, and edge cases
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

const PERFORMANCE_FEE_RATE = 0.05; // 5%

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set - cannot initialize Stripe client');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export interface PerformanceFeeRecord {
  id: string;
  user_id: string;
  trade_id: string;
  bot_instance_id: string;
  profit_amount: number;
  fee_amount: number;
  status: 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived' | 'disputed';
  stripe_invoice_id: string | null;
  created_at: string;
}

/**
 * Record a performance fee when a trade closes profitably
 * Called after trade.exit_time is set and profit_loss is calculated
 */
export async function recordPerformanceFee(
  userId: string,
  tradeId: string,
  botInstanceId: string,
  profitAmount: number
): Promise<PerformanceFeeRecord | null> {
  // Only charge on profitable trades
  if (profitAmount <= 0) {
    logger.debug('No fee for non-profitable trade', { tradeId, profitAmount });
    return null;
  }

  const feeAmount = profitAmount * PERFORMANCE_FEE_RATE;

  try {
    const result = await query(
      `INSERT INTO performance_fees
       (user_id, trade_id, bot_instance_id, profit_amount, fee_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending_billing')
       RETURNING *`,
      [userId, tradeId, botInstanceId, profitAmount, feeAmount]
    );

    logger.info('Performance fee recorded', {
      userId,
      tradeId,
      profitAmount,
      feeAmount,
      feePercent: PERFORMANCE_FEE_RATE * 100,
    });

    return result[0];
  } catch (error) {
    logger.error('Failed to record performance fee', error instanceof Error ? error : null, {
      userId,
      tradeId,
    });
    throw error;
  }
}

/**
 * Get pending fees for a user (not yet billed)
 */
export async function getPendingFees(userId: string): Promise<PerformanceFeeRecord[]> {
  try {
    const result = await query(
      `SELECT * FROM performance_fees
       WHERE user_id = $1 AND status = 'pending_billing'
       ORDER BY created_at DESC`,
      [userId]
    );

    return result;
  } catch (error) {
    logger.error('Failed to get pending fees', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Get user's fee summary (for dashboard)
 */
export async function getUserFeeSummary(userId: string) {
  try {
    const result = await query(
      `SELECT
         SUM(CASE WHEN profit_amount > 0 THEN profit_amount ELSE 0 END)::DECIMAL as total_profits,
         SUM(CASE WHEN status = 'paid' THEN fee_amount ELSE 0 END)::DECIMAL as total_fees_collected,
         SUM(CASE WHEN status = 'pending_billing' THEN fee_amount ELSE 0 END)::DECIMAL as pending_fees,
         SUM(CASE WHEN status = 'billed' THEN fee_amount ELSE 0 END)::DECIMAL as billed_fees,
         COUNT(*)::INT as total_trades
       FROM performance_fees
       WHERE user_id = $1`,
      [userId]
    );

    return result[0] || {
      total_profits: 0,
      total_fees_collected: 0,
      pending_fees: 0,
      billed_fees: 0,
      total_trades: 0,
    };
  } catch (error) {
    logger.error('Failed to get user fee summary', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Get recent fee transactions (for dashboard history)
 */
export async function getRecentFeeTransactions(userId: string, limit = 50) {
  try {
    const result = await query(
      `SELECT
         pf.id,
         pf.trade_id,
         pf.profit_amount,
         pf.fee_amount,
         pf.status,
         pf.stripe_invoice_id,
         pf.paid_at,
         t.pair
       FROM performance_fees pf
       LEFT JOIN trades t ON pf.trade_id = t.id
       WHERE pf.user_id = $1
       ORDER BY pf.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result;
  } catch (error) {
    logger.error('Failed to get recent fee transactions', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Adjust a fee (for P&L corrections)
 * Called by admin when profit calculation is corrected
 */
export async function adjustFee(
  feeId: string,
  correctedProfit: number,
  adminUserId: string,
  reason: string
): Promise<void> {
  try {
    const correctedFee = correctedProfit * PERFORMANCE_FEE_RATE;

    await transaction(async (client) => {
      // Get original fee record
      const originalFee = await client.query(
        `SELECT * FROM performance_fees WHERE id = $1 FOR UPDATE`,
        [feeId]
      );

      if (!originalFee.rows[0]) {
        throw new Error('Fee not found');
      }

      const fee = originalFee.rows[0];

      // If already billed: create Stripe credit
      if (fee.stripe_invoice_id) {
        const adjustment = correctedFee - fee.fee_amount;

        // Add credit line item to Stripe invoice (if needed)
        if (adjustment !== 0) {
          await stripe.invoiceItems.create({
            customer: (await getStripeCustomerId(fee.user_id))!,
            invoice: fee.stripe_invoice_id,
            amount: Math.round(adjustment * 100), // Stripe uses cents
            description: `Fee adjustment: ${reason}`,
          });
        }
      }

      // Update fee record
      await client.query(
        `UPDATE performance_fees
         SET fee_amount = $1,
             original_fee_amount = $2,
             adjustment_reason = $3,
             adjusted_by_admin = $4,
             adjusted_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [correctedFee, fee.fee_amount, reason, adminUserId, feeId]
      );

      // Log audit trail
      await client.query(
        `INSERT INTO fee_adjustments_audit
         (admin_user_id, affected_user_id, action, affected_fee_ids, reason, original_amount, adjusted_amount)
         VALUES ($1, $2, 'adjusted', $3, $4, $5, $6)`,
        [adminUserId, fee.user_id, [feeId], reason, fee.fee_amount, correctedFee]
      );
    });

    logger.info('Fee adjusted', {
      feeId,
      correctedProfit,
      adminUserId,
      reason,
    });
  } catch (error) {
    logger.error('Failed to adjust fee', error instanceof Error ? error : null, {
      feeId,
    });
    throw error;
  }
}

/**
 * Waive a fee (for customer retention, etc.)
 * Called by admin
 */
export async function waiveFee(
  feeId: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  try {
    await transaction(async (client) => {
      // Get fee record
      const feeResult = await client.query(
        `SELECT * FROM performance_fees WHERE id = $1 FOR UPDATE`,
        [feeId]
      );

      if (!feeResult.rows[0]) {
        throw new Error('Fee not found');
      }

      const fee = feeResult.rows[0];

      // Check if already billed
      if (fee.stripe_invoice_id) {
        throw new Error('Cannot waive already-billed fees. Use refund instead.');
      }

      // Mark as waived
      await client.query(
        `UPDATE performance_fees
         SET status = 'waived',
             adjusted_by_admin = $1,
             adjustment_reason = $2,
             adjusted_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [adminUserId, reason, feeId]
      );

      // Log audit trail
      await client.query(
        `INSERT INTO fee_adjustments_audit
         (admin_user_id, affected_user_id, action, affected_fee_ids, reason, original_amount)
         VALUES ($1, $2, 'waived', $3, $4, $5)`,
        [adminUserId, fee.user_id, [feeId], reason, fee.fee_amount]
      );
    });

    logger.info('Fee waived', {
      feeId,
      adminUserId,
      reason,
    });
  } catch (error) {
    logger.error('Failed to waive fee', error instanceof Error ? error : null, {
      feeId,
    });
    throw error;
  }
}

/**
 * Refund a fee (after payment was made)
 * Called by admin
 */
export async function refundFee(
  feeId: string,
  adminUserId: string,
  reason: string
): Promise<string> {
  try {
    const feeResult = await query(
      `SELECT * FROM performance_fees WHERE id = $1`,
      [feeId]
    );

    if (!feeResult[0]) {
      throw new Error('Fee not found');
    }

    const fee = feeResult[0];

    if (fee.status !== 'paid') {
      throw new Error('Only paid fees can be refunded');
    }

    if (!fee.stripe_invoice_id) {
      throw new Error('No Stripe invoice found');
    }

    // Get Stripe charge ID from invoice
    const invoice = await stripe.invoices.retrieve(fee.stripe_invoice_id);
    const chargeId = invoice.charge as string | null;

    if (!chargeId) {
      throw new Error('No charge found on invoice');
    }

    // Issue refund
    const refund = await stripe.refunds.create({
      charge: chargeId as string,
    });

    // Update fee record
    await transaction(async (client) => {
      await client.query(
        `UPDATE performance_fees
         SET status = 'refunded',
             updated_at = NOW()
         WHERE id = $1`,
        [feeId]
      );

      // Log audit trail
      await client.query(
        `INSERT INTO fee_adjustments_audit
         (admin_user_id, affected_user_id, action, affected_fee_ids, reason, original_amount)
         VALUES ($1, $2, 'refunded', $3, $4, $5)`,
        [adminUserId, fee.user_id, [feeId], reason, fee.fee_amount]
      );

      // Update charge history
      await client.query(
        `UPDATE fee_charge_history
         SET status = 'refunded',
             refunded_at = NOW(),
             refund_amount = $1
         WHERE stripe_invoice_id = $2`,
        [fee.fee_amount, fee.stripe_invoice_id]
      );
    });

    logger.info('Fee refunded', {
      feeId,
      refundId: refund.id,
      adminUserId,
      reason,
    });

    return refund.id;
  } catch (error) {
    logger.error('Failed to refund fee', error instanceof Error ? error : null, {
      feeId,
    });
    throw error;
  }
}

/**
 * Helper: Get Stripe customer ID for a user
 */
async function getStripeCustomerId(userId: string): Promise<string | null> {
  try {
    const result = await query(
      `SELECT stripe_customer_id FROM user_stripe_billing WHERE user_id = $1`,
      [userId]
    );

    return result[0]?.stripe_customer_id || null;
  } catch (error) {
    logger.error('Failed to get Stripe customer ID', error instanceof Error ? error : null, {
      userId,
    });
    return null;
  }
}

/**
 * Helper: Mark fees as billed in batch
 * Called by monthly billing job
 */
export async function markFeesAsBilled(
  userId: string,
  stripeInvoiceId: string,
  feeIds: string[]
): Promise<void> {
  try {
    await query(
      `UPDATE performance_fees
       SET stripe_invoice_id = $1,
           status = 'billed',
           billed_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($2)`,
      [stripeInvoiceId, feeIds]
    );

    logger.info('Fees marked as billed', {
      userId,
      stripeInvoiceId,
      feeCount: feeIds.length,
    });
  } catch (error) {
    logger.error('Failed to mark fees as billed', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Helper: Mark fees as paid
 * Called by Stripe webhook (invoice.paid)
 */
export async function markFeesAsPaid(stripeInvoiceId: string): Promise<void> {
  try {
    await query(
      `UPDATE performance_fees
       SET status = 'paid',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE stripe_invoice_id = $1`,
      [stripeInvoiceId]
    );

    logger.info('Fees marked as paid', {
      stripeInvoiceId,
    });
  } catch (error) {
    logger.error('Failed to mark fees as paid', error instanceof Error ? error : null, {
      stripeInvoiceId,
    });
    throw error;
  }
}
