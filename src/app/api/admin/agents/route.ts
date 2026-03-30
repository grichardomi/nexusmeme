import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCached } from '@/lib/redis';
import { getEnvironmentConfig } from '@/config/environment';
import type { TradeHealthAssessment } from '@/services/ai/trade-monitor-agent';

interface TradeMonitorCache {
  assessments: TradeHealthAssessment[];
  timestamp: string;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'admin') return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getEnvironmentConfig();

  const tradeMonitor = await getCached<TradeMonitorCache>('agent:trade_monitor_latest_v1').catch(() => null);

  return NextResponse.json({
    tradeMonitor: {
      enabled: env.AI_TRADE_MONITOR_ENABLED,
      cacheTtlSeconds: env.AI_TRADE_MONITOR_CACHE_TTL_SECONDS,
      timeoutMs: env.AI_TRADE_MONITOR_TIMEOUT_MS,
      model: env.AI_REGIME_AGENT_MODEL,
      latest: tradeMonitor,
    },
    regimeAgent: {
      enabled: false,
      note: 'Replaced by deterministic Trend Exhaustion Veto — zero Claude calls at entry',
    },
    confidenceBoost: {
      enabled: false,
      note: 'Removed — signal confidence is primary, boost was noise',
    },
  });
}
