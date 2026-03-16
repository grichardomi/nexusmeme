/**
 * POST /api/bots/[id]/cancel-paper-trades
 *
 * Cancels all open paper trades for a bot before switching to live trading.
 * Paper trades have no real exchange positions, so they must not carry into
 * live mode where the close route would try to place real sell orders.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: botId } = await params;

    // Verify bot belongs to user and is in paper mode
    const botResult = await query(
      `SELECT id, config FROM bot_instances WHERE id = $1 AND user_id = $2`,
      [botId, session.user.id]
    );

    if (!botResult || botResult.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = botResult[0];
    const tradingMode = (bot.config?.tradingMode as string) || 'paper';

    if (tradingMode !== 'paper') {
      return NextResponse.json(
        { error: 'Bot is not in paper trading mode' },
        { status: 400 }
      );
    }

    // Cancel all open trades — mark as 'cancelled' with explanation
    const result = await query(
      `UPDATE trades
       SET status = 'closed',
           exit_time = NOW(),
           exit_price = price,
           profit_loss = 0,
           profit_loss_percent = 0,
           exit_reason = 'paper_to_live_transition'
       WHERE bot_instance_id = $1
         AND status = 'open'
       RETURNING id, pair`,
      [botId]
    );

    const cancelledCount = result?.length ?? 0;

    logger.info('Cancelled open paper trades for live transition', {
      botId,
      userId: session.user.id,
      cancelledCount,
      pairs: result?.map((r: any) => r.pair) ?? [],
    });

    return NextResponse.json({
      message: `Cancelled ${cancelledCount} open paper trade${cancelledCount !== 1 ? 's' : ''}`,
      cancelledCount,
      trades: result?.map((r: any) => ({ id: r.id, pair: r.pair })) ?? [],
    });
  } catch (error) {
    logger.error('Failed to cancel paper trades', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to cancel paper trades' },
      { status: 500 }
    );
  }
}
