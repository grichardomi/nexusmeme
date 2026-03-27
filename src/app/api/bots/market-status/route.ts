/**
 * GET /api/bots/market-status
 * Returns the last orchestrator cycle's market conditions per pair.
 * Used by the Bot Status card on the dashboard.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { tradeSignalOrchestrator } from '@/services/orchestration/trade-signal-orchestrator';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = tradeSignalOrchestrator.getMarketStatus();
  return NextResponse.json(status);
}
