'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

interface RegimeAgentState {
  btcRegime: 'strong' | 'moderate' | 'weak' | 'choppy' | 'transitioning';
  trendTransitioning: boolean;
  transitionDirection: 'strengthening' | 'weakening' | 'none';
  entryBarAdjustment: number;
  btcLeading: boolean;
  reasoning: string;
  timestamp: string;
  source: 'agent' | 'fallback';
}

interface TradeAssessment {
  pair: string;
  status: 'HEALTHY' | 'WATCH' | 'CONCERN';
  reason: string;
}

interface BoostLastResult {
  pair: string;
  adjustment: number;
  reasoning: string;
  provider: string;
  vetoed: boolean;
  deterministicScore: number;
  finalScore: number;
  timestamp: string;
}

interface AgentsData {
  confidenceBoost: {
    enabled: boolean;
    maxAdjustment: number;
    timeoutMs: number;
    vetoWindowMin: number;
    vetoWindowMax: number;
    callsToday: number;
    cacheHitsToday: number;
    vetosToday: number;
    skippedToday: number;
    cacheSize: number;
    lastResult: BoostLastResult | null;
  };
  regimeAgent: {
    enabled: boolean;
    cacheTtlSeconds: number;
    timeoutMs: number;
    model: string;
    maxAdjustment: number;
    state: RegimeAgentState | null;
    ageSeconds: number | null;
    callsToday: number;
    adjustmentOverride: number | null;
    overrideExpiresInSeconds: number | null;
  };
  tradeMonitor: {
    enabled: boolean;
    cacheTtlSeconds: number;
    timeoutMs: number;
    latest: { assessments: TradeAssessment[]; timestamp: string } | null;
  };
}

interface ExitReasonStat { reason: string; count: number; avgPnlPct: number; wins: number; }

interface PerformanceData {
  totalTrades: number;
  wins: number;
  losses: number;
  avgWinPct: number;
  avgLossPct: number;
  exitReasons: ExitReasonStat[];
  byRegime: { regime: string; count: number; wins: number; avgProfitPct: number }[];
}

interface TradingParams {
  RISK_MIN_MOMENTUM_1H_BINANCE: number;
  RISK_1H_BYPASS_4H_MIN: number;
  RISK_1H_BYPASS_INTRABAR_MIN: number;
  REGIME_SIZE_STRONG: number;
  REGIME_SIZE_MODERATE: number;
  REGIME_SIZE_WEAK: number;
  REGIME_SIZE_TRANSITIONING: number;
  REGIME_SIZE_CHOPPY: number;
  PROFIT_TARGET_STRONG: number;
  PROFIT_TARGET_MODERATE: number;
  PROFIT_TARGET_WEAK: number;
  PROFIT_TARGET_CHOPPY: number;
  EROSION_PEAK_MIN_PCT: number;
  EROSION_PEAK_RELATIVE_THRESHOLD: number;
  RISK_BTC_MIN_VOLUME_RATIO: number;
}

interface ParamChangeEntry {
  timestamp: string;
  key: string;
  oldValue: number | undefined;
  newValue: number | undefined;
  action: 'set' | 'reset' | 'reset_all';
}

interface TradingParamsData {
  performance: PerformanceData;
  params: TradingParams;
  envDefaults: TradingParams;
  overrides: Partial<TradingParams>;
  changelog: ParamChangeEntry[];
  overrideSetAt: Record<string, string>; // ISO timestamp when each override was last set
}

const REGIME_COLORS: Record<string, string> = {
  strong:       'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  moderate:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  weak:         'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  choppy:       'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  transitioning:'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  WATCH:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONCERN: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const ADJUSTMENT_COLOR = (adj: number) =>
  adj > 0 ? 'text-emerald-600 dark:text-emerald-400' :
  adj < 0 ? 'text-red-600 dark:text-red-400' :
  'text-slate-500 dark:text-slate-400';

function AgeIndicator({ ageSeconds, ttlSeconds }: { ageSeconds: number; ttlSeconds: number }) {
  const pct = Math.min(100, (ageSeconds / ttlSeconds) * 100);
  const fresh = pct < 40;
  const stale = pct > 80;
  const color = stale ? 'bg-red-400' : fresh ? 'bg-emerald-400' : 'bg-yellow-400';
  const label = ageSeconds < 60 ? `${ageSeconds}s ago` : `${Math.round(ageSeconds / 60)}m ago`;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 w-16 text-right">{label}</span>
    </div>
  );
}

