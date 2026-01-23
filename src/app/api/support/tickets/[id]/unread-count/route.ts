import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/support/tickets/[id]/unread-count
 * Get the count of unread replies for a ticket
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify user owns this ticket
    const ticketResult = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM support_tickets WHERE id = $1`,
      [id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (ticketResult[0].user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Count unread replies (excluding internal notes)
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM support_ticket_replies
       WHERE ticket_id = $1 AND unread_by_user = TRUE AND is_internal_note = FALSE`,
      [id]
    );

    const unreadCount = countResult[0]?.count ?? 0;

    return NextResponse.json({ unreadCount });
  } catch (error) {
    logger.error('Failed to get unread count', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
