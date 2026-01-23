import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/support/tickets/[id]/close
 * Allow user to close their own resolved or open ticket
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

    // Verify ticket exists and user owns it
    const ticketResult = await query<{
      id: string;
      status: string;
      user_id: string;
    }>(
      `SELECT id, status, user_id FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult[0];

    // Only allow closing if ticket is resolved or open
    if (ticket.status !== 'resolved' && ticket.status !== 'open') {
      return NextResponse.json(
        {
          error: `Cannot close ticket with status "${ticket.status}". Only "resolved" or "open" tickets can be closed.`,
        },
        { status: 400 }
      );
    }

    // Close the ticket
    const updateResult = await query<{
      id: string;
      status: string;
      closed_at: Date;
    }>(
      `UPDATE support_tickets
       SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, closed_at`,
      [id]
    );

    if (!updateResult[0]) {
      throw new Error('Failed to close ticket');
    }

    const updatedTicket = updateResult[0];

    logger.info('Support ticket closed by user', {
      ticketId: id,
      userId: session.user.id,
      previousStatus: ticket.status,
    });

    return NextResponse.json({
      id: updatedTicket.id,
      status: updatedTicket.status,
      closedAt: new Date(updatedTicket.closed_at),
      message: 'Ticket closed successfully',
    });
  } catch (error) {
    logger.error('Failed to close support ticket', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
