/**
 * POST /api/bots/trades/close — thin validation wrapper around closeTrade() service.
 *
 * All business logic lives in src/services/trading/close-trade.ts so the orchestrator
 * can call it directly without an HTTP round-trip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { closeTrade } from '@/services/trading/close-trade';
import { z } from 'zod';

const tradeCloseSchema = z.object({
  botInstanceId: z.string().uuid('Bot instance ID must be a valid UUID'),
  tradeId: z.string({ required_error: 'Trade ID is required' }),
  pair: z.string({ required_error: 'Trading pair is required' }),
  exitTime: z.string().datetime('Exit time must be ISO 8601 datetime').refine((val) => {
    const t = new Date(val).getTime();
    const now = Date.now();
    return Math.abs(now - t) < 5 * 60 * 1000;
  }, 'Exit time must be within 5 minutes of server time'),
  exitPrice: z.number().positive('Exit price must be positive'),
  profitLoss: z.number({ required_error: 'Profit/loss amount is required' }),
  profitLossPercent: z.number({ required_error: 'Profit/loss percent is required' }),
  exitReason: z.string().optional(),
  entryPrice: z.number().positive().optional(),
  entryFee: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    logger.info('Trade close request received', {
      botInstanceId: body.botInstanceId,
      tradeId: body.tradeId,
      pair: body.pair,
      exitPrice: body.exitPrice,
    });

    const validated = tradeCloseSchema.safeParse(body);
    if (!validated.success) {
      const errors = validated.error.flatten().fieldErrors;
      logger.warn('Invalid trade close request', { errors, bodyKeys: Object.keys(body) });
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    const result = await closeTrade(validated.data);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, reason: result.reason, profitLossPercent: result.profitLossPercent },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.alreadyClosed ? 'Trade already closed' : 'Trade closed successfully',
        tradeId: result.tradeId,
        exitPrice: result.exitPrice,
        profitLoss: result.profitLoss,
        profitLossPercent: result.profitLossPercent,
        tradingMode: result.tradingMode,
        paperTrading: result.paperTrading,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Trade close endpoint error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Failed to process trade close' }, { status: 500 });
  }
}
