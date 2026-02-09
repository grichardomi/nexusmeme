import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/trades/delete-closed
 * Archive all closed trades for a bot (admin only)
 * Soft-delete: sets status='archived' instead of deleting rows.
 * Data preserved for performance fees, tax reporting, and audit trail.
 *
 * Request body:
 * {
 *   "botId": "bot-uuid"
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
      logger.warn('Non-admin user attempted to archive closed trades', {
        userId: session.user.id,
        userRole,
      });
      return NextResponse.json(
        { error: 'Only admins can archive trades' },
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

    logger.info('Admin archiving closed trades', {
      adminId: session.user.id,
      botId,
    });

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
        message: 'No closed trades to archive',
      });
    }

    // Soft-delete: archive instead of delete
    const result = await query(
      `UPDATE trades SET status = 'archived'
       WHERE bot_instance_id = $1 AND status = 'closed'
       RETURNING id`,
      [botId]
    );

    const archivedCount = result.length;

    logger.info('Closed trades archived', {
      adminId: session.user.id,
      botId,
      archivedCount,
      targetCount: closedCount,
    });

    return NextResponse.json({
      success: true,
      deletedCount: archivedCount,
      message: `Successfully archived ${archivedCount} closed trades`,
    });
  } catch (error) {
    logger.error(
      'Error archiving closed trades',
      error instanceof Error ? error : null
    );

    return NextResponse.json(
      { error: 'Failed to archive closed trades' },
      { status: 500 }
    );
  }
}
