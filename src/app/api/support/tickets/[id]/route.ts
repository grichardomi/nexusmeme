import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { SupportTicketWithReplies } from '@/types/support';

/**
 * GET /api/support/tickets/[id]
 * Get a single support ticket with all replies
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

    // Get ticket (ensure user owns it)
    const ticketResult = await query<any>(
      `SELECT id, user_id, subject, message, status, priority, category, assigned_to,
              resolved_at, closed_at, created_at, updated_at
       FROM support_tickets
       WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult[0];

    // Get all replies (exclude internal notes for regular users)
    const repliesResult = await query<any>(
      `SELECT id, ticket_id, user_id, message, is_internal_note, created_at
       FROM support_ticket_replies
       WHERE ticket_id = $1 AND is_internal_note = FALSE
       ORDER BY created_at ASC`,
      [id]
    );

    const ticketWithReplies: SupportTicketWithReplies = {
      id: ticket.id,
      userId: ticket.user_id,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      assignedTo: ticket.assigned_to,
      resolvedAt: ticket.resolved_at ? new Date(ticket.resolved_at) : undefined,
      closedAt: ticket.closed_at ? new Date(ticket.closed_at) : undefined,
      createdAt: new Date(ticket.created_at),
      updatedAt: new Date(ticket.updated_at),
      replies: repliesResult.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        userId: r.user_id,
        message: r.message,
        isInternalNote: r.is_internal_note,
        createdAt: new Date(r.created_at),
      })),
    };

    return NextResponse.json(ticketWithReplies);
  } catch (error) {
    logger.error('Failed to fetch support ticket', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
