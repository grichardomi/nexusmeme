import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { getCached, setCached } from '@/lib/redis';
import { getEnvironmentConfig } from '@/config/environment';
import type { TradingParamOverrides } from '@/services/admin/param-overrides';

const OVERRIDES_KEY = 'admin:trading_param_overrides_v1';
const OVERRIDES_TTL = 86400 * 365; // persist for 1 year (admin-set overrides)

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'admin') return null;
  return session;
}

export interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  avgWinPct: number;
  avgLossPct: number;
  exitReasons: { reason: string; count: number }[];
  byRegime: { regime: string; count: number; wins: number; avgProfitPct: number }[];
}

async function getAdminParamOverrides(): Promise<TradingParamOverrides> {
  try {
    const cached = await getCached<TradingParamOverrides>(OVERRIDES_KEY);
    return cached ?? {};
  } catch {
    return {};
  }
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getEnvironmentConfig();

  // Performance stats — last 7 days across all bots
  const [overallRows, exitRows] = await Promise.all([
    query<{ total: string; wins: string; losses: string; avg_win: string; avg_loss: string }>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN profit_loss <= 0 THEN 1 ELSE 0 END) AS losses,
        AVG(CASE WHEN profit_loss > 0 THEN profit_loss_percent ELSE NULL END) AS avg_win,
        AVG(CASE WHEN profit_loss <= 0 THEN profit_loss_percent ELSE NULL END) AS avg_loss
      FROM trades
      WHERE status = 'closed'
        AND closed_at >= NOW() - INTERVAL '7 days'
    `).catch(() => []),
    query<{ exit_reason: string | null; count: string; avg_pnl: string; wins: string }>(`
      SELECT
        exit_reason,
        COUNT(*) AS count,
        AVG(profit_loss_percent) AS avg_pnl,
        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS wins
      FROM trades
      WHERE status = 'closed'
        AND closed_at >= NOW() - INTERVAL '7 days'
      GROUP BY exit_reason
      ORDER BY count DESC
    `).catch(() => []),
  ]);

  const overall = overallRows[0];
  const performance = {
    totalTrades: parseInt(overall?.total ?? '0'),
    wins: parseInt(overall?.wins ?? '0'),
    losses: parseInt(overall?.losses ?? '0'),
    avgWinPct: parseFloat(overall?.avg_win ?? '0') || 0,
    avgLossPct: parseFloat(overall?.avg_loss ?? '0') || 0,
    exitReasons: exitRows.map(r => ({
      reason: r.exit_reason ?? 'unknown',
      count: parseInt(r.count),
      avgPnlPct: parseFloat(r.avg_pnl ?? '0') || 0,
      wins: parseInt(r.wins ?? '0'),
    })),
    byRegime: [] as { regime: string; count: number; wins: number; avgProfitPct: number }[],
  };

  // Current param values (env, possibly overridden)
  const overrides = await getAdminParamOverrides();

  const params = {
    RISK_MIN_MOMENTUM_1H_BINANCE: overrides.RISK_MIN_MOMENTUM_1H_BINANCE ?? env.RISK_MIN_MOMENTUM_1H_BINANCE,
    RISK_1H_BYPASS_4H_MIN: overrides.RISK_1H_BYPASS_4H_MIN ?? env.RISK_1H_BYPASS_4H_MIN,
    RISK_1H_BYPASS_INTRABAR_MIN: overrides.RISK_1H_BYPASS_INTRABAR_MIN ?? env.RISK_1H_BYPASS_INTRABAR_MIN,
    REGIME_SIZE_STRONG: overrides.REGIME_SIZE_STRONG ?? env.REGIME_SIZE_STRONG,
    REGIME_SIZE_MODERATE: overrides.REGIME_SIZE_MODERATE ?? env.REGIME_SIZE_MODERATE,
    REGIME_SIZE_WEAK: overrides.REGIME_SIZE_WEAK ?? env.REGIME_SIZE_WEAK,
    REGIME_SIZE_TRANSITIONING: overrides.REGIME_SIZE_TRANSITIONING ?? env.REGIME_SIZE_TRANSITIONING,
    REGIME_SIZE_CHOPPY: overrides.REGIME_SIZE_CHOPPY ?? env.REGIME_SIZE_CHOPPY,
    PROFIT_TARGET_STRONG: overrides.PROFIT_TARGET_STRONG ?? env.PROFIT_TARGET_STRONG,
    PROFIT_TARGET_MODERATE: overrides.PROFIT_TARGET_MODERATE ?? env.PROFIT_TARGET_MODERATE,
    PROFIT_TARGET_WEAK: overrides.PROFIT_TARGET_WEAK ?? env.PROFIT_TARGET_WEAK,
    PROFIT_TARGET_CHOPPY: overrides.PROFIT_TARGET_CHOPPY ?? env.PROFIT_TARGET_CHOPPY,
    EROSION_PEAK_MIN_PCT: overrides.EROSION_PEAK_MIN_PCT ?? env.EROSION_PEAK_MIN_PCT,
    EROSION_PEAK_RELATIVE_THRESHOLD: overrides.EROSION_PEAK_RELATIVE_THRESHOLD ?? env.EROSION_PEAK_RELATIVE_THRESHOLD,
    RISK_BTC_MIN_VOLUME_RATIO: overrides.RISK_BTC_MIN_VOLUME_RATIO ?? env.RISK_BTC_MIN_VOLUME_RATIO,
  };

  const envDefaults = {
    RISK_MIN_MOMENTUM_1H_BINANCE: env.RISK_MIN_MOMENTUM_1H_BINANCE,
    RISK_1H_BYPASS_4H_MIN: env.RISK_1H_BYPASS_4H_MIN,
    RISK_1H_BYPASS_INTRABAR_MIN: env.RISK_1H_BYPASS_INTRABAR_MIN,
    REGIME_SIZE_STRONG: env.REGIME_SIZE_STRONG,
    REGIME_SIZE_MODERATE: env.REGIME_SIZE_MODERATE,
    REGIME_SIZE_WEAK: env.REGIME_SIZE_WEAK,
    REGIME_SIZE_TRANSITIONING: env.REGIME_SIZE_TRANSITIONING,
    REGIME_SIZE_CHOPPY: env.REGIME_SIZE_CHOPPY,
    PROFIT_TARGET_STRONG: env.PROFIT_TARGET_STRONG,
    PROFIT_TARGET_MODERATE: env.PROFIT_TARGET_MODERATE,
    PROFIT_TARGET_WEAK: env.PROFIT_TARGET_WEAK,
    PROFIT_TARGET_CHOPPY: env.PROFIT_TARGET_CHOPPY,
    EROSION_PEAK_MIN_PCT: env.EROSION_PEAK_MIN_PCT,
    EROSION_PEAK_RELATIVE_THRESHOLD: env.EROSION_PEAK_RELATIVE_THRESHOLD,
    RISK_BTC_MIN_VOLUME_RATIO: env.RISK_BTC_MIN_VOLUME_RATIO,
  };

  return NextResponse.json({ performance, params, envDefaults, overrides });
}

export async function POST(req: Request) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === 'set_params') {
    const incoming: TradingParamOverrides = body.params ?? {};
    // Merge with existing overrides
    const existing = await getAdminParamOverrides();
    const merged = { ...existing, ...incoming };
    await setCached(OVERRIDES_KEY, merged, OVERRIDES_TTL);
    return NextResponse.json({ saved: true, overrides: merged });
  }

  if (body.action === 'reset_param') {
    const key = body.key as keyof TradingParamOverrides;
    const existing = await getAdminParamOverrides();
    delete existing[key];
    await setCached(OVERRIDES_KEY, existing, OVERRIDES_TTL);
    return NextResponse.json({ saved: true, overrides: existing });
  }

  if (body.action === 'reset_all') {
    await setCached(OVERRIDES_KEY, {}, OVERRIDES_TTL);
    return NextResponse.json({ saved: true, overrides: {} });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
