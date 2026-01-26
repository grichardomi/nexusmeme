/**
 * Performance Fees API - User Endpoint
 * GET /api/fees/performance
 * Returns user's fee summary and recent transactions
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getUserFeeSummary } from '@/services/billing/performance-fee';
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
        const statusFilter = url.searchParams.get('status'); // Optional status filter

        // Get total count with optional status filter
        let countQuery = `SELECT COUNT(*) as total FROM performance_fees WHERE user_id = $1`;
        let countParams: any[] = [session.user.id];

        if (statusFilter && statusFilter !== 'all') {
          countQuery += ` AND status = $2`;
          countParams.push(statusFilter);
        }

        const countResult = await query(countQuery, countParams);
        transactionTotal = parseInt(countResult[0]?.total || 0);

        // Fetch paginated transactions with optional status filter
        let txnQuery = `
          SELECT
            pf.id,
            pf.trade_id,
            pf.profit_amount,
            pf.fee_amount,
            pf.status,
            pf.created_at,
            pf.paid_at,
            pf.billed_at,
            pf.stripe_invoice_id,
            COALESCE(t.pair, 'Unknown') as pair
          FROM performance_fees pf
          LEFT JOIN trades t ON pf.trade_id = t.id::text
          WHERE pf.user_id = $1
        `;
        let txnParams: any[] = [session.user.id];

        if (statusFilter && statusFilter !== 'all') {
          txnQuery += ` AND pf.status = $2`;
          txnParams.push(statusFilter);
        }

        txnQuery += ` ORDER BY pf.created_at DESC OFFSET $${txnParams.length + 1} LIMIT $${txnParams.length + 2}`;
        txnParams.push(offset, txnLimit);

        const txnResult = await query(txnQuery, txnParams);
        recentTransactions = txnResult.map((t: any) => ({
          id: t.id,
          trade_id: t.trade_id,
          profit_amount: parseFloat(t.profit_amount || 0),
          fee_amount: parseFloat(t.fee_amount || 0),
          status: t.status,
          created_at: t.created_at,
          paid_at: t.paid_at,
          billed_at: t.billed_at,
          stripe_invoice_id: t.stripe_invoice_id,
          pair: t.pair || 'Unknown',
        }));
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
             id,
             user_id,
             billing_period_start,
             billing_period_end,
             total_fees_amount,
             total_fees_count,
             stripe_invoice_id,
             stripe_charge_id,
             status,
             paid_at,
             created_at
           FROM fee_charge_history
           WHERE user_id = $1
           ORDER BY billing_period_end DESC
           OFFSET $2
           LIMIT $3`,
          [session.user.id, offset, chargeLimit]
        );

        chargeHistory = historyResult.map((h) => ({
          id: h.id,
          invoice_id: h.stripe_invoice_id || `charge-${h.id}`,
          stripe_invoice_id: h.stripe_invoice_id,
          stripe_charge_id: h.stripe_charge_id,
          billing_period_start: h.billing_period_start,
          billing_period_end: h.billing_period_end,
          total_fees: parseFloat(h.total_fees_amount || 0),
          trade_count: h.total_fees_count || 0,
          status: h.status || 'pending',
          paid_at: h.paid_at,
          created_at: h.created_at,
          // Generate Stripe invoice URL if we have invoice_id
          invoice_url: h.stripe_invoice_id
            ? `https://dashboard.stripe.com/invoices/${h.stripe_invoice_id}`
            : null,
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

    return NextResponse.json({
      summary: {
        total_profits: parseFloat(summary.total_profits || 0),
        total_fees_collected: parseFloat(summary.total_fees_collected || 0),
        pending_fees: parseFloat(summary.pending_fees || 0),
        billed_fees: parseFloat(summary.billed_fees || 0),
        total_trades: summary.total_trades || 0,
      },
      billing: billingStatus,
      recentTransactions,
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
