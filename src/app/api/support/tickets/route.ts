import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { TicketListResponse, SupportTicket } from '@/types/support';
import { getPriorityByPlan } from '@/types/support';
import { sendTicketCreatedEmail, sendNewTicketAdminEmail } from '@/services/email/triggers';
import { z } from 'zod';

const createTicketSchema = z.object({
  subject: z.string().min(5).max(255),
  message: z.string().min(10),
  category: z.enum(['technical', 'billing', 'general', 'bug_report']),
});

/**
 * GET /api/support/tickets
 * Get all support tickets for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Support both page-based and offset-based pagination
    let offset: number;
    let limit: number;

    if (searchParams.has('offset') && searchParams.has('limit')) {
      // New offset-based pagination
      offset = parseInt(searchParams.get('offset') || '0', 10);
      limit = parseInt(searchParams.get('limit') || '10', 10);
    } else {
      // Legacy page-based pagination for backwards compatibility
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
      offset = (page - 1) * pageSize;
      limit = pageSize;
    }

    const status = searchParams.get('status');

    // Build query with optional status filter
    let sql = `
      SELECT id, user_id, subject, message, status, priority, category, assigned_to,
             resolved_at, closed_at, first_viewed_by_admin_at, created_at, updated_at
      FROM support_tickets
      WHERE user_id = $1
    `;
    const params: any[] = [session.user.id];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const tickets = await query<any>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM support_tickets WHERE user_id = $1';
    const countParams: any[] = [session.user.id];

    if (status) {
      countSql += ` AND status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    const countResult = await query<{ count: number | string }>(countSql, countParams);
    const total = parseInt(String(countResult[0]?.count || '0'), 10);

    // Calculate page for backwards compatibility
    const page = Math.floor(offset / limit) + 1;

    const response: TicketListResponse = {
      tickets: tickets.map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        subject: t.subject,
        message: t.message,
        status: t.status,
        priority: t.priority,
        category: t.category,
        assignedTo: t.assigned_to,
        resolvedAt: t.resolved_at ? new Date(t.resolved_at) : undefined,
        closedAt: t.closed_at ? new Date(t.closed_at) : undefined,
        firstViewedByAdminAt: t.first_viewed_by_admin_at ? new Date(t.first_viewed_by_admin_at) : undefined,
        createdAt: new Date(t.created_at),
        updatedAt: new Date(t.updated_at),
      })) as SupportTicket[],
      total,
      page,
      pageSize: limit,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to fetch support tickets', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTicketSchema.parse(body);

    console.log('Creating ticket with data:', {
      userId: session.user.id,
      subject: validated.subject,
      category: validated.category,
      messageLength: validated.message.length,
    });

    // Get user's plan to determine priority
    const userResult = await query<{ plan_tier: string }>(
      `SELECT s.plan_tier FROM subscriptions s WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [session.user.id]
    );

    const userPlan = userResult[0]?.plan_tier || 'free';
    const priority = getPriorityByPlan(userPlan);

    console.log('Determined priority:', { userPlan, priority });

    // Create ticket
    const ticketResult = await query<{
      id: string;
      user_id: string;
      subject: string;
      message: string;
      status: string;
      priority: string;
      category: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO support_tickets (user_id, subject, message, status, priority, category, created_at, updated_at)
       VALUES ($1, $2, $3, 'open', $4, $5, NOW(), NOW())
       RETURNING id, user_id, subject, message, status, priority, category, created_at, updated_at`,
      [session.user.id, validated.subject, validated.message, priority, validated.category]
    );

    console.log('Ticket creation result:', ticketResult);

    if (!ticketResult[0]) {
      throw new Error('Failed to create ticket');
    }

    const ticket = ticketResult[0];

    logger.info('Support ticket created', {
      ticketId: ticket.id,
      userId: session.user.id,
      priority,
    });

    // Queue email notifications (non-blocking)
    try {
      const userName = session.user.name || 'User';
      const userEmail = session.user.email || '';

      // Send confirmation email to user
      if (userEmail) {
        await sendTicketCreatedEmail(
          userEmail,
          userName,
          ticket.id,
          validated.subject
        );
      }

      // Send new ticket notification to admin support email
      // In production, this would be the support team email or admin group
      const supportEmail = process.env.SUPPORT_ADMIN_EMAIL || process.env.NEXT_PUBLIC_APP_URL;
      if (supportEmail && supportEmail !== process.env.NEXT_PUBLIC_APP_URL) {
        await sendNewTicketAdminEmail(
          supportEmail,
          ticket.id,
          userEmail,
          validated.subject,
          priority
        );
      }
    } catch (emailError) {
      // Log email error but don't fail the ticket creation
      logger.error('Failed to queue ticket notification emails', emailError instanceof Error ? emailError : null);
    }

    return NextResponse.json(
      {
        id: ticket.id,
        userId: ticket.user_id,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        createdAt: new Date(ticket.created_at),
        updatedAt: new Date(ticket.updated_at),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create support ticket', error instanceof Error ? error : null);
    console.error('Support ticket creation error:', errorMsg);

    return NextResponse.json(
      {
        error: 'Failed to create support ticket',
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined
      },
      { status: 500 }
    );
  }
}
