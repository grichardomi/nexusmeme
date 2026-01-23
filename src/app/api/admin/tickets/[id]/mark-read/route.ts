import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/tickets/[id]/mark-read
 * Mark all replies in a ticket as read by admin
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

    // Check if user is admin
    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Verify ticket exists
    const ticketResult = await query<{ id: string }>(
      `SELECT id FROM support_tickets WHERE id = $1`,
      [id]
    );

    if (!ticketResult[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Mark all replies as read by admin using the database function
    const result = await query<{ mark_ticket_replies_read_by_admin: number }>(
      `SELECT mark_ticket_replies_read_by_admin($1) as updated_count`,
      [id]
    );

    const updatedCount = result[0]?.mark_ticket_replies_read_by_admin || 0;

    logger.info('Admin marked ticket replies as read', {
      ticketId: id,
      updatedCount,
      userId: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        updatedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Failed to mark ticket as read', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
