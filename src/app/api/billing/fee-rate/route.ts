/**
 * GET /api/billing/fee-rate
 * Returns the effective performance fee rate for the authenticated user.
 * Used by the billing page to display the correct dynamic rate.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getEffectiveFeeRate } from '@/services/billing/fee-rate';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string };

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as { user?: SessionUser } | null)?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rate = await getEffectiveFeeRate(userId);
  return NextResponse.json({ feeRate: rate, feePercent: +(rate * 100).toFixed(4) });
}
