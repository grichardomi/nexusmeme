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

interface AgentsData {
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
  };
  tradeMonitor: {
    enabled: boolean;
    cacheTtlSeconds: number;
    timeoutMs: number;
    latest: { assessments: TradeAssessment[]; timestamp: string } | null;
  };
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

export default function AgentsDashboardPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [overrideInput, setOverrideInput] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/auth/signin');
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') redirect('/dashboard');
  }, [status, session]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agents');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
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
      if (res.ok) {
        flash('Cache flushed — next cycle will call Claude', true);
        await fetchData();
      } else {
        flash('Flush failed', false);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const setOverride = async () => {
    const val = Number(overrideInput);
    const max = data?.regimeAgent.maxAdjustment ?? 10;
    if (isNaN(val) || val < -max || val > max) {
      flash(`Value must be between -${max} and +${max}`, false);
      return;
    }
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_override', value: val }),
      });
      if (res.ok) {
        flash(`Override set to ${val > 0 ? '+' : ''}${val}`, true);
        setShowOverrideInput(false);
        setOverrideInput('');
        await fetchData();
      } else {
        const err = await res.json();
        flash(err.error ?? 'Failed', false);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const clearOverride = async () => {
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_override' }),
      });
      if (res.ok) {
        flash('Override cleared — agent value restored', true);
        await fetchData();
      } else {
        flash('Failed to clear override', false);
      }
    } finally {
      setActionBusy(false);
    }
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

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Agentic AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">BTC regime agent + trade monitor</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          actionMsg.ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* Regime Agent */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900 dark:text-white">Regime Agent</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${regime?.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
              {regime?.enabled ? 'enabled' : 'disabled'}
            </span>
            {regime?.adjustmentOverride !== null && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                override active
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">{regime?.model}</span>
        </div>

        <div className="p-5">
          {!regime?.state ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
              No data yet — agent fires on next orchestrator cycle
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cache age bar */}
              {regime.ageSeconds !== null && (
                <AgeIndicator ageSeconds={regime.ageSeconds} ttlSeconds={regime.cacheTtlSeconds} />
              )}

              {/* Key metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">BTC Regime</div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REGIME_COLORS[regime.state.btcRegime] || ''}`}>
                    {regime.state.btcRegime.toUpperCase()}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Entry Adjustment
                    {regime.adjustmentOverride !== null && (
                      <span className="ml-1 text-amber-500">(overridden)</span>
                    )}
                  </div>
                  <span className={`text-lg font-bold ${ADJUSTMENT_COLOR(regime.state.entryBarAdjustment)}`}>
                    {regime.state.entryBarAdjustment > 0 ? '+' : ''}{regime.state.entryBarAdjustment}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">/ ±{maxAdj}</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">BTC Leading</div>
                  <span className={`text-sm font-medium ${regime.state.btcLeading ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {regime.state.btcLeading ? 'Confirming' : 'Diverging'}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Transition</div>
                  {regime.state.trendTransitioning ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      regime.state.transitionDirection === 'weakening'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    }`}>
                      {regime.state.transitionDirection.toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-slate-500">Stable</span>
                  )}
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Agent reasoning</div>
                <p className="text-sm text-slate-700 dark:text-slate-200 italic">&quot;{regime.state.reasoning}&quot;</p>
              </div>

              {/* Impact */}
              {regime.state.entryBarAdjustment !== 0 && (
                <div className={`rounded-lg px-4 py-3 text-sm ${
                  regime.state.entryBarAdjustment < 0
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {regime.state.entryBarAdjustment < 0
                    ? `Entry confidence pre-adjusted ${regime.state.entryBarAdjustment} — raises bar before Claude veto check. Fake rally risk flagged.`
                    : `Entry confidence pre-adjusted +${regime.state.entryBarAdjustment} — lowers bar before Claude veto check. Sustained move confirmed.`
                  }
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Controls</div>

          <div className="flex flex-wrap gap-2">
            {/* Force refresh */}
            <button
              onClick={flushCache}
              disabled={actionBusy}
              className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition font-medium"
            >
              Force Refresh Now
            </button>

            {/* Override or clear */}
            {regime?.adjustmentOverride !== null ? (
              <button
                onClick={clearOverride}
                disabled={actionBusy}
                className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 transition font-medium"
              >
                Clear Override (restore agent)
              </button>
            ) : (
              <button
                onClick={() => setShowOverrideInput(v => !v)}
                disabled={actionBusy}
                className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition font-medium"
              >
                Override Adjustment
              </button>
            )}

            {/* Neutral override shortcut */}
            {regime?.adjustmentOverride === null && (
              <button
                onClick={async () => {
                  setActionBusy(true);
                  await fetch('/api/admin/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'set_override', value: 0 }),
                  });
                  flash('Override set to 0 — agent paused at neutral', true);
                  await fetchData();
                  setActionBusy(false);
                }}
                disabled={actionBusy}
                className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition font-medium"
              >
                Pause at Neutral (0)
              </button>
            )}
          </div>

          {/* Override input */}
          {showOverrideInput && regime?.adjustmentOverride === null && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={-maxAdj}
                max={maxAdj}
                value={overrideInput}
                onChange={e => setOverrideInput(e.target.value)}
                placeholder={`-${maxAdj} to +${maxAdj}`}
                className="text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={setOverride}
                disabled={actionBusy || overrideInput === ''}
                className="text-xs px-3 py-2 min-h-[36px] rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition font-medium"
              >
                Apply
              </button>
              <button
                onClick={() => { setShowOverrideInput(false); setOverrideInput(''); }}
                className="text-xs px-3 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trade Monitor */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900 dark:text-white">Trade Monitor</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${monitor?.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
              {monitor?.enabled ? 'enabled' : 'disabled'}
            </span>
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">advisory only</span>
          </div>
          {monitor?.latest && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date(monitor.latest.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="p-5">
          {!monitor?.latest ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
              No open trades — monitor fires when trades are active
            </div>
          ) : (
            <div className="space-y-2">
              {monitor.latest.assessments.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEALTH_COLORS[a.status] || ''}`}>
                      {a.status}
                    </span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.pair}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 text-right max-w-[140px] sm:max-w-[200px] truncate">{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
