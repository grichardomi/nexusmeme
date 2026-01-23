import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/trades/delete-closed
 * Delete all closed trades for a bot (admin only)
 *
 * Request body:
 * {
 *   "botId": "bot-uuid"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authentication
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const userRole = (session.user as any)?.role;
    if (userRole !== 'admin') {
      logger.warn('Non-admin user attempted to delete closed trades', {
        userId: session.user.id,
        userRole,
      });
      return NextResponse.json(
        { error: 'Only admins can delete trades' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { botId } = body;

    if (!botId) {
      return NextResponse.json(
        { error: 'botId is required' },
        { status: 400 }
      );
    }

    logger.info('Admin deleting closed trades', {
      adminId: session.user.id,
      botId,
    });

    // Get count of closed trades before deletion
    const countBefore = await query(
      `SELECT COUNT(*) as count FROM trades
       WHERE bot_instance_id = $1 AND status = 'closed'`,
      [botId]
    );
    const closedCount = parseInt(String(countBefore[0]?.count || '0'), 10);

    if (closedCount === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No closed trades to delete',
      });
    }

    // Delete all closed trades for this bot
    const result = await query(
      `DELETE FROM trades
       WHERE bot_instance_id = $1 AND status = 'closed'
       RETURNING id`,
      [botId]
    );

    const deletedCount = result.length;

    logger.info('Closed trades deleted', {
      adminId: session.user.id,
      botId,
      deletedCount,
      targetCount: closedCount,
    });

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} closed trades`,
    });
  } catch (error) {
    logger.error(
      'Error deleting closed trades',
      error instanceof Error ? error : null
    );

    return NextResponse.json(
      { error: 'Failed to delete closed trades' },
      { status: 500 }
    );
  }
}
