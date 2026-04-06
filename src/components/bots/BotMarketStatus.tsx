'use client';

import { useEffect, useState } from 'react';

interface PairStatus {
  regime: string;
  momentum1h: number;
  momentum4h: number;
  volumeRatio: number;
  blockReason: string | null;
  blockStage: string | null;
  enteredAt: string | null;
}

interface MarketStatus {
  pairs: Record<string, PairStatus>;
  updatedAt: number;
}

const REGIME_BADGE: Record<string, string> = {
  strong:        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  moderate:      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  weak:          'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  choppy:        'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  transitioning: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  unknown:       'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
};

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function MomentumCell({ label, value }: { label: string; value: number }) {
  const color =
    value >= 0.5 ? 'text-green-600 dark:text-green-400' :
    value >= 0   ? 'text-yellow-600 dark:text-yellow-400' :
                   'text-red-500 dark:text-red-400';
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{fmt(value)}</span>
    </div>
  );
}

function VolumeCell({ ratio }: { ratio: number }) {
  const pct = (ratio * 100).toFixed(0);
  const color =
    ratio >= 0.2 ? 'text-green-600 dark:text-green-400' :
    ratio >= 0.1 ? 'text-yellow-600 dark:text-yellow-400' :
                   'text-red-500 dark:text-red-400';
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Vol</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{pct}%</span>
    </div>
  );
}

function PairCard({ pair, status }: { pair: string; status: PairStatus }) {
  const regime = status.regime.toLowerCase();
  const badge = REGIME_BADGE[regime] ?? REGIME_BADGE.unknown;
  const blocked = !!status.blockReason;

  return (
    <div className={`rounded-lg border p-4 ${
      blocked
        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
        : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${blocked ? 'bg-amber-400' : 'bg-green-500'}`} />
          <span className="font-semibold text-slate-900 dark:text-white text-sm">{pair}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${badge}`}>
          {regime}
        </span>
      </div>

      {/* Momentum / volume row */}
      <div className="flex items-center justify-around bg-slate-50 dark:bg-slate-700/50 rounded-md py-2 px-1 mb-3">
        <MomentumCell label="1h Mom" value={status.momentum1h} />
        <div className="w-px h-7 bg-slate-200 dark:bg-slate-600" />
        <MomentumCell label="4h Mom" value={status.momentum4h} />
        <div className="w-px h-7 bg-slate-200 dark:bg-slate-600" />
        <VolumeCell ratio={status.volumeRatio} />
      </div>

      {/* Block / entry status */}
      {blocked ? (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-500 text-xs">⛔</span>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {status.blockStage ?? 'Entry blocked'}
            </span>
          </div>
          {/* Raw reason — exact text from the orchestrator so nothing is hidden */}
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug font-mono break-words">
            {status.blockReason}
          </p>
          <p className="text-[10px] text-amber-500 dark:text-amber-500 mt-1">
            Will enter automatically when conditions clear
          </p>
        </div>
      ) : (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2 flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <p className="text-xs font-medium text-green-700 dark:text-green-300">
            Trade entered{status.enteredAt ? ` at ${new Date(status.enteredAt).toLocaleTimeString()}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export function BotMarketStatus() {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prevStatus, setPrevStatus] = useState<MarketStatus | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/bots/market-status');
        if (!res.ok) return;
        const data: MarketStatus = await res.json();
        setStatus(prev => {
          setPrevStatus(prev);
          return data;
        });
        if (data.updatedAt) setLastUpdated(new Date(data.updatedAt));
      } catch {}
    }

    fetchStatus();
    const id = setInterval(fetchStatus, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!status || Object.keys(status.pairs).length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">📡 Market Status</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Waiting for first analysis cycle…</p>
      </div>
    );
  }

  const pairs = Object.entries(status.pairs);
  const blockedPairs = pairs.filter(([, s]) => s.blockReason);
  const tradingPairs = pairs.filter(([, s]) => !s.blockReason);

  // Detect pairs that just changed state vs prev cycle
  const changedPairs = prevStatus
    ? pairs.filter(([p, s]) => {
        const prev = prevStatus.pairs[p];
        if (!prev) return false;
        const wasBlocked = !!prev.blockReason;
        const nowBlocked = !!s.blockReason;
        return wasBlocked !== nowBlocked;
      }).map(([p]) => p)
    : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Market Status</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            tradingPairs.length > 0
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          }`}>
            {tradingPairs.length > 0
              ? `${tradingPairs.length} trading`
              : `${blockedPairs.length} watching`}
          </span>
          {changedPairs.length > 0 && (
            <span className="text-xs text-blue-500 dark:text-blue-400 animate-pulse">
              ↺ {changedPairs.join(', ')} changed
            </span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Summary when all blocked */}
      {blockedPairs.length === pairs.length && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Regime is down — protecting capital.</span>{' '}
            All pairs blocked this cycle. Blocks lift automatically when momentum recovers.
          </p>
          {/* Quick summary of distinct block stages */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set(blockedPairs.map(([, s]) => s.blockStage).filter(Boolean))].map(stage => (
              <span key={stage} className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5 font-mono">
                {stage}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-pair cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pairs.map(([pair, pairStatus]) => (
          <PairCard key={pair} pair={pair} status={pairStatus} />
        ))}
      </div>
    </div>
  );
}
