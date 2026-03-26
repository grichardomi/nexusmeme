import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getExchangeFeeRates } from '@/services/billing/fee-rate';

/**
 * POST /api/bots/trades/close-all
 * Close all open trades for a bot at current market prices
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { botId } = body;

    if (!botId) {
      return NextResponse.json({ error: 'Bot ID required' }, { status: 400 });
    }

    // Verify bot belongs to user
    const bot = await query(
      `SELECT id, exchange FROM bot_instances WHERE id = $1 AND user_id = $2`,
      [botId, session.user.id]
    );

    if (bot.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Get all open trades for this bot
    const openTrades = await query(
      `SELECT id, pair, entry_price, amount FROM trades
       WHERE bot_instance_id = $1 AND status = 'open'`,
      [botId]
    );

    if (openTrades.length === 0) {
      return NextResponse.json({
        message: 'No open trades to close',
        closedCount: 0,
      });
    }

    // Try to get current market prices for accurate exit prices
    let priceMap = new Map<string, number>();
    const pairs = [...new Set(openTrades.map((t: any) => t.pair))];

    try {
      const pricesResult = await query(
        `SELECT pair, last_price FROM market_data WHERE pair = ANY($1)`,
        [pairs]
      );
      priceMap = new Map(
        (pricesResult || []).map((p: any) => [p.pair, parseFloat(p.last_price)])
      );
    } catch (err) {
      logger.warn('Could not fetch current market prices for closing trades', {
        botId,
        pairs,
      });
      // Fall back to using entry prices if market data unavailable
    }

    const exchangeKey = 'binance';
    const feeRates = await getExchangeFeeRates(exchangeKey);
    const feeRate = feeRates.taker_fee;

    // Close all trades atomically
    const closedTrades: string[] = [];
    const closedCount = await transaction(async (client) => {
      let count = 0;
      for (const trade of openTrades) {
        const exitPrice = priceMap.get(trade.pair) || parseFloat(trade.entry_price);
        const entryPrice = parseFloat(trade.entry_price);
        const quantity = parseFloat(trade.amount);

        const grossProfitLoss = (exitPrice - entryPrice) * quantity;
        const entryFee = entryPrice * quantity * feeRate;
        const exitFee = exitPrice * quantity * feeRate;
        const netProfitLoss = grossProfitLoss - entryFee - exitFee;
        const profitLossPercent = entryPrice > 0 && quantity > 0
          ? (netProfitLoss / (entryPrice * quantity)) * 100
          : 0;

        const totalFee = entryFee + exitFee;
        await client.query(
          `UPDATE trades
           SET status = 'closed',
               exit_price = $1,
               exit_time = NOW(),
               profit_loss = $2,
               profit_loss_percent = $3,
               fee = $4,
               exit_fee = $5,
               exit_reason = 'manual_close_all'
           WHERE id = $6`,
          [exitPrice, netProfitLoss, profitLossPercent, totalFee, exitFee, trade.id]
        );

        count++;
        closedTrades.push(trade.pair);

        logger.info('Closed trade via close-all', {
          tradeId: trade.id,
          pair: trade.pair,
          exitPrice,
          grossProfitLoss,
          entryFee,
          exitFee,
          netProfitLoss,
        });
      }
      return count;
    });

    return NextResponse.json({
      message: `Closed ${closedCount} out of ${openTrades.length} open trades`,
      closedCount,
      totalTrades: openTrades.length,
      closedPairs: closedTrades,
    });
  } catch (error) {
    logger.error('Error closing all trades', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to close trades' },
      { status: 500 }
    );
  }
}
