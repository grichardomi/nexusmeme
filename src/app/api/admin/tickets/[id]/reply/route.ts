import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { queueEmail } from '@/services/email/queue';
import { z } from 'zod';

const adminReplySchema = z.object({
  message: z.string().min(1).max(10000),
  isInternalNote: z.boolean().optional().default(false),
});

/**
 * POST /api/admin/tickets/[id]/reply
 * Add a reply or internal note to a support ticket - admin only
 */
export async function POST(
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
    const validated = adminReplySchema.parse(body);

    // Verify ticket exists and get ticket info
    const ticketResult = await query<{ id: string; user_id: string; subject: string }>(
      `SELECT id, user_id, subject FROM support_tickets WHERE id = $1`,
      [id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult[0];

    // Create reply/note (mark as unread for user if not internal note)
    const replyResult = await query<{
      id: string;
      ticket_id: string;
      user_id: string;
      message: string;
      is_internal_note: boolean;
      created_at: Date;
    }>(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, message, is_internal_note, unread_by_user, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, ticket_id, user_id, message, is_internal_note, created_at`,
      [id, session.user.id, validated.message, validated.isInternalNote, !validated.isInternalNote]
    );

    if (!replyResult[0]) {
      throw new Error('Failed to create reply');
    }

    const reply = replyResult[0];

    logger.info('Admin reply created on support ticket', {
      ticketId: id,
      replyId: reply.id,
      adminId: session.user.id,
      isInternalNote: validated.isInternalNote,
    });

    // Send email notification to user if not internal note
    if (!validated.isInternalNote) {
      try {
        // Get user info for email
        const userResult = await query<{ email: string; name: string | null }>(
          `SELECT email, name FROM users WHERE id = $1`,
          [ticket.user_id]
        );

        if (userResult[0]) {
          const user = userResult[0];

          // Queue email notification
          await queueEmail('ticket_replied', user.email, {
            name: user.name || undefined,
            ticketId: ticket.id,
            subject: ticket.subject,
            replyMessage: validated.message,
            ticketUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard/support/${ticket.id}`,
          });

          logger.info('Email notification queued for ticket reply', {
            ticketId: ticket.id,
            userId: ticket.user_id,
            userEmail: user.email,
          });
        }
      } catch (emailError) {
        // Log error but don't fail the reply creation
        logger.error('Failed to queue email for ticket reply', emailError instanceof Error ? emailError : null);
      }
    }

    return NextResponse.json(
      {
        id: reply.id,
        ticketId: reply.ticket_id,
        userId: reply.user_id,
        message: reply.message,
        isInternalNote: reply.is_internal_note,
        createdAt: new Date(reply.created_at),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    logger.error('Failed to create admin reply', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
