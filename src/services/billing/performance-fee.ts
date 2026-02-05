/**
 * Performance Fee Service
 * Handles 5% fee calculation on profitable trades
 * Manages fee tracking and Coinbase Commerce billing integration
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';

function getFeeRate(): number {
  return getEnvironmentConfig().PERFORMANCE_FEE_RATE;
}

export interface PerformanceFeeRecord {
  id: string;
  user_id: string;
  trade_id: string;
  bot_instance_id: string;
  profit_amount: number;
  fee_amount: number;
  status: 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived' | 'disputed';
  coinbase_charge_id: string | null;
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
  profitAmount: number,
  pair: string
): Promise<PerformanceFeeRecord | null> {
  // Only charge on profitable trades
  if (profitAmount <= 0) {
    logger.debug('No fee for non-profitable trade', { tradeId, profitAmount });
    return null;
  }

  const feeAmount = profitAmount * getFeeRate();

  try {
    const result = await query(
      `INSERT INTO performance_fees
       (user_id, trade_id, bot_instance_id, profit_amount, fee_amount, status, pair)
       VALUES ($1, $2, $3, $4, $5, 'pending_billing', $6)
       RETURNING *`,
      [userId, tradeId, botInstanceId, profitAmount, feeAmount, pair]
    );

    logger.info('Performance fee recorded', {
      userId,
      tradeId,
      profitAmount,
      feeAmount,
      feePercent: getFeeRate() * 100,
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
         pf.coinbase_charge_id,
         pf.paid_at,
         pf.pair
       FROM performance_fees pf
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
 * Note: With Coinbase Commerce, refunds must be handled manually
 */
export async function adjustFee(
  feeId: string,
  correctedProfit: number,
  adminUserId: string,
  reason: string
): Promise<void> {
  try {
    const correctedFee = correctedProfit * getFeeRate();

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
      if (fee.coinbase_charge_id) {
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
 * Mark a fee as refunded (manual refund process for crypto payments)
 * Called by admin after manually processing crypto refund
 * Note: Coinbase Commerce crypto refunds must be done manually via wallet transfer
 */
export async function markFeeRefunded(
  feeId: string,
  adminUserId: string,
  reason: string,
  refundTxId?: string
): Promise<void> {
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

    // Update fee record
    await transaction(async (client) => {
      await client.query(
        `UPDATE performance_fees
         SET status = 'refunded',
             refund_tx_id = $1,
             adjusted_by_admin = $2,
             adjustment_reason = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [refundTxId || null, adminUserId, reason, feeId]
      );

      // Log audit trail
      await client.query(
        `INSERT INTO fee_adjustments_audit
         (admin_user_id, affected_user_id, action, affected_fee_ids, reason, original_amount)
         VALUES ($1, $2, 'refunded', $3, $4, $5)`,
        [adminUserId, fee.user_id, [feeId], reason, fee.fee_amount]
      );

      // Update charge history if exists
      if (fee.coinbase_charge_id) {
        await client.query(
          `UPDATE fee_charge_history
           SET status = 'refunded',
               refunded_at = NOW(),
               refund_amount = $1
           WHERE id = (
             SELECT fch.id FROM fee_charge_history fch
             JOIN coinbase_charges cc ON fch.coinbase_charge_id = cc.charge_id
             WHERE cc.charge_id = $2
             LIMIT 1
           )`,
          [fee.fee_amount, fee.coinbase_charge_id]
        );
      }
    });

    logger.info('Fee marked as refunded', {
      feeId,
      refundTxId,
      adminUserId,
      reason,
    });
  } catch (error) {
    logger.error('Failed to mark fee as refunded', error instanceof Error ? error : null, {
      feeId,
    });
    throw error;
  }
}

/**
 * Get pending fees aggregated per user (for monthly billing job)
 * Skips users whose total pending fees are below the minimum invoice amount
 */
export async function getPendingFeesPerUser(): Promise<Array<{
  user_id: string;
  total_fee_amount: number;
  fee_count: number;
  fee_ids: string[];
}>> {
  const minInvoice = getEnvironmentConfig().PERFORMANCE_FEE_MIN_INVOICE_USD;

  try {
    const result = await query(
      `SELECT
         user_id,
         SUM(fee_amount)::DECIMAL as total_fee_amount,
         COUNT(*)::INT as fee_count,
         ARRAY_AGG(id) as fee_ids
       FROM performance_fees
       WHERE status = 'pending_billing'
       GROUP BY user_id
       HAVING SUM(fee_amount) >= $1
       ORDER BY SUM(fee_amount) DESC`,
      [minInvoice]
    );

    return result;
  } catch (error) {
    logger.error('Failed to get pending fees per user', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Helper: Mark fees as billed in batch
 * Called by monthly billing job when Coinbase charge is created
 */
export async function markFeesAsBilled(
  userId: string,
  coinbaseChargeId: string,
  feeIds: string[]
): Promise<void> {
  try {
    await query(
      `UPDATE performance_fees
       SET coinbase_charge_id = $1,
           status = 'billed',
           billed_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($2)`,
      [coinbaseChargeId, feeIds]
    );

    logger.info('Fees marked as billed', {
      userId,
      coinbaseChargeId,
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
 * Called by Coinbase webhook (charge:confirmed)
 */
export async function markFeesAsPaid(coinbaseChargeId: string): Promise<void> {
  try {
    await query(
      `UPDATE performance_fees
       SET status = 'paid',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE coinbase_charge_id = $1`,
      [coinbaseChargeId]
    );

    logger.info('Fees marked as paid', {
      coinbaseChargeId,
    });
  } catch (error) {
    logger.error('Failed to mark fees as paid', error instanceof Error ? error : null, {
      coinbaseChargeId,
    });
    throw error;
  }
}
