import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/tickets/unread-counts
 * Get unread reply counts for all tickets (admin only)
 * Returns a map of ticket IDs to unread reply counts
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get unread counts for all tickets
    const result = await query<{
      ticket_id: string;
      unread_count: number | string;
    }>(
      `SELECT ticket_id, COUNT(*) as unread_count
       FROM support_ticket_replies
       WHERE unread_by_admin = TRUE AND is_internal_note = FALSE
       GROUP BY ticket_id`,
      []
    );

    // Transform into a map of ticket_id -> count
    const unreadCounts: Record<string, number> = {};
    for (const row of result) {
      unreadCounts[row.ticket_id] = parseInt(String(row.unread_count), 10);
    }

    logger.info('Admin fetched ticket unread counts', {
      userId: session.user.id,
      ticketsWithUnread: Object.keys(unreadCounts).length,
    });

    return NextResponse.json(unreadCounts);
  } catch (error) {
    logger.error('Failed to fetch admin ticket unread counts', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
