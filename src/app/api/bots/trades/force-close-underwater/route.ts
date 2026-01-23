/**
 * Force Close Underwater Trades Endpoint
 * POST /api/bots/trades/force-close-underwater
 *
 * Immediately closes all trades that are underwater (negative P&L)
 * Bypasses the normal 2-5 minute timeout to provide manual control
 *
 * Request body:
 * {
 *   "pair": "ETH/USD" (optional - close only specific pair),
 *   "botInstanceId": "uuid" (optional - close only specific bot),
 *   "dryRun": true (optional - show what would be closed without actually closing)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const forceCloseSchema = z.object({
  pair: z.string().optional(),
  botInstanceId: z.string().uuid().optional(),
  dryRun: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { pair, botInstanceId, dryRun } = forceCloseSchema.parse(body);

    logger.info('Force close underwater trades request', {
      pair,
      botInstanceId,
      dryRun,
    });

    // Build WHERE clause based on filters
    let whereClause = 't.status = \'open\' AND (t.profit_loss_percent < 0 OR (t.profit_loss < 0 AND t.profit_loss_percent IS NULL))';
    const params: any[] = [];

    if (pair) {
      whereClause += ' AND t.pair = $1';
      params.push(pair);
    }

    if (botInstanceId) {
      whereClause += (pair ? ' AND' : ' AND') + ` t.bot_instance_id = $${params.length + 1}`;
      params.push(botInstanceId);
    }

    // Fetch all underwater open trades
    const underwaterTrades = await query<any>(
      `SELECT
        t.id,
        t.bot_instance_id,
        t.pair,
        t.price as entry_price,
        t.amount as quantity,
        t.entry_time,
        t.profit_loss,
        t.profit_loss_percent,
        b.user_id
      FROM trades t
      INNER JOIN bot_instances b ON t.bot_instance_id = b.id
      WHERE ${whereClause}
      ORDER BY t.profit_loss_percent ASC`,
      params
    );

    logger.info('Found underwater trades to close', {
      count: underwaterTrades.length,
      dryRun,
      trades: underwaterTrades.map(t => ({
        id: t.id,
        pair: t.pair,
        profitLossPct: t.profit_loss_percent,
      })),
    });

    if (dryRun) {
      // Return what would be closed without actually closing
      return NextResponse.json({
        success: true,
        dryRun: true,
        tradeCount: underwaterTrades.length,
        trades: underwaterTrades.map(t => ({
          id: t.id,
          pair: t.pair,
          entryPrice: parseFloat(String(t.entry_price)),
          quantity: parseFloat(String(t.quantity)),
          profitLoss: parseFloat(String(t.profit_loss)),
          profitLossPct: parseFloat(String(t.profit_loss_percent)),
        })),
      });
    }

    // Close each underwater trade
    let closedCount = 0;
    const closedTrades: Array<{ id: string; pair: string; profitLossPct: number }> = [];

    for (const trade of underwaterTrades) {
      try {
        const currentPrice = parseFloat(String(trade.entry_price)); // Use entry price as exit price for simplicity
        const profitLoss = parseFloat(String(trade.profit_loss)) || 0;
        const profitLossPercent = parseFloat(String(trade.profit_loss_percent)) || 0;

        // Close the trade via the API endpoint
        const closeResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bots/trades/close`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botInstanceId: trade.bot_instance_id,
              tradeId: trade.id,
              pair: trade.pair,
              exitTime: new Date().toISOString(),
              exitPrice: currentPrice,
              profitLoss,
              profitLossPercent,
              exitReason: 'force_close_underwater',
            }),
          }
        );

        if (closeResponse.ok) {
          logger.info('Force closed underwater trade', {
            tradeId: trade.id,
            pair: trade.pair,
            profitLossPct: profitLossPercent.toFixed(2),
          });
          closedTrades.push({
            id: trade.id,
            pair: trade.pair,
            profitLossPct: profitLossPercent,
          });
          closedCount++;
        } else {
          const errorText = await closeResponse.text();
          logger.error('Failed to close underwater trade', new Error(errorText), {
            tradeId: trade.id,
            pair: trade.pair,
            status: closeResponse.status,
          });
        }
      } catch (error) {
        logger.error('Error force closing trade', error instanceof Error ? error : null, {
          tradeId: trade.id,
          pair: trade.pair,
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      totalUnderwaterTrades: underwaterTrades.length,
      closedCount,
      closedTrades,
    });
  } catch (error) {
    logger.error('Force close underwater trades error', error instanceof Error ? error : null);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request parameters',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
