/**
 * Bot Instance Resource — REST endpoint
 * DELETE /api/bots/[id]
 *
 * Safeguards:
 *  - Must own the bot
 *  - Refuses deletion if bot is running (must stop first)
 *  - Refuses deletion if bot has open trades (must close first)
 *  - Cascades: deletes associated performance_fees rows (waived only) and bot data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: botId } = await context.params;

    // Verify ownership + fetch current state in one query
    const botRows = await query(
      `SELECT id, status FROM bot_instances WHERE id = $1 AND user_id = $2`,
      [botId, session.user.id]
    );

    if (botRows.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = botRows[0] as { id: string; status: string };

    if (['running', 'active'].includes(bot.status)) {
      return NextResponse.json(
        { error: 'Bot is running — stop it before deleting' },
        { status: 409 }
      );
    }

    // Refuse if open trades exist (user must close them first)
    const openTrades = await query(
      `SELECT COUNT(*) as cnt FROM trades WHERE bot_instance_id = $1 AND status = 'open'`,
      [botId]
    );
    const openCount = parseInt(String((openTrades[0] as any).cnt));
    if (openCount > 0) {
      return NextResponse.json(
        { error: `Bot has ${openCount} open trade(s) — close them before deleting` },
        { status: 409 }
      );
    }

    // Delete atomically
    await transaction(async (client) => {
      // Remove waived performance_fees (no billing impact)
      await client.query(
        `DELETE FROM performance_fees WHERE bot_instance_id = $1 AND status = 'waived'`,
        [botId]
      );

      // Nullify bot_instance_id on billed/paid fees (keep for audit)
      await client.query(
        `UPDATE performance_fees SET bot_instance_id = NULL WHERE bot_instance_id = $1`,
        [botId]
      );

      await client.query(
        `DELETE FROM bot_instances WHERE id = $1 AND user_id = $2`,
        [botId, session.user.id]
      );
    });

    logger.info('Bot deleted', { userId: session.user.id, botId });

    return NextResponse.json({ success: true, message: 'Bot deleted' });
  } catch (error) {
    logger.error('Bot DELETE failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Failed to delete bot' }, { status: 500 });
  }
}
