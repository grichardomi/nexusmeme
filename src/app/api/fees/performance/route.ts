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
 * CSV Export Handler
 * Exports last 2 years of performance fees as CSV
 */
async function handleCSVExport(userId: string): Promise<Response> {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const fees = await query(
      `SELECT
         pf.created_at,
         pf.pair,
         pf.profit_amount,
         pf.fee_amount,
         pf.fee_rate,
         pf.status,
         pf.paid_at,
         pf.payment_reference
       FROM performance_fees pf
       WHERE pf.user_id = $1
         AND pf.created_at >= $2
       ORDER BY pf.created_at DESC`,
      [userId, twoYearsAgo.toISOString()]
    );

    // Build CSV
    const headers = ['Date', 'Pair', 'Profit', 'Fee Rate', 'Fee Amount', 'Status', 'Paid Date', 'Charge ID'];
    const rows = fees.map((f: any) => [
      new Date(f.created_at).toLocaleDateString('en-US'),
      f.pair || 'N/A',
      `$${parseFloat(f.profit_amount || 0).toFixed(2)}`,
      `${((parseFloat(f.fee_rate_applied ?? f.fee_rate) || 0) * 100).toFixed(2)}%`,
      `$${parseFloat(f.fee_amount || 0).toFixed(2)}`,
      f.status,
      f.paid_at ? new Date(f.paid_at).toLocaleDateString('en-US') : 'N/A',
      f.payment_reference || 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const filename = `performance-fees-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    logger.error('CSV export failed', error instanceof Error ? error : null, { userId });
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/**
 * CSV Export Handler for Billing History
 * Exports last 2 years of billing charges as CSV
 */
async function handleChargesCSVExport(userId: string): Promise<Response> {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const charges = await query(
      `SELECT
         billing_period_start,
         billing_period_end,
         total_fees_amount,
         total_fees_count,
         status,
         payment_reference,
         paid_at,
         created_at
       FROM fee_charge_history
       WHERE user_id = $1
         AND billing_period_end >= $2
       ORDER BY billing_period_end DESC`,
      [userId, twoYearsAgo.toISOString().split('T')[0]]
    );

    // Build CSV
    const headers = ['Billing Period Start', 'Billing Period End', 'Amount', 'Profitable Trades', 'Status', 'Charge ID', 'Paid Date'];
    const rows = charges.map((c: any) => [
      new Date(c.billing_period_start).toLocaleDateString('en-US'),
      new Date(c.billing_period_end).toLocaleDateString('en-US'),
      `$${parseFloat(c.total_fees_amount || 0).toFixed(2)}`,
      c.total_fees_count,
      c.status,
      c.payment_reference || 'N/A',
      c.paid_at ? new Date(c.paid_at).toLocaleDateString('en-US') : 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const filename = `billing-history-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    logger.error('Billing history CSV export failed', error instanceof Error ? error : null, { userId });
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/**
 * GET /api/fees/performance
 * Get user's performance fee summary with pagination support
 *
 * Query params:
 * - type: 'summary' | 'transactions' | 'charges' | 'export' | 'export-charges' (defaults to 'summary')
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

    // CSV export requests
    if (type === 'export') {
      return handleCSVExport(session.user.id);
    }
    if (type === 'export-charges') {
      return handleChargesCSVExport(session.user.id);
    }

    let summary: any = {
      total_profits: 0,
      total_fees_collected: 0,
      pending_fees: 0,
      billed_fees: 0,
      uncollectible_fees: 0,
      profitable_trades: 0,
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
        const statusFilter = url.searchParams.get('status');
        const botFilter = url.searchParams.get('bot');
        const fromParam = url.searchParams.get('from');

        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const windowStart = fromParam ? new Date(fromParam) : twoYearsAgo;

        // Get total count with optional filters and window
        let countQuery = `SELECT COUNT(*) as total FROM performance_fees WHERE user_id = $1 AND created_at >= $2`;
        let countParams: any[] = [session.user.id, windowStart.toISOString()];

        if (statusFilter && statusFilter !== 'all') {
          countQuery += ` AND status = $${countParams.length + 1}`;
          countParams.push(statusFilter);
        }
        if (botFilter && botFilter !== 'all') {
          countQuery += ` AND bot_instance_id = $${countParams.length + 1}`;
          countParams.push(botFilter);
        }

        const countResult = await query(countQuery, countParams);
        transactionTotal = parseInt(countResult[0]?.total || 0);

        // Fetch paginated transactions with 2-year window and optional status filter
        let txnQuery = `
          SELECT
            pf.id,
            pf.trade_id,
            pf.bot_instance_id,
            pf.profit_amount,
            pf.fee_amount,
            pf.fee_rate_applied,
            pf.status,
            pf.created_at,
            pf.paid_at,
            pf.billed_at,
            pf.pair,
            COALESCE(bi.config->>'name', 'Bot ' || LEFT(pf.bot_instance_id::text, 8)) as bot_name,
            bi.trading_mode as bot_trading_mode
          FROM performance_fees pf
          LEFT JOIN bot_instances bi ON bi.id = pf.bot_instance_id
          WHERE pf.user_id = $1
            AND pf.created_at >= $2
        `;
        let txnParams: any[] = [session.user.id, windowStart.toISOString()];

        if (statusFilter && statusFilter !== 'all') {
          txnQuery += ` AND pf.status = $${txnParams.length + 1}`;
          txnParams.push(statusFilter);
        }
        if (botFilter && botFilter !== 'all') {
          txnQuery += ` AND pf.bot_instance_id = $${txnParams.length + 1}`;
          txnParams.push(botFilter);
        }

        txnQuery += ` ORDER BY pf.created_at DESC OFFSET $${txnParams.length + 1} LIMIT $${txnParams.length + 2}`;
        txnParams.push(offset, txnLimit);

        const txnResult = await query(txnQuery, txnParams);
        recentTransactions = txnResult.map((t: any) => ({
          id: t.id,
          trade_id: t.trade_id,
          bot_instance_id: t.bot_instance_id,
          bot_name: t.bot_name,
          bot_trading_mode: t.bot_trading_mode,
          profit_amount: parseFloat(t.profit_amount || 0),
          fee_amount: parseFloat(t.fee_amount || 0),
          fee_rate_applied: t.fee_rate_applied != null ? parseFloat(String(t.fee_rate_applied)) : null,
          status: t.status,
          created_at: t.created_at,
          exit_time: t.created_at || null, // created_at is set at trade close time
          paid_at: t.paid_at,
          billed_at: t.billed_at,
          pair: t.pair,
        }));
      } catch (err) {
        logger.warn('Could not fetch recent transactions', {
          userId: session.user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fetch billing status — derived from USDC invoices (primary payment method)
    try {
      const overdueResult = await query(
        `SELECT COUNT(*) as overdue_count
         FROM usdc_payment_references
         WHERE user_id = $1
           AND status = 'pending'
           AND expires_at < NOW()`,
        [session.user.id]
      );
      const suspendedResult = await query(
        `SELECT COUNT(*) as suspended_count
         FROM bot_instances
         WHERE user_id = $1 AND status = 'paused'`,
        [session.user.id]
      );

      const overdueCount = parseInt(overdueResult[0]?.overdue_count || 0);
      const suspendedCount = parseInt(suspendedResult[0]?.suspended_count || 0);

      if (overdueCount > 0 && suspendedCount > 0) {
        billingStatus = { billing_status: 'suspended', failed_charge_attempts: overdueCount, pause_trading_on_failed_charge: true };
      } else if (overdueCount > 0) {
        billingStatus = { billing_status: 'past_due', failed_charge_attempts: overdueCount, pause_trading_on_failed_charge: false };
      }
      // else stays 'active'
    } catch (err) {
      logger.warn('Could not fetch billing status', {
        userId: session.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fetch charge history if requested or on initial load
    if (type === 'summary' || type === 'charges') {
      try {
        const chargesFromParam = url.searchParams.get('from');
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const chargesWindowStart = chargesFromParam ? new Date(chargesFromParam) : twoYearsAgo;
        const twoYearsAgoDate = chargesWindowStart.toISOString().split('T')[0];

        // Get total count with 2-year filter
        const countResult = await query(
          `SELECT COUNT(*) as total FROM fee_charge_history WHERE user_id = $1 AND billing_period_end >= $2`,
          [session.user.id, twoYearsAgoDate]
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
             coinbase_charge_id,
             status,
             paid_at,
             created_at
           FROM fee_charge_history
           WHERE user_id = $1
             AND billing_period_end >= $2
           ORDER BY billing_period_end DESC
           OFFSET $3
           LIMIT $4`,
          [session.user.id, twoYearsAgoDate, offset, chargeLimit]
        );

        chargeHistory = historyResult.map((h: any) => {
          const paymentRef = h.stripe_invoice_id || h.coinbase_charge_id || h.stripe_charge_id;
          return {
            id: h.id,
            invoice_id: paymentRef || `charge-${h.id}`,
            payment_reference: paymentRef || null,
            billing_period_start: h.billing_period_start,
            billing_period_end: h.billing_period_end,
            total_fees: parseFloat(h.total_fees_amount || 0),
            trade_count: h.total_fees_count || 0,
            status: h.status || 'pending',
            paid_at: h.paid_at,
            created_at: h.created_at,
            invoice_url: null, // USDC invoices paid via /dashboard/billing directly
          };
        });
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
        uncollectible_fees: parseFloat(summary.uncollectible_fees || 0),
        profitable_trades: summary.profitable_trades || 0,
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
          profitable_trades: 0,
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
