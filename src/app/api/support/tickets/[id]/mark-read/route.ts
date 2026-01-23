import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/support/tickets/[id]/mark-read
 * Mark all replies in a ticket as read by the current user
 */
export async function POST(
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

    // Mark all replies as read for this ticket
    const result = await query<{ count: number }>(
      `UPDATE support_ticket_replies
       SET unread_by_user = FALSE
       WHERE ticket_id = $1 AND unread_by_user = TRUE
       RETURNING id`,
      [id]
    );

    logger.info('Marked ticket replies as read', {
      ticketId: id,
      userId: session.user.id,
      markedCount: result.length,
    });

    return NextResponse.json({ markedCount: result.length });
  } catch (error) {
    logger.error('Failed to mark ticket replies as read', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