const OVERRIDE_EXPIRY_DAYS = 7;
const PROMOTE_NUDGE_HOURS = 24;

function overrideAge(setAt: string | undefined): { ageMs: number; ageLabel: string; expiresInDays: number } | null {
  if (!setAt) return null;
  const ageMs = Date.now() - new Date(setAt).getTime();
  const totalHours = ageMs / 3600000;
  const days = Math.floor(totalHours / 24);
  const hours = Math.floor(totalHours % 24);
  const ageLabel = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  const expiresInDays = Math.max(0, OVERRIDE_EXPIRY_DAYS - days);
  return { ageMs, ageLabel, expiresInDays };
}

interface SliderRowProps {
  label: string;
  description: string;
  paramKey: keyof TradingParams;
  value: number;
  envDefault: number;
  isOverridden: boolean;
  setAt?: string; // ISO timestamp when override was set
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (key: keyof TradingParams, val: number) => void;
  onReset: (key: keyof TradingParams) => void;
}

function SliderRow({ label, description, paramKey, value, envDefault, isOverridden, setAt, min, max, step, format, onChange, onReset }: SliderRowProps) {
  const age = isOverridden ? overrideAge(setAt) : null;
  const showPromoteNudge = age !== null && age.ageMs > PROMOTE_NUDGE_HOURS * 3600000;

  return (
    <div className={`px-4 py-3 rounded-lg ${isOverridden ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
            {isOverridden && age && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">
                override · {age.ageLabel} · expires in {age.expiresInDays}d
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-mono font-semibold text-slate-900 dark:text-white w-16 text-right">{format(value)}</span>
          {isOverridden && (
            <button
              onClick={() => onReset(paramKey)}
              className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(paramKey, parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
        <span>min {format(min)}</span>
        {isOverridden && <span className="text-amber-500">env default: {format(envDefault)}</span>}
        <span>max {format(max)}</span>
      </div>
      {showPromoteNudge && (
        <div className="mt-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
          Stable for {age!.ageLabel} — ready to promote. Set <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded font-mono">{String(paramKey)}={format(value)}</code> in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">.env.local</code> then click reset to remove this override.
        </div>
      )}
    </div>
  );
}

export default function AgentsDashboardPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AgentsData | null>(null);
  const [paramsData, setParamsData] = useState<TradingParamsData | null>(null);
  const [localParams, setLocalParams] = useState<TradingParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [overrideInput, setOverrideInput] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [savingParams, setSavingParams] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/auth/signin');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') redirect('/dashboard');
  }, [status, session]);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, paramsRes] = await Promise.all([
        fetch('/api/admin/agents'),
        fetch('/api/admin/trading-params'),
      ]);
      if (agentsRes.ok) setData(await agentsRes.json());
      if (paramsRes.ok) {
        const pd: TradingParamsData = await paramsRes.json();
        setParamsData(pd);
        setLocalParams(pd.params);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const flash = (text: string, ok: boolean) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const flushCache = async () => {
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/agents', { method: 'DELETE' });
      if (res.ok) { flash('Cache flushed — next cycle will call Claude', true); await fetchData(); }
      else flash('Flush failed', false);
    } finally { setActionBusy(false); }
  };

  const setOverride = async () => {
    const val = Number(overrideInput);
    const max = data?.regimeAgent.maxAdjustment ?? 10;
    if (isNaN(val) || val < -max || val > max) { flash(`Value must be between -${max} and +${max}`, false); return; }
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_override', value: val }) });
      if (res.ok) { flash(`Override set to ${val > 0 ? '+' : ''}${val}`, true); setShowOverrideInput(false); setOverrideInput(''); await fetchData(); }
      else { const err = await res.json(); flash(err.error ?? 'Failed', false); }
    } finally { setActionBusy(false); }
  };

  const clearOverride = async () => {
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_override' }) });
      if (res.ok) { flash('Override cleared — agent value restored', true); await fetchData(); }
      else flash('Failed to clear override', false);
    } finally { setActionBusy(false); }
  };

  const handleParamChange = (key: keyof TradingParams, val: number) => {
    setLocalParams(prev => prev ? { ...prev, [key]: val } : null);
  };

  const handleParamReset = async (key: keyof TradingParams) => {
    setSavingParams(true);
    try {
      const res = await fetch('/api/admin/trading-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset_param', key }) });
      if (res.ok) { flash(`${key} reset to env default`, true); await fetchData(); }
      else flash('Reset failed', false);
    } finally { setSavingParams(false); }
  };

  const saveParams = async () => {
    if (!localParams || !paramsData) return;
    // Only send keys that differ from env defaults
    const changed: Partial<TradingParams> = {};
    for (const k of Object.keys(localParams) as (keyof TradingParams)[]) {
      if (Math.abs(localParams[k] - paramsData.envDefaults[k]) > 0.00001) {
        changed[k] = localParams[k];
      }
    }
    setSavingParams(true);
    try {
      const res = await fetch('/api/admin/trading-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_params', params: changed }) });
      if (res.ok) { flash('Parameters saved — active within 10s', true); await fetchData(); }
      else flash('Save failed', false);
    } finally { setSavingParams(false); }
  };

  const resetAllParams = async () => {
    setSavingParams(true);
    try {
      const res = await fetch('/api/admin/trading-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset_all' }) });
      if (res.ok) { flash('All parameters reset to env defaults', true); await fetchData(); }
      else flash('Reset failed', false);
    } finally { setSavingParams(false); }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-slate-500 dark:text-slate-400 text-sm">Loading agent state...</div>
      </div>
    );
  }

  const regime = data?.regimeAgent;
  const monitor = data?.tradeMonitor;
  const maxAdj = regime?.maxAdjustment ?? 10;
  const estimatedCostToday = ((regime?.callsToday ?? 0) * 0.00025).toFixed(4);
  const perf = paramsData?.performance;
  const winRate = perf && perf.totalTrades > 0 ? (perf.wins / perf.totalTrades * 100).toFixed(1) : '—';
  // Gross P&L is stored in DB; subtract estimated round-trip fee (0.20% Binance maker+taker)
  const FEE_ROUNDTRIP_PCT = 0.20;
  const expectancy = perf && perf.totalTrades > 0
    ? ((perf.wins / perf.totalTrades) * perf.avgWinPct - (perf.losses / perf.totalTrades) * Math.abs(perf.avgLossPct) - FEE_ROUNDTRIP_PCT).toFixed(3)
    : null;
  const hasOverrides = paramsData && Object.keys(paramsData.overrides).length > 0;

  const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
  const multFmt = (v: number) => `${v.toFixed(2)}x`;
  const rawFmt = (v: number) => v.toFixed(2);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Agentic AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">BTC regime agent + trade monitor + strategy tuning</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} className="text-xs px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            Refresh
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${actionMsg.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
          {actionMsg.text}
        </div>
      )}

      {/* ── PERFORMANCE vs CURRENT SETTINGS ── */}
      {perf && paramsData && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-base font-semibold text-slate-900 dark:text-white">Performance</span>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">last 7 days · all bots · with current settings</span>
            </div>
            {hasOverrides && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">
                {Object.keys(paramsData.overrides).length} override{Object.keys(paramsData.overrides).length !== 1 ? 's' : ''} active
              </span>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* Current profit targets — context before stats */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Active Profit Targets</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-700">
                {([
                  { label: 'Strong', key: 'PROFIT_TARGET_STRONG', color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Moderate', key: 'PROFIT_TARGET_MODERATE', color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Weak', key: 'PROFIT_TARGET_WEAK', color: 'text-yellow-600 dark:text-yellow-500' },
                  { label: 'Choppy', key: 'PROFIT_TARGET_CHOPPY', color: 'text-orange-600 dark:text-orange-400' },
                ] as { label: string; key: keyof TradingParams; color: string }[]).map(({ label, key, color }) => {
                  const val = paramsData.params[key] as number;
                  const isOvr = key in paramsData.overrides;
                  return (
                    <div key={key} className="px-4 py-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label} {isOvr && <span className="text-amber-500">↑</span>}</div>
                      <div className={`text-lg font-bold ${color}`}>{(val * 100).toFixed(1)}%</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">size {paramsData.params[`REGIME_SIZE_${label.toUpperCase()}` as keyof TradingParams]}x</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Total Trades</div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">{perf.totalTrades}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Win Rate</div>
                <div className={`text-xl font-bold ${parseFloat(winRate) >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{winRate}%</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Avg Win</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">+{perf.avgWinPct.toFixed(2)}%</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">Avg Loss</div>
                <div className="text-xl font-bold text-red-500 dark:text-red-400">{perf.avgLossPct.toFixed(2)}%</div>
              </div>
            </div>

            {/* Expectancy */}
            {expectancy !== null && (
              <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-between ${parseFloat(expectancy) >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
                <span>Net expectancy per trade <span className="font-normal opacity-70">(after ~0.20% fees)</span></span>
                <span className="font-mono font-bold">{parseFloat(expectancy) >= 0 ? '+' : ''}{expectancy}%</span>
              </div>
            )}

            {/* Exit reason breakdown with avg P&L — key diagnostic */}
            {perf.exitReasons.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Exit Analysis</div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="grid grid-cols-4 px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <div className="col-span-2">Reason</div>
                    <div className="text-right">Count</div>
                    <div className="text-right">Avg P&L</div>
                  </div>
                  {perf.exitReasons.map(e => {
                    const isPositive = e.avgPnlPct >= 0;
                    const winPct = e.count > 0 ? (e.wins / e.count * 100).toFixed(0) : '0';
                    return (
                      <div key={e.reason} className="grid grid-cols-4 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0 items-center">
                        <div className="col-span-2">
                          <span className="text-xs font-mono text-slate-700 dark:text-slate-200">{e.reason ?? 'unknown'}</span>
                          <span className="ml-2 text-xs text-slate-400">{winPct}% win</span>
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">{e.count}</div>
                        <div className={`text-right text-xs font-mono font-semibold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {isPositive ? '+' : ''}{e.avgPnlPct.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REGIME AGENT ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900 dark:text-white">Regime Agent</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${regime?.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
              {regime?.enabled ? 'enabled' : 'disabled'}
            </span>
            {regime?.adjustmentOverride !== null && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                override active{regime?.overrideExpiresInSeconds != null ? ` · expires ${Math.ceil(regime.overrideExpiresInSeconds / 3600)}h` : ' · no expiry'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">{regime?.model}</span>
            <button onClick={flushCache} disabled={actionBusy} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition font-medium">Refresh</button>
          </div>
        </div>

        <div className="p-5">
          {!regime?.state ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">No data yet — agent fires on next orchestrator cycle</div>
          ) : (
            <div className="space-y-4">
              {regime.ageSeconds !== null && <AgeIndicator ageSeconds={regime.ageSeconds} ttlSeconds={regime.cacheTtlSeconds} />}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">BTC Regime</div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REGIME_COLORS[regime.state.btcRegime] || ''}`}>{regime.state.btcRegime.toUpperCase()}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Entry Adjustment{regime.adjustmentOverride !== null && <span className="ml-1 text-amber-500">(overridden)</span>}</div>
                  <span className={`text-lg font-bold ${ADJUSTMENT_COLOR(regime.state.entryBarAdjustment)}`}>{regime.state.entryBarAdjustment > 0 ? '+' : ''}{regime.state.entryBarAdjustment}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">/ ±{maxAdj}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">BTC Leading</div>
                  <span className={`text-sm font-medium ${regime.state.btcLeading ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{regime.state.btcLeading ? 'Confirming' : 'Diverging'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Transition</div>
                  {regime.state.trendTransitioning ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${regime.state.transitionDirection === 'weakening' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>{regime.state.transitionDirection.toUpperCase()}</span>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-slate-500">Stable</span>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Agent reasoning</div>
                <p className="text-sm text-slate-700 dark:text-slate-200 italic">&quot;{regime.state.reasoning}&quot;</p>
              </div>
              {regime.state.entryBarAdjustment !== 0 && (
                <div className={`rounded-lg px-4 py-3 text-sm ${regime.state.entryBarAdjustment < 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'}`}>
                  {regime.state.entryBarAdjustment < 0
                    ? `Entry confidence pre-adjusted ${regime.state.entryBarAdjustment} — raises bar before Claude veto check. Fake rally risk flagged.`
                    : `Entry confidence pre-adjusted +${regime.state.entryBarAdjustment} — lowers bar before Claude veto check. Sustained move confirmed.`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
          {/* Permanent tuning lever */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Max adjustment range (permanent lever)</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">±{maxAdj} — set via <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">AI_REGIME_AGENT_MAX_ADJUSTMENT</code></span>
          </div>

          {/* Active override warning — urge clearing */}
          {regime && regime.adjustmentOverride !== null && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⚠ Emergency override active: {regime.adjustmentOverride > 0 ? '+' : ''}{regime.adjustmentOverride}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {regime.overrideExpiresInSeconds != null
                    ? `auto-restores in ${Math.ceil(regime.overrideExpiresInSeconds / 3600)}h`
                    : 'no auto-expiry set'}
                </span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Agent output is being ignored. For permanent tuning, clear this and adjust <code className="bg-amber-100 dark:bg-amber-800/40 px-1 rounded">AI_REGIME_AGENT_MAX_ADJUSTMENT</code> in env vars instead.
              </p>
              <button onClick={clearOverride} disabled={actionBusy} className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 disabled:opacity-50 transition font-medium">
                Clear override — restore agent control
              </button>
            </div>
          )}

          {/* Emergency override — collapsed by default */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 select-none list-none flex items-center gap-1">
              <span className="group-open:hidden">▶</span><span className="hidden group-open:inline">▼</span>
              Emergency override (temporary, use sparingly)
            </summary>
            <div className="mt-3 space-y-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-amber-600 dark:text-amber-400">Manual overrides work against long-term consistency.</span> Only use when you know something the agent doesn&apos;t (e.g., exchange maintenance, known news event). Auto-expires in 4h. For permanent calibration, use <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">AI_REGIME_AGENT_MAX_ADJUSTMENT</code> in env vars.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowOverrideInput(v => !v)} disabled={actionBusy} className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition font-medium">
                  {showOverrideInput ? 'Cancel' : 'Set Override'}
                </button>
                <button onClick={async () => { setActionBusy(true); await fetch('/api/admin/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_override', value: 0 }) }); flash('Override set to 0 — agent paused at neutral for 4h', true); await fetchData(); setActionBusy(false); }} disabled={actionBusy} className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition font-medium">
                  Pause at Neutral (0)
                </button>
              </div>
              {showOverrideInput && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Value from <span className="font-mono">-{maxAdj}</span> to <span className="font-mono">+{maxAdj}</span>. Positive = lower bar (more entries). Negative = raise bar (fewer entries).
                    {regime?.state?.entryBarAdjustment !== undefined && (
                      <> Agent currently at <span className="font-semibold">{regime.state.entryBarAdjustment > 0 ? '+' : ''}{regime.state.entryBarAdjustment}</span>.</>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={-maxAdj}
                      max={maxAdj}
                      value={overrideInput}
                      onChange={e => setOverrideInput(e.target.value)}
                      placeholder={regime?.state?.entryBarAdjustment !== undefined ? `agent: ${regime.state.entryBarAdjustment > 0 ? '+' : ''}${regime.state.entryBarAdjustment}` : `−${maxAdj} to +${maxAdj}`}
                      className="text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={setOverride} disabled={actionBusy || overrideInput === ''} className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition font-medium">Apply</button>
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>

      {/* ── STRATEGY TUNING ── */}
      {localParams && paramsData && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-base font-semibold text-slate-900 dark:text-white">Strategy Tuning</span>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">live · no restart needed</span>
            </div>
            <div className="flex gap-2">
              {hasOverrides && (
                <button onClick={resetAllParams} disabled={savingParams} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition">
                  Reset all
                </button>
              )}
              <button onClick={saveParams} disabled={savingParams} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition font-medium">
                {savingParams ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Entry sensitivity */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Entry Sensitivity</div>
              <div className="space-y-3">
                <SliderRow label="1h Momentum Floor (Binance)" description="Minimum 1h momentum % required to enter. Lower = earlier entries." paramKey="RISK_MIN_MOMENTUM_1H_BINANCE" value={localParams.RISK_MIN_MOMENTUM_1H_BINANCE} envDefault={paramsData.envDefaults.RISK_MIN_MOMENTUM_1H_BINANCE} isOverridden={'RISK_MIN_MOMENTUM_1H_BINANCE' in paramsData.overrides} setAt={paramsData.overrideSetAt['RISK_MIN_MOMENTUM_1H_BINANCE']} min={0} max={2} step={0.05} format={rawFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="4h Bypass Threshold" description="4h momentum % needed to bypass the 1h floor. Allows early entries when 4h is strong." paramKey="RISK_1H_BYPASS_4H_MIN" value={localParams.RISK_1H_BYPASS_4H_MIN} envDefault={paramsData.envDefaults.RISK_1H_BYPASS_4H_MIN} isOverridden={'RISK_1H_BYPASS_4H_MIN' in paramsData.overrides} setAt={paramsData.overrideSetAt['RISK_1H_BYPASS_4H_MIN']} min={0.5} max={3} step={0.1} format={rawFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Intrabar Bypass Min" description="Minimum intrabar momentum % to activate 4h bypass." paramKey="RISK_1H_BYPASS_INTRABAR_MIN" value={localParams.RISK_1H_BYPASS_INTRABAR_MIN} envDefault={paramsData.envDefaults.RISK_1H_BYPASS_INTRABAR_MIN} isOverridden={'RISK_1H_BYPASS_INTRABAR_MIN' in paramsData.overrides} setAt={paramsData.overrideSetAt['RISK_1H_BYPASS_INTRABAR_MIN']} min={0} max={0.5} step={0.01} format={rawFmt} onChange={handleParamChange} onReset={handleParamReset} />
              </div>
            </div>

            {/* Regime position sizing */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Position Size Multipliers by Regime</div>
              <div className="space-y-3">
                <SliderRow label="Strong" description="mom1h ≥ 1.0% + mom4h ≥ 0.8% — confirmed trend." paramKey="REGIME_SIZE_STRONG" value={localParams.REGIME_SIZE_STRONG} envDefault={paramsData.envDefaults.REGIME_SIZE_STRONG} isOverridden={'REGIME_SIZE_STRONG' in paramsData.overrides} setAt={paramsData.overrideSetAt['REGIME_SIZE_STRONG']} min={0.5} max={2} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Moderate" description="mom1h ≥ 0.4% + mom4h ≥ 0.2% — developing trend." paramKey="REGIME_SIZE_MODERATE" value={localParams.REGIME_SIZE_MODERATE} envDefault={paramsData.envDefaults.REGIME_SIZE_MODERATE} isOverridden={'REGIME_SIZE_MODERATE' in paramsData.overrides} setAt={paramsData.overrideSetAt['REGIME_SIZE_MODERATE']} min={0.25} max={1.5} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Weak" description="mom1h ≥ 0.2% — weak trend." paramKey="REGIME_SIZE_WEAK" value={localParams.REGIME_SIZE_WEAK} envDefault={paramsData.envDefaults.REGIME_SIZE_WEAK} isOverridden={'REGIME_SIZE_WEAK' in paramsData.overrides} setAt={paramsData.overrideSetAt['REGIME_SIZE_WEAK']} min={0.1} max={1} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Transitioning" description="4h positive but 1h lagging — early move, reduced size." paramKey="REGIME_SIZE_TRANSITIONING" value={localParams.REGIME_SIZE_TRANSITIONING} envDefault={paramsData.envDefaults.REGIME_SIZE_TRANSITIONING} isOverridden={'REGIME_SIZE_TRANSITIONING' in paramsData.overrides} setAt={paramsData.overrideSetAt['REGIME_SIZE_TRANSITIONING']} min={0.1} max={1} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Choppy" description="mom4h ≤ 0 — minimal exposure, speculative entry only." paramKey="REGIME_SIZE_CHOPPY" value={localParams.REGIME_SIZE_CHOPPY} envDefault={paramsData.envDefaults.REGIME_SIZE_CHOPPY} isOverridden={'REGIME_SIZE_CHOPPY' in paramsData.overrides} setAt={paramsData.overrideSetAt['REGIME_SIZE_CHOPPY']} min={0.1} max={0.75} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
              </div>
            </div>

            {/* Profit targets */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Profit Targets by Regime</div>
              <div className="space-y-3">
                <SliderRow label="Strong" description="mom1h ≥ 1.0% + mom4h ≥ 0.8% — ride the move." paramKey="PROFIT_TARGET_STRONG" value={localParams.PROFIT_TARGET_STRONG} envDefault={paramsData.envDefaults.PROFIT_TARGET_STRONG} isOverridden={'PROFIT_TARGET_STRONG' in paramsData.overrides} setAt={paramsData.overrideSetAt['PROFIT_TARGET_STRONG']} min={0.005} max={0.12} step={0.005} format={pctFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Moderate" description="mom1h ≥ 0.4% + mom4h ≥ 0.2% — developing trend target." paramKey="PROFIT_TARGET_MODERATE" value={localParams.PROFIT_TARGET_MODERATE} envDefault={paramsData.envDefaults.PROFIT_TARGET_MODERATE} isOverridden={'PROFIT_TARGET_MODERATE' in paramsData.overrides} setAt={paramsData.overrideSetAt['PROFIT_TARGET_MODERATE']} min={0.005} max={0.12} step={0.005} format={pctFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Weak" description="mom1h ≥ 0.2% — quick exit before fade." paramKey="PROFIT_TARGET_WEAK" value={localParams.PROFIT_TARGET_WEAK} envDefault={paramsData.envDefaults.PROFIT_TARGET_WEAK} isOverridden={'PROFIT_TARGET_WEAK' in paramsData.overrides} setAt={paramsData.overrideSetAt['PROFIT_TARGET_WEAK']} min={0.005} max={0.12} step={0.005} format={pctFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Choppy" description="mom4h ≤ 0 — scalp only, fees eat anything bigger." paramKey="PROFIT_TARGET_CHOPPY" value={localParams.PROFIT_TARGET_CHOPPY} envDefault={paramsData.envDefaults.PROFIT_TARGET_CHOPPY} isOverridden={'PROFIT_TARGET_CHOPPY' in paramsData.overrides} setAt={paramsData.overrideSetAt['PROFIT_TARGET_CHOPPY']} min={0.005} max={0.12} step={0.005} format={pctFmt} onChange={handleParamChange} onReset={handleParamReset} />
              </div>
            </div>

            {/* Exit protection */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Exit Protection (Erosion Cap)</div>
              <div className="space-y-3">
                <SliderRow label="Peak Arming Threshold" description="Minimum peak profit % before erosion cap arms. Lower = more trades protected." paramKey="EROSION_PEAK_MIN_PCT" value={localParams.EROSION_PEAK_MIN_PCT} envDefault={paramsData.envDefaults.EROSION_PEAK_MIN_PCT} isOverridden={'EROSION_PEAK_MIN_PCT' in paramsData.overrides} setAt={paramsData.overrideSetAt['EROSION_PEAK_MIN_PCT']} min={0.05} max={2} step={0.05} format={rawFmt} onChange={handleParamChange} onReset={handleParamReset} />
                <SliderRow label="Erosion Exit Threshold" description="Exit when profit drops this much from peak (e.g. 0.35 = exit at 65% of peak)." paramKey="EROSION_PEAK_RELATIVE_THRESHOLD" value={localParams.EROSION_PEAK_RELATIVE_THRESHOLD} envDefault={paramsData.envDefaults.EROSION_PEAK_RELATIVE_THRESHOLD} isOverridden={'EROSION_PEAK_RELATIVE_THRESHOLD' in paramsData.overrides} setAt={paramsData.overrideSetAt['EROSION_PEAK_RELATIVE_THRESHOLD']} min={0.1} max={0.8} step={0.05} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
              </div>
            </div>

            {/* Volume / liquidity guard */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Market Liquidity Guard</div>
              <div className="space-y-3">
                <SliderRow label="BTC Min Volume Ratio" description="Block ALL entries when BTC volume is below this fraction of its 20-candle average. 0.4 = require 40% of normal volume. Lower during weekend low-liquidity periods." paramKey="RISK_BTC_MIN_VOLUME_RATIO" value={localParams.RISK_BTC_MIN_VOLUME_RATIO} envDefault={paramsData.envDefaults.RISK_BTC_MIN_VOLUME_RATIO} isOverridden={'RISK_BTC_MIN_VOLUME_RATIO' in paramsData.overrides} setAt={paramsData.overrideSetAt['RISK_BTC_MIN_VOLUME_RATIO']} min={0.01} max={0.8} step={0.01} format={multFmt} onChange={handleParamChange} onReset={handleParamReset} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRADE MONITOR ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900 dark:text-white">Trade Monitor</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${monitor?.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>{monitor?.enabled ? 'enabled' : 'disabled'}</span>
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">advisory only</span>
          </div>
          {monitor?.latest && <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(monitor.latest.timestamp).toLocaleTimeString()}</span>}
        </div>
        <div className="p-5">
          {!monitor?.latest ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">No open trades — monitor fires when trades are active</div>
          ) : (
            <div className="space-y-2">
              {monitor.latest.assessments.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEALTH_COLORS[a.status] || ''}`}>{a.status}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.pair}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 text-right max-w-[140px] sm:max-w-[200px] truncate">{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI CONFIDENCE BOOST ── */}
      {data?.confidenceBoost && (() => {
        const boost = data.confidenceBoost;
        const hitRate = (boost.callsToday + boost.cacheHitsToday) > 0
          ? ((boost.cacheHitsToday / (boost.callsToday + boost.cacheHitsToday)) * 100).toFixed(0)
          : '—';
        const estimatedBoostCost = (boost.callsToday * 0.00025).toFixed(4);
        return (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900 dark:text-white">AI Confidence Boost</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${boost.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                  {boost.enabled ? 'enabled' : 'disabled'}
                </span>
                <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">per-entry · veto gate</span>
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">±{boost.maxAdjustment} adj · window {boost.vetoWindowMin}–{boost.vetoWindowMax}</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Claude calls today</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{boost.callsToday}</div>
                  <div className="text-xs text-slate-400 mt-0.5">est. ${estimatedBoostCost}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Cache hits today</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{boost.cacheHitsToday}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{hitRate}% hit rate</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Vetos today</div>
                  <div className={`text-xl font-bold ${boost.vetosToday > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>{boost.vetosToday}</div>
                  <div className="text-xs text-slate-400 mt-0.5">trades blocked</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Skipped today</div>
                  <div className="text-xl font-bold text-slate-500 dark:text-slate-400">{boost.skippedToday}</div>
                  <div className="text-xs text-slate-400 mt-0.5">deterministic pass</div>
                </div>
              </div>

              {/* Last result */}
              {boost.lastResult ? (
                <div className={`rounded-lg border px-4 py-3 space-y-1.5 ${boost.lastResult.vetoed ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{boost.lastResult.pair}</span>
                      {boost.lastResult.vetoed
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-medium">VETOED</span>
                        : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${boost.lastResult.adjustment > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : boost.lastResult.adjustment < 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-slate-100 text-slate-500'}`}>
                            {boost.lastResult.adjustment > 0 ? '+' : ''}{boost.lastResult.adjustment}
                          </span>
                      }
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{boost.lastResult.deterministicScore} → {boost.lastResult.finalScore}</span>
                      <span>{new Date(boost.lastResult.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 italic">&quot;{boost.lastResult.reasoning}&quot;</p>
                  <div className="text-xs text-slate-400">provider: {boost.lastResult.provider}</div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No boost calls yet — fires on buy signals in veto window ({boost.vetoWindowMin}–{boost.vetoWindowMax})</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── PARAM CHANGE LOG ── */}
      {paramsData && paramsData.changelog.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-base font-semibold text-slate-900 dark:text-white">Parameter Change Log</span>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">last {paramsData.changelog.length} changes · use to evaluate impact before changing again</span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {paramsData.changelog.map((entry, i) => {
              const isReset = entry.newValue === undefined;
              const increased = !isReset && entry.oldValue !== undefined && entry.newValue! > entry.oldValue;
              const decreased = !isReset && entry.oldValue !== undefined && entry.newValue! < entry.oldValue;
              return (
                <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-mono font-medium ${isReset ? 'bg-slate-100 dark:bg-slate-700 text-slate-500' : increased ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : decreased ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                      {isReset ? '↺' : increased ? '↑' : '↓'}
                    </span>
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{entry.key}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {isReset
                      ? <span>reset to env default{entry.oldValue !== undefined ? ` (was ${entry.oldValue})` : ''}</span>
                      : <span className="font-mono">{entry.oldValue ?? 'env'} → <span className="font-semibold text-slate-700 dark:text-slate-200">{entry.newValue}</span></span>
                    }
                    <span className="text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config + Usage */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Configuration &amp; Usage</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Regime cache TTL</span><span className="font-mono text-slate-700 dark:text-slate-300">{regime?.cacheTtlSeconds}s</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Regime timeout</span><span className="font-mono text-slate-700 dark:text-slate-300">{regime?.timeoutMs}ms</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Max adjustment</span><span className="font-mono text-slate-700 dark:text-slate-300">±{maxAdj}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Monitor cache TTL</span><span className="font-mono text-slate-700 dark:text-slate-300">{monitor?.cacheTtlSeconds}s</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Monitor timeout</span><span className="font-mono text-slate-700 dark:text-slate-300">{monitor?.timeoutMs}ms</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Exit path AI</span><span className="font-mono text-emerald-600 dark:text-emerald-400">none</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Claude calls today</span><span className="font-mono text-slate-700 dark:text-slate-300">{regime?.callsToday ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Est. cost today</span><span className="font-mono text-slate-700 dark:text-slate-300">${estimatedCostToday}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Adj. override</span><span className={`font-mono ${regime?.adjustmentOverride != null ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{regime?.adjustmentOverride != null ? `${regime.adjustmentOverride > 0 ? '+' : ''}${regime.adjustmentOverride}` : 'none'}</span></div>
        </div>
      </div>
    </div>
  );
}
