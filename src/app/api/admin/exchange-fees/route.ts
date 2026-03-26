/**
 * GET  /api/admin/exchange-fees — get all exchange fee rates
 * POST /api/admin/exchange-fees — update an exchange fee rate key
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { getExchangeFeeRates } from '@/services/billing/fee-rate';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string; role?: string };

const EXCHANGE_FEE_KEYS = [
  'binance_taker_fee', 'binance_maker_fee',
  'binance_min_profit_weak', 'binance_min_profit_moderate', 'binance_min_profit_strong',
];

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const user = (session as { user?: SessionUser } | null)?.user;
  if (!user?.id || user?.role !== 'admin') return null;
  return user;
}

export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const binance = await getExchangeFeeRates('binance');

  return NextResponse.json({ binance });
}

export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key, value } = await req.json();

  if (!EXCHANGE_FEE_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

  const num = parseFloat(String(value));
  if (isNaN(num) || num < 0 || num > 1) {
    return NextResponse.json({ error: 'Value must be a number between 0 and 1' }, { status: 400 });
  }

  await query(
    'INSERT INTO billing_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, String(num)]
  );

  return NextResponse.json({ ok: true, key, value: num });
}
