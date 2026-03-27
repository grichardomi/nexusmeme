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
  strong:       'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  moderate:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  weak:         'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  choppy:       'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  transitioning:'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  unknown:      'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
};

function fmt(n: number, decimals = 2) {
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%';
}

function MomentumBadge({ value, label }: { value: number; label: string }) {
  const color = value >= 0.5
    ? 'text-green-600 dark:text-green-400'
    : value >= 0
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400';
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{fmt(value)}</span>
    </div>
  );
}

function VolumeBadge({ ratio }: { ratio: number }) {
  const pct = (ratio * 100).toFixed(0);
  const color = ratio >= 0.2
    ? 'text-green-600 dark:text-green-400'
    : ratio >= 0.1
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400';
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-slate-500 dark:text-slate-400">Volume</span>
      <span className={`text-sm font-semibold ${color}`}>{pct}%</span>
    </div>
  );
}

function BlockReasonBadge({ reason, stage }: { reason: string; stage: string | null }) {
  // Simplify reason for user display
  const friendly = reason.includes('Volume too thin')
    ? 'Waiting for volume'
    : reason.includes('momentum') && reason.includes('<')
    ? 'Momentum too weak'
    : reason.includes('direction not confirmed')
    ? 'Direction not confirmed'
    : reason.includes('BTC dump')
    ? 'BTC market protection active'
    : reason.includes('spread')
    ? 'Spread too wide'
    : reason;

  return (
    <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
      <span className="text-amber-500 mt-0.5 shrink-0">⏳</span>
      <div>
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {stage ? `${stage}: ` : ''}{friendly}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          Bot will enter automatically when conditions improve
        </p>
      </div>
    </div>
  );
}

function PairCard({ pair, status }: { pair: string; status: PairStatus }) {
  const regime = status.regime.toLowerCase();
  const badge = REGIME_BADGE[regime] || REGIME_BADGE.unknown;
  const isTrading = !status.blockReason;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${isTrading ? 'bg-green-500' : 'bg-amber-400'}`} />
          <span className="font-semibold text-slate-900 dark:text-white text-sm">{pair}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${badge}`}>
          {regime}
        </span>
      </div>

      {/* Indicators row */}
      <div className="flex items-center justify-around bg-slate-50 dark:bg-slate-700/50 rounded-md py-2 px-1 mb-3">
        <MomentumBadge value={status.momentum1h} label="1h Mom" />
        <div className="w-px h-8 bg-slate-200 dark:bg-slate-600" />
        <MomentumBadge value={status.momentum4h} label="4h Mom" />
        <div className="w-px h-8 bg-slate-200 dark:bg-slate-600" />
        <VolumeBadge ratio={status.volumeRatio} />
      </div>

      {/* Status */}
      {isTrading ? (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
          <span className="text-green-500">✓</span>
          <p className="text-xs font-medium text-green-700 dark:text-green-300">
            Trade entered {status.enteredAt ? new Date(status.enteredAt).toLocaleTimeString() : ''}
          </p>
        </div>
      ) : (
        <BlockReasonBadge reason={status.blockReason!} stage={status.blockStage} />
      )}
    </div>
  );
}

export function BotMarketStatus() {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/bots/market-status');
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data);
        if (data.updatedAt) setLastUpdated(new Date(data.updatedAt));
      } catch {}
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (!status || Object.keys(status.pairs).length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">📡 Market Status</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Waiting for first analysis cycle…</p>
      </div>
    );
  }

  const allBlocked = Object.values(status.pairs).every(p => p.blockReason !== null);
  const anyTrading = Object.values(status.pairs).some(p => !p.blockReason);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Market Status</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            anyTrading
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          }`}>
            {anyTrading ? 'Trading' : 'Watching'}
          </span>
        </div>
        {lastUpdated && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Summary banner when all pairs blocked */}
      {allBlocked && (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">Bot is protecting your capital.</span>{' '}
          Current conditions don&apos;t meet entry criteria. It will trade automatically when market improves.
        </div>
      )}

      {/* Per-pair cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(status.pairs).map(([pair, pairStatus]) => (
          <PairCard key={pair} pair={pair} status={pairStatus} />
        ))}
      </div>
    </div>
  );
}
