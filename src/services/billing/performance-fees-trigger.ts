import { getPool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { TRIAL_CONFIG } from '@/config/pricing';

/**
 * Performance Fees Billing Trigger Service
 *
 * Handles automatic charging for profitable trades
 *
 * Rules:
 * 1. TRIAL USERS (live_trial plan):
 *    - No charge during 10-day/$200 live trading trial
 *    - Trial capital limit tracks real capital deployed
 *    - Trial ends when: 10 days elapsed OR $200 capital used
 *
 * 2. PERFORMANCE FEES USERS (performance_fees plan):
 *    - 5% fee on each profitable closed trade
 *    - Fees accumulate throughout month
 *    - Monthly billing: 1st of month at 2 AM UTC
 *    - Only charges if fees >= $1 (prevent micro-charges)
 *    - Charges require valid payment method
 */

/**
 * Track capital used during trial
 * Called when a trade is executed (entry)
 */
export async function trackTrialCapitalUsage(
  userId: string,
  botId: string,
  capitalDeployed: number,
): Promise<boolean> {
  const client = await getPool().connect();
  try {
    // Get current trial status
    const subResult = await client.query(
      `SELECT id, plan, trial_capital_used, trial_ends_at
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (subResult.rows.length === 0) {
      return false;
    }

    const sub = subResult.rows[0];

    // Only track for live_trial users
    if (sub.plan !== 'live_trial') {
      return true;
    }

    const currentCapitalUsed = sub.trial_capital_used || 0;
    const newCapitalUsed = currentCapitalUsed + capitalDeployed;

    // Check if capital limit exceeded
    if (newCapitalUsed >= TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD) {
      // Trial ends due to capital limit
      await client.query(
        `UPDATE subscriptions
         SET
           plan = 'free',
           trial_ends_at = NOW(),
           trial_capital_used = $1,
           status = 'active'
         WHERE id = $2`,
        [newCapitalUsed, sub.id],
      );

      logger.warn('Trial capital limit reached', {
        userId,
        botId,
        capitalUsed: newCapitalUsed,
        limit: TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD,
      });

      return false; // Prevent trade execution
    }

    // Update capital usage
    await client.query(
      `UPDATE subscriptions
       SET trial_capital_used = trial_capital_used + $1
       WHERE id = $2`,
      [capitalDeployed, sub.id],
    );

    logger.debug('Trial capital tracked', {
      userId,
      capitalUsed: newCapitalUsed,
      remaining: TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD - newCapitalUsed,
    });

    return true;
  } finally {
    client.release();
  }
}

/**
 * Record pending fee for a closed trade
 * Called when a trade closes with profit
 *
 * For trial users: No fee
 * For performance_fees users: 5% fee (recorded as pending)
 */
export async function recordPendingFee(
  userId: string,
  botId: string,
  tradeId: string,
  profitAmount: number,
): Promise<{ feePending: number; feeType: 'live_trial' | 'performance_fees' }> {
  const client = await getPool().connect();
  try {
    // Get user's current plan
    const subResult = await client.query(
      `SELECT id, plan FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (subResult.rows.length === 0) {
      // Should not happen - all users should have subscription
      logger.warn('User has no active subscription', { userId });
      return { feePending: 0, feeType: 'live_trial' };
    }

    const plan = subResult.rows[0].plan;
    let feeAmount = 0;

    if (plan === 'performance_fees') {
      // Calculate 5% fee on profit
      feeAmount = profitAmount * (TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT / 100);

      // Record pending fee
      await client.query(
        `INSERT INTO pending_fees (user_id, bot_id, trade_id, fee_amount, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (trade_id) DO UPDATE SET fee_amount = $4`,
        [userId, botId, tradeId, feeAmount],
      );

      logger.info('Performance fee recorded', {
        userId,
        botId,
        tradeId,
        profit: profitAmount,
        fee: feeAmount,
      });

      return { feePending: feeAmount, feeType: 'performance_fees' };
    }

    // Trial users: no fee
    return { feePending: 0, feeType: plan };
  } finally {
    client.release();
  }
}

/**
 * Process monthly billing
 * Called on 1st of month at 2 AM UTC
 *
 * Collects all pending fees and creates billing invoice
 * Only charges if total fees >= $1
 */
export async function processMonthlyBilling() {
  const client = await getPool().connect();
  try {
    logger.info('Starting monthly performance fee billing');

    // Get all users with pending fees
    const usersResult = await client.query(
      `SELECT DISTINCT pf.user_id
       FROM pending_fees pf
       WHERE pf.status = 'pending'
       AND pf.created_at <= NOW()`,
    );

    let billed = 0;
    let failed = 0;

    for (const { user_id } of usersResult.rows) {
      try {
        // Calculate total fees for this user
        const feesResult = await client.query(
          `SELECT COALESCE(SUM(fee_amount), 0) as total_fees
           FROM pending_fees
           WHERE user_id = $1 AND status = 'pending'`,
          [user_id],
        );

        const totalFees = feesResult.rows[0].total_fees;

        // Only charge if >= $1
        if (totalFees >= 1) {
          // Create billing invoice
          const invoiceResult = await client.query(
            `INSERT INTO billing_invoices (user_id, invoice_type, amount, period_start, period_end, status)
             VALUES ($1, 'performance_fees', $2, DATE_TRUNC('month', NOW() - INTERVAL '1 month'), DATE_TRUNC('month', NOW()) - INTERVAL '1 second', 'pending_payment')
             RETURNING id`,
            [user_id, totalFees],
          );

          const invoiceId = invoiceResult.rows[0].id;

          // Mark fees as billed
          await client.query(
            `UPDATE pending_fees
             SET status = 'billed', billing_invoice_id = $1
             WHERE user_id = $2 AND status = 'pending'`,
            [invoiceId, user_id],
          );

          logger.info('Monthly billing created', {
            userId: user_id,
            invoiceId,
            totalFees,
          });

          billed++;
        } else {
          // Mark fees as processed even if under minimum
          await client.query(
            `UPDATE pending_fees
             SET status = 'waived'
             WHERE user_id = $1 AND status = 'pending' AND fee_amount < 1`,
            [user_id],
          );
        }
      } catch (error) {
        logger.error('Failed to process billing for user', error instanceof Error ? error : null, {
          userId: user_id,
        });
        failed++;
      }
    }

    logger.info('Monthly billing processing complete', {
      processed: usersResult.rows.length,
      billed,
      failed,
    });

    return { processed: usersResult.rows.length, billed, failed };
  } finally {
    client.release();
  }
}

/**
 * Get pending fees for a user
 */
export async function getPendingFees(userId: string) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        COALESCE(SUM(fee_amount), 0) as total_pending,
        COUNT(*) as trade_count,
        MAX(created_at) as last_trade_date
       FROM pending_fees
       WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );

    const row = result.rows[0];
    return {
      totalPending: row.total_pending,
      tradeCount: row.trade_count,
      lastTradeDate: row.last_trade_date,
      willBillNext: row.total_pending >= 1,
    };
  } finally {
    client.release();
  }
}

/**
 * Get monthly billing summary for user
 */
export async function getMonthlyBillingSummary(userId: string) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        id,
        amount,
        status,
        period_start,
        period_end,
        paid_at,
        created_at
       FROM billing_invoices
       WHERE user_id = $1 AND invoice_type = 'performance_fees'
       ORDER BY period_start DESC
       LIMIT 12`,
      [userId],
    );

    return result.rows.map((row) => ({
      invoiceId: row.id,
      amount: parseFloat(row.amount),
      status: row.status,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      createdAt: new Date(row.created_at),
    }));
  } finally {
    client.release();
  }
}
