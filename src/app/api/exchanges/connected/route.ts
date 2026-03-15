import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/exchanges/connected
 * Returns the list of exchange names that the current user has API keys for.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await query<{ exchange: string }>(
    `SELECT exchange FROM exchange_api_keys WHERE user_id = $1 ORDER BY exchange`,
    [session.user.id]
  );

  const exchanges = rows.map(r => r.exchange.toLowerCase());
  return NextResponse.json({ exchanges });
}
