import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/trades/delete-single
 * Archive a single closed trade (admin only)
 * Soft-delete: sets status='archived' instead of deleting the row.
 *
 * Request body:
 * {
 *   "botId": "bot-uuid",
 *   "tradeId": "trade-uuid"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = (session.user as any)?.role;
    if (userRole !== 'admin') {
      logger.warn('Non-admin user attempted to archive a trade', {
        userId: session.user.id,
        userRole,
      });
      return NextResponse.json(
        { error: 'Only admins can archive trades' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { botId, tradeId } = body;

    if (!botId || !tradeId) {
      return NextResponse.json(
        { error: 'botId and tradeId are required' },
        { status: 400 }
      );
    }

    // Only allow archiving closed trades
    const result = await query(
      `UPDATE trades SET status = 'archived'
       WHERE id = $1 AND bot_instance_id = $2 AND status = 'closed'
       RETURNING id`,
      [tradeId, botId]
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Trade not found or is not closed' },
        { status: 404 }
      );
    }

    logger.info('Single closed trade archived', {
      adminId: session.user.id,
      botId,
      tradeId,
    });

    return NextResponse.json({
      success: true,
      message: 'Trade archived successfully',
    });
  } catch (error) {
    logger.error(
      'Error archiving single trade',
      error instanceof Error ? error : null
    );

    return NextResponse.json(
      { error: 'Failed to archive trade' },
      { status: 500 }
    );
  }
}
