import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { TicketListResponse, SupportTicket } from '@/types/support';

/**
 * GET /api/admin/tickets
 * Get all support tickets (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Support both page-based and offset-based pagination
    let offset: number;
    let limit: number;

    if (searchParams.has('offset') && searchParams.has('limit')) {
      // New offset-based pagination
      offset = parseInt(searchParams.get('offset') || '0', 10);
      limit = parseInt(searchParams.get('limit') || '20', 10);
    } else {
      // Legacy page-based pagination for backwards compatibility
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
      offset = (page - 1) * pageSize;
      limit = pageSize;
    }

    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assignedTo');
    const category = searchParams.get('category');

    // Build dynamic query with filters
    let sql = `
      SELECT id, user_id, subject, message, status, priority, category, assigned_to,
             resolved_at, closed_at, first_viewed_by_admin_at, created_at, updated_at
      FROM support_tickets
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (priority) {
      sql += ` AND priority = $${params.length + 1}`;
      params.push(priority);
    }

    if (assignedTo) {
      sql += ` AND assigned_to = $${params.length + 1}`;
      params.push(assignedTo);
    }

    if (category) {
      sql += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    sql += ` ORDER BY CASE WHEN priority = 'urgent' THEN 1 WHEN priority = 'high' THEN 2 WHEN priority = 'normal' THEN 3 ELSE 4 END,
             created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const tickets = await query<any>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM support_tickets WHERE 1=1';
    const countParams: any[] = [];

    if (status) {
      countSql += ` AND status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    if (priority) {
      countSql += ` AND priority = $${countParams.length + 1}`;
      countParams.push(priority);
    }

    if (assignedTo) {
      countSql += ` AND assigned_to = $${countParams.length + 1}`;
      countParams.push(assignedTo);
    }

    if (category) {
      countSql += ` AND category = $${countParams.length + 1}`;
      countParams.push(category);
    }

    const countResult = await query<{ count: number | string }>(countSql, countParams);
    const total = parseInt(String(countResult[0]?.count || '0'), 10);

    // Calculate page for backwards compatibility
    const page = Math.floor(offset / limit) + 1;

    const response: TicketListResponse = {
      tickets: tickets.map(t => ({
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
    logger.error('Failed to fetch admin tickets', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
