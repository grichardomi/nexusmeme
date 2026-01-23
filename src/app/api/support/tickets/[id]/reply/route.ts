import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { queueEmail } from '@/services/email/queue';
import { z } from 'zod';

const replySchema = z.object({
  message: z.string().min(1).max(10000),
});

/**
 * POST /api/support/tickets/[id]/reply
 * Add a reply to a support ticket
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

    const { id } = await params;
    const body = await request.json();
    const validated = replySchema.parse(body);

    // Verify ticket exists and user owns it
    const ticketResult = await query<{ id: string; status: string }>(
      `SELECT id, status FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Create reply and mark as unread for admin
    const replyResult = await query<{
      id: string;
      ticket_id: string;
      user_id: string;
      message: string;
      is_internal_note: boolean;
      unread_by_admin: boolean;
      created_at: Date;
    }>(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, message, is_internal_note, unread_by_admin, created_at)
       VALUES ($1, $2, $3, FALSE, TRUE, NOW())
       RETURNING id, ticket_id, user_id, message, is_internal_note, unread_by_admin, created_at`,
      [id, session.user.id, validated.message]
    );

    if (!replyResult[0]) {
      throw new Error('Failed to create reply');
    }

    const reply = replyResult[0];

    logger.info('Support ticket reply created', {
      ticketId: id,
      replyId: reply.id,
      userId: session.user.id,
    });

    // Queue email notification to assigned admin (non-blocking)
    try {
      // Fetch ticket with assigned admin info
      const ticketDetail = await query<{
        id: string;
        subject: string;
        assigned_to: string;
      }>(
        `SELECT id, subject, assigned_to FROM support_tickets WHERE id = $1`,
        [id]
      );

      if (ticketDetail[0]?.assigned_to) {
        // Fetch admin email
        const adminDetail = await query<{ email: string }>(
          `SELECT email FROM users WHERE id = $1`,
          [ticketDetail[0].assigned_to]
        );

        if (adminDetail[0]?.email) {
          // Queue notification email to admin
          await queueEmail('ticket_replied', adminDetail[0].email, {
            ticketId: id,
            subject: ticketDetail[0].subject,
            replyMessage: `User reply: ${validated.message.substring(0, 200)}...`,
            name: 'Support Admin',
          });
        }
      }
    } catch (emailError) {
      // Log error but don't fail the reply creation
      logger.error('Failed to queue admin notification email', emailError instanceof Error ? emailError : null);
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

    logger.error('Failed to create support ticket reply', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
