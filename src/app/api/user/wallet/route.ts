import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await query<{ usdc_wallet_address: string | null }>(
    'SELECT usdc_wallet_address FROM users WHERE id = $1',
    [session.user.id]
  );
  return NextResponse.json({ walletAddress: rows[0]?.usdc_wallet_address ?? null });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const address = (body.walletAddress ?? '').trim();

  if (address && !ETH_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid wallet address — must be a valid 0x Ethereum/Base address' }, { status: 400 });
  }

  await query(
    'UPDATE users SET usdc_wallet_address = $1 WHERE id = $2',
    [address || null, session.user.id]
  );

  return NextResponse.json({ walletAddress: address || null });
}
