/**
 * Admin: Email Queue / Dead Letter Management
 * GET  /api/admin/email-queue?status=failed&limit=50&offset=0
 * POST /api/admin/email-queue  { action: 'retry' | 'delete', id: string }
 *                              { action: 'retry-all' } — retry all failed
 *                              { action: 'delete-all' } — purge all failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { retryFailedEmail, deleteEmail } from '@/services/email/queue';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string; role?: string };

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>): boolean {
  return (session as { user?: SessionUser } | null)?.user?.role === 'admin';
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'failed';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0'));

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, type, to_email, status, retries, error, created_at, sent_at, next_retry_at, updated_at
         FROM email_queue
         WHERE status = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total, status FROM email_queue GROUP BY status`,
        []
      ),
    ]);

    const counts: Record<string, number> = {};
    for (const r of countResult) {
      counts[r.status] = parseInt(String(r.total));
    }

    return NextResponse.json({ emails: rows, counts, limit, offset });
  } catch (error) {
    logger.error('Admin email queue GET failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { action, id } = body as { action: string; id?: string };

  try {
    if (action === 'retry' && id) {
      const ok = await retryFailedEmail(id);
      if (!ok) return NextResponse.json({ error: 'Email not found or not failed' }, { status: 404 });
      logger.info('Admin retried dead letter email', { emailId: id });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete' && id) {
      const ok = await deleteEmail(id);
      if (!ok) return NextResponse.json({ error: 'Email not found' }, { status: 404 });
      logger.info('Admin deleted dead letter email', { emailId: id });
      return NextResponse.json({ success: true });
    }

    if (action === 'retry-all') {
      const result = await query(
        `UPDATE email_queue
         SET status = 'pending', retries = 0, error = NULL, next_retry_at = NULL, updated_at = NOW()
         WHERE status = 'failed'
         RETURNING id`,
        []
      );
      logger.info('Admin retried all dead letter emails', { count: result.length });
      return NextResponse.json({ success: true, retried: result.length });
    }

    if (action === 'delete-all') {
      const result = await query(
        `DELETE FROM email_queue WHERE status = 'failed' RETURNING id`,
        []
      );
      logger.info('Admin purged all dead letter emails', { count: result.length });
      return NextResponse.json({ success: true, deleted: result.length });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('Admin email queue POST failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
