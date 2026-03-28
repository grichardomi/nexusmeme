import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCached, deleteCached } from '@/lib/redis';
import { getEnvironmentConfig } from '@/config/environment';
import { regimeAgent } from '@/services/ai/regime-agent';
import type { RegimeAgentState } from '@/types/ai';
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

  const [regimeState, tradeMonitor] = await Promise.all([
    getCached<RegimeAgentState>('agent:regime_v1').catch(() => null),
    getCached<TradeMonitorCache>('agent:trade_monitor_latest_v1').catch(() => null),
  ]);

  const ageSeconds = regimeState
    ? Math.round((Date.now() - new Date(regimeState.timestamp).getTime()) / 1000)
    : null;

  return NextResponse.json({
    regimeAgent: {
      enabled: env.AI_REGIME_AGENT_ENABLED,
      cacheTtlSeconds: env.AI_REGIME_AGENT_CACHE_TTL_SECONDS,
      timeoutMs: env.AI_REGIME_AGENT_TIMEOUT_MS,
      model: env.AI_REGIME_AGENT_MODEL,
      maxAdjustment: env.AI_REGIME_AGENT_MAX_ADJUSTMENT,
      state: regimeState,
      ageSeconds,
      callsToday: regimeAgent.callsToday,
      adjustmentOverride: regimeAgent.adjustmentOverride,
    },
    tradeMonitor: {
      enabled: env.AI_TRADE_MONITOR_ENABLED,
      cacheTtlSeconds: env.AI_TRADE_MONITOR_CACHE_TTL_SECONDS,
      timeoutMs: env.AI_TRADE_MONITOR_TIMEOUT_MS,
      latest: tradeMonitor,
    },
  });
}

/** Flush regime cache — forces fresh Claude call on next orchestrator cycle */
export async function DELETE() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  regimeAgent.flushCache();
  await deleteCached('agent:regime_v1').catch(() => {});

  return NextResponse.json({ flushed: true });
}

/** Set or clear admin override for entry adjustment */
export async function POST(req: Request) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const env = getEnvironmentConfig();
  const maxAdj = env.AI_REGIME_AGENT_MAX_ADJUSTMENT;

  if (body.action === 'clear_override') {
    regimeAgent.setOverride(null);
    return NextResponse.json({ override: null });
  }

  if (body.action === 'set_override') {
    const value = Number(body.value);
    if (isNaN(value) || value < -maxAdj || value > maxAdj) {
      return NextResponse.json({ error: `Override must be between -${maxAdj} and +${maxAdj}` }, { status: 400 });
    }
    regimeAgent.setOverride(value);
    return NextResponse.json({ override: value });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
