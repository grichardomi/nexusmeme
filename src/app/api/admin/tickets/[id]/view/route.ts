import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/tickets/[id]/view
 * Mark ticket as viewed by admin (removes NEW badge)
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

    // Mark ticket as viewed by admin (only if not already viewed)
    const result = await query<{ first_viewed_by_admin_at: Date | null }>(
      `UPDATE support_tickets
       SET first_viewed_by_admin_at = COALESCE(first_viewed_by_admin_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING first_viewed_by_admin_at`,
      [id]
    );

    if (!result[0]) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    logger.debug('Ticket marked as viewed by admin', {
      ticketId: id,
      adminId: session.user.id,
    });

    return NextResponse.json({
      id,
      firstViewedByAdminAt: result[0].first_viewed_by_admin_at,
    });
  } catch (error) {
    logger.error('Failed to mark ticket as viewed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
