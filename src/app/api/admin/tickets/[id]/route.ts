import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { SupportTicketWithReplies } from '@/types/support';
import { z } from 'zod';

const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/admin/tickets/[id]
 * Get a single ticket with all replies (including internal notes) - admin only
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

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Get ticket
    const ticketResult = await query<any>(
      `SELECT id, user_id, subject, message, status, priority, category, assigned_to,
              resolved_at, closed_at, first_viewed_by_admin_at, created_at, updated_at
       FROM support_tickets
       WHERE id = $1`,
      [id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult[0];

    // Get all replies (including internal notes for admins)
    const repliesResult = await query<any>(
      `SELECT id, ticket_id, user_id, message, is_internal_note, created_at
       FROM support_ticket_replies
       WHERE ticket_id = $1
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
      firstViewedByAdminAt: ticket.first_viewed_by_admin_at ? new Date(ticket.first_viewed_by_admin_at) : undefined,
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
    logger.error('Failed to fetch admin ticket', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/tickets/[id]
 * Update ticket status, priority, or assignment - admin only
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = updateTicketSchema.parse(body);

    // Verify ticket exists
    const ticketResult = await query<{ id: string }>(
      `SELECT id FROM support_tickets WHERE id = $1`,
      [id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Build dynamic update query
    const updates: string[] = ['updated_at = NOW()'];
    const queryParams: any[] = [];

    if (validated.status) {
      updates.push(`status = $${queryParams.length + 1}`);
      queryParams.push(validated.status);

      // If resolving, set resolved_at
      if (validated.status === 'resolved') {
        updates.push(`resolved_at = NOW()`);
      }
    }

    if (validated.priority) {
      updates.push(`priority = $${queryParams.length + 1}`);
      queryParams.push(validated.priority);
    }

    if (validated.assignedTo !== undefined) {
      updates.push(`assigned_to = $${queryParams.length + 1}`);
      queryParams.push(validated.assignedTo);
    }

    queryParams.push(id);

    const updateResult = await query<any>(
      `UPDATE support_tickets
       SET ${updates.join(', ')}
       WHERE id = $${queryParams.length}
       RETURNING id, user_id, subject, status, priority, assigned_to, created_at, updated_at`,
      queryParams
    );

    const updatedTicket = updateResult[0];

    logger.info('Support ticket updated by admin', {
      ticketId: id,
      adminId: session.user.id,
      changes: validated,
    });

    return NextResponse.json({
      id: updatedTicket.id,
      userId: updatedTicket.user_id,
      subject: updatedTicket.subject,
      status: updatedTicket.status,
      priority: updatedTicket.priority,
      assignedTo: updatedTicket.assigned_to,
      createdAt: new Date(updatedTicket.created_at),
      updatedAt: new Date(updatedTicket.updated_at),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    logger.error('Failed to update support ticket', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
