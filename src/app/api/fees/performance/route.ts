/**
 * Performance Fees API - User Endpoint
 * GET /api/fees/performance
 * Returns user's fee summary and recent transactions
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  getUserFeeSummary,
  getRecentFeeTransactions,
} from '@/services/billing/performance-fee';
import { query } from '@/lib/db';

/**
 * GET /api/fees/performance
 * Get user's performance fee summary with pagination support
 *
 * Query params:
 * - type: 'summary' | 'transactions' | 'charges' (defaults to 'summary')
 * - offset: Number of items to skip (default: 0)
 * - limit: Number of items to return (default: 20 for transactions, 10 for charges)
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'summary';
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0'));
    const txnLimit = parseInt(url.searchParams.get('limit') || '20'); // Default 20 for transactions
    const chargeLimit = parseInt(url.searchParams.get('limit') || '10'); // Default 10 for charges

    let summary: any = {
      total_profits: 0,
      total_fees_collected: 0,
      pending_fees: 0,
      billed_fees: 0,
      total_trades: 0,
    };

    let recentTransactions: any[] = [];
    let transactionTotal = 0;
    let chargeHistory: any[] = [];
    let chargeTotal = 0;
    let billingStatus: any = {
      billing_status: 'active',
      failed_charge_attempts: 0,
      pause_trading_on_failed_charge: false,
    };

    // Always fetch summary
    try {
      summary = await getUserFeeSummary(session.user.id);
    } catch (err) {
      logger.warn('Could not fetch fee summary', {
        userId: session.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fetch transactions if requested or on initial load
    if (type === 'summary' || type === 'transactions') {
      try {
        const allTransactions = await getRecentFeeTransactions(session.user.id, 1000);
        transactionTotal = allTransactions.length;
        recentTransactions = allTransactions.slice(offset, offset + txnLimit);
      } catch (err) {
        logger.warn('Could not fetch recent transactions', {
          userId: session.user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fetch billing status
    try {
      const billingResult = await query(
        `SELECT
           billing_status,
           failed_charge_attempts,
           pause_trading_on_failed_charge
         FROM user_stripe_billing
         WHERE user_id = $1`,
        [session.user.id]
      );

      if (billingResult.length > 0) {
        billingStatus = billingResult[0];
      }
    } catch (err) {
      logger.warn('Could not fetch billing status', {
        userId: session.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fetch charge history if requested or on initial load
    if (type === 'summary' || type === 'charges') {
      try {
        // Get total count first
        const countResult = await query(
          `SELECT COUNT(*) as total FROM fee_charge_history WHERE user_id = $1`,
          [session.user.id]
        );
        chargeTotal = parseInt(countResult[0]?.total || 0);

        const historyResult = await query(
          `SELECT
             user_id,
             billing_period_start,
             billing_period_end,
             total_fees_amount,
             total_fees_count,
             status
           FROM fee_charge_history
           WHERE user_id = $1
           ORDER BY billing_period_end DESC
           OFFSET $2
           LIMIT $3`,
          [session.user.id, offset, chargeLimit]
        );

        chargeHistory = historyResult.map((h) => ({
          invoice_id: `charge-${h.user_id}-${h.billing_period_end}`,
          billing_period_start: h.billing_period_start,
          billing_period_end: h.billing_period_end,
          total_fees: parseFloat(h.total_fees_amount || 0),
          trade_count: h.total_fees_count || 0,
          status: h.status || 'pending',
        }));
      } catch (err) {
        logger.warn('Could not fetch charge history', {
          userId: session.user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('User viewed performance fees', {
      userId: session.user.id,
    });

    // Ensure all numeric values are numbers
    const safeRecentTransactions = recentTransactions.map((t) => ({
      ...t,
      profit_amount: parseFloat(t.profit_amount || 0),
      fee_amount: parseFloat(t.fee_amount || 0),
      created_at: t.created_at || t.created_at,
      paid_at: t.paid_at || null,
    }));

    return NextResponse.json({
      summary: {
        total_profits: parseFloat(summary.total_profits || 0),
        total_fees_collected: parseFloat(summary.total_fees_collected || 0),
        pending_fees: parseFloat(summary.pending_fees || 0),
        billed_fees: parseFloat(summary.billed_fees || 0),
        total_trades: summary.total_trades || 0,
      },
      billing: billingStatus,
      recentTransactions: safeRecentTransactions,
      transactionTotal,
      charges: chargeHistory,
      chargeTotal,
    });
  } catch (error) {
    logger.error('Failed to get performance fees', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        summary: {
          total_profits: 0,
          total_fees_collected: 0,
          pending_fees: 0,
          billed_fees: 0,
          total_trades: 0,
        },
        billing: {
          billing_status: 'active',
          failed_charge_attempts: 0,
          pause_trading_on_failed_charge: false,
        },
        recentTransactions: [],
        transactionTotal: 0,
        charges: [],
        chargeTotal: 0,
      },
      { status: 200 }
    );
  }
}
