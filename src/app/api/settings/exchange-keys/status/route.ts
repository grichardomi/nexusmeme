import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/settings/exchange-keys/status
 * Returns whether the current user has any exchange API keys connected.
 * Lightweight check used by the dashboard setup banner.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await query(
    `SELECT id FROM exchange_api_keys WHERE user_id = $1 LIMIT 1`,
    [session.user.id]
  );

  return NextResponse.json({ hasKeys: result.length > 0 });
}
