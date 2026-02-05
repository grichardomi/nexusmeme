import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getCached, setCached } from '@/lib/redis';
import { exchangeFeesConfig } from '@/config/environment';

/**
 * CSV Export Handler for Trade History
 * Exports last 2 years of trades as CSV with optional status filter
 */
async function handleTradesCSVExport(userId: string, statusFilter: string = 'all', botId: string | null = null): Promise<Response> {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // Build WHERE clause for status filter
    let statusWhere = '';
    if (statusFilter === 'open') {
      statusWhere = `AND t.status = 'open'`;
    } else if (statusFilter === 'closed') {
      statusWhere = `AND t.status = 'closed'`;
    } else if (statusFilter === 'profitable') {
      statusWhere = `AND t.status = 'closed' AND t.profit_loss > 0`;
    } else if (statusFilter === 'losses') {
      statusWhere = `AND t.status = 'closed' AND t.profit_loss < 0`;
    }

    const trades = await query(
      `SELECT
         t.pair,
         t.entry_time,
         t.exit_time,
         t.price AS entry_price,
         COALESCE(t.exit_price, t.price) AS exit_price,
         t.amount AS quantity,
         t.profit_loss,
         t.profit_loss_percent,
         t.status,
         t.exit_reason
       FROM trades t
       INNER JOIN bot_instances b ON t.bot_instance_id = b.id
       WHERE b.user_id = $1
         AND ($3::uuid IS NULL OR t.bot_instance_id = $3)
         AND t.entry_time >= $2
         ${statusWhere}
       ORDER BY t.entry_time DESC`,
      [userId, twoYearsAgo.toISOString(), botId || null]
    );

    // Build CSV
    const headers = ['Pair', 'Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'Quantity', 'P&L', 'P&L %', 'Status', 'Exit Reason'];
    const rows = trades.map((t: any) => [
      t.pair,
      new Date(t.entry_time).toLocaleString('en-US'),
      t.exit_time ? new Date(t.exit_time).toLocaleString('en-US') : 'Open',
      `$${parseFloat(t.entry_price).toFixed(2)}`,
      t.exit_price ? `$${parseFloat(t.exit_price).toFixed(2)}` : 'N/A',
      parseFloat(t.quantity).toFixed(6),
      t.profit_loss ? `$${parseFloat(t.profit_loss).toFixed(2)}` : 'N/A',
      t.profit_loss_percent ? `${parseFloat(t.profit_loss_percent).toFixed(2)}%` : 'N/A',
      t.status,
      t.exit_reason || 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const filename = `trades-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    logger.error('Trades CSV export failed', error instanceof Error ? error : null, { userId });
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/**
 * GET /api/trades
 * Get all trades for the current user's bots
 * Query params:
 * - type: 'list' | 'export' (default: 'list')
 * - botId: Filter by bot ID
 * - status: 'all' | 'open' | 'closed' | 'profitable' | 'losses'
 * - offset: Pagination offset
 * - limit: Pagination limit
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'list';
    const botId = searchParams.get('botId');
    const statusFilter = searchParams.get('status') || 'all';

    // CSV export request
    if (type === 'export') {
      return handleTradesCSVExport(session.user.id, statusFilter, botId);
    }

    // Support both offset-based and limit-based pagination
    let offset: number;
    let limit: number;

    if (searchParams.has('offset') && searchParams.has('limit')) {
      // New offset-based pagination
      offset = parseInt(searchParams.get('offset') || '0', 10);
      limit = parseInt(searchParams.get('limit') || '20', 10);
    } else {
      // Legacy limit-based pagination for backwards compatibility
      offset = 0;
      limit = parseInt(searchParams.get('limit') || '50', 10);
    }

    // 2-year viewing window
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // Create cache key including status filter
    const cacheKey = botId
      ? `trades:user:${session.user.id}:bot:${botId}:status:${statusFilter}:offset:${offset}:limit:${limit}`
      : `trades:user:${session.user.id}:allbots:status:${statusFilter}:offset:${offset}:limit:${limit}`;

    // Check cache first (TTL: 3 seconds - trades change frequently)
    interface CachedTrade {
      id: string;
      botId: string;
      pair: string;
      entryPrice: number;
      exitPrice: number | null;
      quantity: number;
      entryTime: string;
      exitTime: string | null;
      profitLoss: number | null;
      profitLossPercent: number | null;
      profitLossNet: number | null;
      profitLossPercentNet: number | null;
      status: string;
      exitReason: string | null;
      pyramidLevels: any | null;
    }

    interface TradeResponse {
      trades: CachedTrade[];
      stats: {
        totalTrades: number;
        openTrades: number;
        closedTrades: number;
        completedTrades: number;
        totalProfit: number;
        winRate: number;
        averageReturn: number;
      };
      total?: number;
    }

    const cachedResponse = await getCached<TradeResponse>(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse);
    }

    // Build WHERE clause for status filter
    let statusWhere = '';
    if (statusFilter === 'open') {
      statusWhere = `AND t.status = 'open'`;
    } else if (statusFilter === 'closed') {
      statusWhere = `AND t.status = 'closed'`;
    } else if (statusFilter === 'profitable') {
      statusWhere = `AND t.status = 'closed' AND t.profit_loss > 0`;
    } else if (statusFilter === 'losses') {
      statusWhere = `AND t.status = 'closed' AND t.profit_loss < 0`;
    }

    // Fetch trades with single JOIN query (optimized - no N+1 pattern)
    // This replaces the two-query approach: SELECT bot_ids + SELECT trades
    // Now we do it in one query with a JOIN
    let trades;
    try {
      // Try with exit_price column (if migration has been applied)
      trades = await query(
        `SELECT
          t.id,
          t.bot_instance_id,
          t.pair,
          t.price AS entry_price,
          COALESCE(t.exit_price, t.price) AS exit_price,
          t.amount AS quantity,
          t.entry_time,
          t.exit_time,
          t.profit_loss,
          t.profit_loss_percent,
          t.status,
          t.exit_reason,
          t.pyramid_levels,
          t.fee,
          b.config ->> 'initialCapital' AS initial_capital,
          b.exchange
        FROM trades t
        INNER JOIN bot_instances b ON t.bot_instance_id = b.id
        WHERE b.user_id = $1
          AND ($2::uuid IS NULL OR t.bot_instance_id = $2)
          AND t.entry_time >= $5
          ${statusWhere}
        ORDER BY t.exit_time DESC, t.entry_time DESC
        LIMIT $3 OFFSET $4`,
        [session.user.id, botId || null, limit, offset, twoYearsAgo.toISOString()]
      );
    } catch (queryError) {
      // Fallback if exit_price, exit_reason, or pyramid_levels columns don't exist yet
      if (
        (queryError as any)?.message?.includes('exit_price') ||
        (queryError as any)?.message?.includes('exit_reason') ||
        (queryError as any)?.message?.includes('pyramid_levels')
      ) {
        logger.debug('Some columns not found, using fallback selection');
        trades = await query(
          `SELECT
            t.id,
            t.bot_instance_id,
            t.pair,
            t.price AS entry_price,
            t.price AS exit_price,
            t.amount AS quantity,
            t.entry_time,
            t.exit_time,
            t.profit_loss,
            t.profit_loss_percent,
            t.status,
            NULL::text AS exit_reason,
            '[]'::jsonb AS pyramid_levels,
            NULL::numeric AS fee,
            b.config ->> 'initialCapital' AS initial_capital,
            b.exchange
          FROM trades t
          INNER JOIN bot_instances b ON t.bot_instance_id = b.id
          WHERE b.user_id = $1
            AND ($2::uuid IS NULL OR t.bot_instance_id = $2)
            AND t.entry_time >= $5
            ${statusWhere}
          ORDER BY t.exit_time DESC, t.entry_time DESC
          LIMIT $3 OFFSET $4`,
          [session.user.id, botId || null, limit, offset, twoYearsAgo.toISOString()]
        );
      } else {
        throw queryError;
      }
    }

    // Get total count for pagination with filters
    const countResult = await query(
      `SELECT COUNT(*) as count
      FROM trades t
      INNER JOIN bot_instances b ON t.bot_instance_id = b.id
      WHERE b.user_id = $1
        AND ($2::uuid IS NULL OR t.bot_instance_id = $2)
        AND t.entry_time >= $3
        ${statusWhere}`,
      [session.user.id, botId || null, twoYearsAgo.toISOString()]
    );
    const total = parseInt(String(countResult[0]?.count || '0'), 10);

    // Handle bot not found case
    if (botId && trades.length === 0 && offset === 0) {
      // Verify the bot exists and belongs to the user
      const botCheck = await query(
        `SELECT id FROM bot_instances WHERE id = $1 AND user_id = $2`,
        [botId, session.user.id]
      );

      if (botCheck.length === 0) {
        return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
      }

      // Bot exists but has no trades
      const emptyResponse: TradeResponse = {
        trades: [],
        stats: {
          totalTrades: 0,
          openTrades: 0,
          closedTrades: 0,
          completedTrades: 0,
          totalProfit: 0,
          winRate: 0,
          averageReturn: 0,
        },
        total: 0,
      };
      await setCached(cacheKey, emptyResponse, 3);
      return NextResponse.json(emptyResponse);
    }

    if (trades.length === 0) {
      const emptyResponse: TradeResponse = {
        trades: [],
        stats: {
          totalTrades: 0,
          openTrades: 0,
          closedTrades: 0,
          completedTrades: 0,
          totalProfit: 0,
          winRate: 0,
          averageReturn: 0,
        },
        total,
      };
      await setCached(cacheKey, emptyResponse, 3);
      return NextResponse.json(emptyResponse);
    }

    // Calculate stats (using net P&L for accuracy after fees)
    const openTrades = trades.filter((t: any) => t.status === 'open');
    const closedTrades = trades.filter((t: any) => t.status === 'closed' || t.exit_price);
    const completedTrades = closedTrades;

    // For stats, use net P&L (already includes fee deduction from close endpoint)
    // For open trades, profit_loss is gross, but stats should show real profitability
    const profitableTrades = completedTrades.filter((t: any) => (Number(t.profit_loss) || 0) > 0);
    const totalProfit = completedTrades.reduce((sum: number, t: any) => sum + (Number(t.profit_loss) || 0), 0);
    const avgReturn = completedTrades.length > 0
      ? completedTrades.reduce((sum: number, t: any) => sum + (Number(t.profit_loss_percent) || 0), 0) /
        completedTrades.length
      : 0;

    const stats = {
      totalTrades: trades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      completedTrades: completedTrades.length,
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      winRate: completedTrades.length > 0
        ? parseFloat(((profitableTrades.length / completedTrades.length) * 100).toFixed(2))
        : 0,
      averageReturn: parseFloat(avgReturn.toFixed(2)),
    };

    logger.info('Fetched trades', {
      userId: session.user.id,
      botCount: new Set((trades as any[]).map((t: any) => t.bot_id)).size,
      tradeCount: trades.length,
      cached: false,
    });

    const mappedTrades = trades.map((t: any) => {
      const entryPrice = parseFloat(t.entry_price);
      const rawQuantity = parseFloat(t.quantity);
      const exitPrice = t.exit_price ? parseFloat(t.exit_price) : null;
      const initialCapital = t.initial_capital ? parseFloat(t.initial_capital) : null;
      const exchange = t.exchange || 'kraken';
      const riskPercent = 0.02;

      const fallbackQuantity =
        initialCapital && initialCapital > 0 && entryPrice
          ? Number(((initialCapital * riskPercent) / entryPrice).toFixed(8))
          : null;

      const useFallback = rawQuantity === 1 && fallbackQuantity && fallbackQuantity > 0;
      const quantity = useFallback ? fallbackQuantity : rawQuantity;

      let profitLoss = t.profit_loss ? parseFloat(t.profit_loss) : null;
      let profitLossPercent = t.profit_loss_percent ? parseFloat(t.profit_loss_percent) : null;

      // When correcting legacy quantity, prefer stored P&L (scaled) over recompute,
      // because some legacy rows may have placeholder exit prices.
      if (useFallback) {
        if (profitLoss !== null) {
          profitLoss = Number((profitLoss * (quantity / rawQuantity)).toFixed(2));
        } else if (exitPrice !== null) {
          const pnl = (exitPrice - entryPrice) * quantity;
          profitLoss = Number(pnl.toFixed(2));
        }

        if (profitLossPercent === null && exitPrice !== null) {
          profitLossPercent = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
        }
      }

      // If no P&L recorded but we have exit price, compute it using current quantity
      if (profitLoss === null && exitPrice !== null) {
        const pnl = (exitPrice - entryPrice) * quantity;
        profitLoss = Number(pnl.toFixed(2));
      }

      if (profitLossPercent === null && exitPrice !== null) {
        profitLossPercent = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      }

      // Calculate net P&L (after fees)
      let profitLossNet: number | null = null;
      let profitLossPercentNet: number | null = null;

      if (t.status === 'open' && exitPrice !== null) {
        // For open trades: deduct estimated exit fee
        const feeRate = exchange.toLowerCase() === 'binance'
          ? exchangeFeesConfig.binanceTakerFeeDefault
          : exchangeFeesConfig.krakenTakerFeeDefault;

        const exitPositionValue = exitPrice * quantity;
        const estimatedExitFee = exitPositionValue * feeRate;

        profitLossNet = profitLoss !== null ? Number((profitLoss - estimatedExitFee).toFixed(2)) : null;
        profitLossPercentNet = profitLossPercent !== null
          ? Number((profitLossPercent - ((estimatedExitFee / (entryPrice * quantity)) * 100)).toFixed(2))
          : null;
      } else if (t.status === 'closed') {
        // For closed trades: fees already deducted in profitLoss (from close endpoint)
        profitLossNet = profitLoss;
        profitLossPercentNet = profitLossPercent;
      }

      return {
        id: t.id,
        botId: t.bot_instance_id,
        pair: t.pair,
        entryPrice,
        exitPrice,
        quantity,
        entryTime: t.entry_time,
        exitTime: t.exit_time,
        profitLoss,
        profitLossPercent,
        profitLossNet,
        profitLossPercentNet,
        status: t.status,
        exitReason: t.exit_reason || null,
        pyramidLevels: t.pyramid_levels || null,
      };
    });

    const response: TradeResponse = {
      trades: mappedTrades,
      stats,
      total,
    };

    // Cache response (3 second TTL - trades can change frequently)
    await setCached(cacheKey, response, 3);

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Error fetching trades', error instanceof Error ? error : null);

    // If trades table doesn't exist yet, return empty stats
    if (error instanceof Error && error.message.includes('does not exist')) {
      return NextResponse.json({
        trades: [],
        stats: {
          totalTrades: 0,
          openTrades: 0,
          closedTrades: 0,
          completedTrades: 0,
          totalProfit: 0,
          winRate: 0,
          averageReturn: 0,
        },
        total: 0,
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}
