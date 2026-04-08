'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { LivePnLTicker } from '@/components/trading/LivePnLTicker';
import { MarketPrices } from '@/components/trading/MarketPrices';
import { ActivityFeed } from '@/components/trading/ActivityFeed';
import { RiskMetrics } from '@/components/trading/RiskMetrics';
import { OpenClosedTrades } from '@/components/trading/OpenClosedTrades';
import { PriceProvider } from '@/contexts/PriceContext';
import { usePriceCachePolling } from '@/hooks/usePriceCachePolling';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';

/**
 * Live Trading Dashboard
 * Real-time trading monitoring with live updates
 */

interface Bot {
  id: string;
  isActive: boolean;
  botStatus: 'running' | 'paused' | 'stopped';
  enabledPairs: string[];
  exchange: string;
  tradingMode: 'paper' | 'live';
  createdAt: string;
  liveSince: string | null;
  totalTrades: number;
  profitLoss: number;
  initialCapital: number; // 0 = unlimited (uses real exchange balance)
  name: string;
  config: Record<string, unknown>;
}

export default function TradingPage() {
  const { status } = useSession();
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [liveBalances, setLiveBalances] = useState<Record<string, number>>({});
  const [liveMinimums, setLiveMinimums] = useState<Record<string, number>>({});
  const [totalAccountValues, setTotalAccountValues] = useState<Record<string, number>>({});
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [showCloseAllConfirm, setShowCloseAllConfirm] = useState(false);
  const [isTogglingBot, setIsTogglingBot] = useState(false);
  const [tradeViewMode, setTradeViewMode] = useState<'live' | 'paper' | 'all'>('live');
  const [openTradeCount, setOpenTradeCount] = useState(0);
  const selectedBotIdRef = useRef<string | null>(null);

  // Fetch bots and refresh periodically
  useEffect(() => {
    let isInitialLoad = true;

    async function fetchBots() {
      try {
        const response = await fetch('/api/bots');
        if (!response.ok) return;
        const data = await response.json();

        // Only update if data actually changed (prevents flickering re-renders)
        setBots(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) {
            return prev; // No change, keep same reference
          }
          return data;
        });

        // Preserve user selection; only set default if none or missing
        if (data.length > 0) {
          const currentSelected = selectedBotIdRef.current;
          const stillExists = currentSelected && data.some((b: Bot) => b.id === currentSelected);

          if (!currentSelected || !stillExists) {
            const activeBot = data.find((b: Bot) => b.isActive);
            const nextId = activeBot?.id || data[0].id;
            setSelectedBotId(nextId);
            selectedBotIdRef.current = nextId;
          }
        }
      } catch (err) {
        console.error('Failed to fetch bots:', err);
      } finally {
        // Only set loading false on initial load (prevents flickering)
        if (isInitialLoad) {
          setIsLoading(false);
          isInitialLoad = false;
        }
      }
    }

    // Initial fetch
    fetchBots();

    // Refresh bot data every 5 seconds for live updates
    const interval = setInterval(fetchBots, 5000);
    return () => clearInterval(interval);
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    selectedBotIdRef.current = selectedBotId;
  }, [selectedBotId]);

  //Fetch live balance for all live bots (unlimited + fixed capital)
  // Used for both position sizing display and low-balance warnings
  useEffect(() => {
    if (!selectedBotId) return;
    const bot = bots.find(b => b.id === selectedBotId);
    if (!bot || bot.tradingMode !== 'live') return;

    const fetchBalance = async () => {
      try {
        setIsLoadingBalance(true);
        const response = await fetch(`/api/bots/${selectedBotId}/balance`);
        if (!response.ok) return;
        const data = await response.json();
        setLiveBalances(prev => ({ ...prev, [selectedBotId]: data.available }));

        if (data.minimum != null) setLiveMinimums(prev => ({ ...prev, [selectedBotId]: data.minimum }));
        if (data.totalAccountValue != null) setTotalAccountValues(prev => ({ ...prev, [selectedBotId]: data.totalAccountValue }));
      } catch (err) {
        console.error('Error fetching balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [selectedBotId, bots]);

  // Get selected bot's trading pairs for price fetching
  const selectedBot = selectedBotId ? bots.find(b => b.id === selectedBotId) : null;

  // Memoize pairs to provide stable reference for hook dependency
  const selectedBotPairs = useMemo(() => {
    return selectedBot?.enabledPairs ? [...selectedBot.enabledPairs] : [];
  }, [selectedBot]);

  // Fetch prices once at page level (shared across all components)
  // Poll every 4s to match background fetcher cadence (was 10s = stale dashboard)
  const { prices, status: priceStatus, isStale, stalePairs } = usePriceCachePolling(
    selectedBotPairs,
    { pollIntervalMs: 4000, staleThresholdMs: 15000 }
  );

  const handleToggleBot = async (botId: string, currentlyActive: boolean) => {
    setIsTogglingBot(true);
    try {
      const newStatus = currentlyActive ? 'paused' : 'running';
      const response = await fetch('/api/bots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, status: newStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update bot');
      // Refresh bots list to reflect new status
      const refreshed = await fetch('/api/bots');
      if (refreshed.ok) setBots(await refreshed.json());
    } catch (err) {
      console.error('Toggle bot failed:', err);
      alert('Failed to update bot status. Please try again.');
    } finally {
      setIsTogglingBot(false);
    }
  };

  const handleCloseAll = async () => {
    if (!selectedBotId) return;
    setIsClosingAll(true);
    setShowCloseAllConfirm(false);
    try {
      const response = await fetch('/api/bots/trades/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: selectedBotId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to close trades');
      alert(`${data.message}`);
    } catch (err) {
      console.error('Close all failed:', err);
      alert('Failed to close trades. Please try again.');
    } finally {
      setIsClosingAll(false);
    }
  };

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout title="Live Trading Dashboard">
        <div className="space-y-8 animate-pulse">
          {/* Bot header skeleton */}
          <div className="rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          {/* Bot name + badges */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-9 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="h-7 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>

          {/* P&L ticker skeleton */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            <div className="flex gap-6">
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="h-7 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Risk metrics skeleton */}
          <div>
            <div className="h-7 w-36 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                  <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="h-6 w-14 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Market prices skeleton */}
          <div>
            <div className="h-7 w-36 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
                  <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Trade history skeleton */}
          <div>
            <div className="h-7 w-36 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const hasBot = bots.length > 0;

  return (
    <DashboardLayout title="Live Trading Dashboard">
      <div className="space-y-8">
        {/* No Bot Message */}
        {!hasBot && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-8 text-center">
            <p className="text-blue-700 dark:text-blue-200 mb-4 text-lg">
              📊 No trading bot created yet. Create a bot to start live trading.
            </p>
            <Link
              href="/dashboard/bots/new"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium transition"
            >
              Create Bot
            </Link>
          </div>
        )}

        {/* Bot Selector */}
        {hasBot && bots.length > 1 && (
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Bot to View
            </label>
            <select
              value={selectedBotId || ''}
              onChange={(e) => {
                setSelectedBotId(e.target.value);
              }}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name} • {bot.exchange.toUpperCase()} • {bot.tradingMode === 'paper' ? '📄 PAPER' : '💰 LIVE'} {bot.botStatus === 'running' ? '🟢' : bot.botStatus === 'paused' ? '⏸' : '⚫'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Low Balance Warning Banner — shown when live bot free cash is below minimum */}
        {selectedBot && selectedBot.tradingMode === 'live' && (() => {
          const total = totalAccountValues[selectedBot.id];
          const min = liveMinimums[selectedBot.id] ?? 1000;
          if (total == null || total >= min) return null;
          return (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg p-4 flex gap-3 items-start">
              <span className="text-red-500 text-xl mt-0.5">⚠️</span>
              <div>
                <p className="text-red-800 dark:text-red-200 font-semibold text-sm">
                  Trades paused — insufficient account value
                </p>
                <p className="text-red-700 dark:text-red-300 text-xs mt-1">
                  Total account value: <strong>{total.toFixed(2)} USDT</strong> — minimum required: <strong>{min.toLocaleString()} USDT</strong>.
                </p>
                <a
                  href={`/dashboard/bots/${selectedBot.id}`}
                  className="inline-block mt-2 text-xs text-red-700 dark:text-red-300 underline font-medium"
                >
                  Go to Bot Settings →
                </a>
              </div>
            </div>
          );
        })()}

        {/* Live Dashboard */}
        {selectedBot && (
          <div className="space-y-8">
            {/* Visual Indicator - Show which bot is active */}
            <div className={`rounded-lg p-4 border-2 ${
              selectedBot.tradingMode === 'paper'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600'
            }`}>
              <p className={`text-sm font-semibold ${
                selectedBot.tradingMode === 'paper'
                  ? 'text-blue-800 dark:text-blue-200'
                  : 'text-green-800 dark:text-green-200'
              }`}>
                📊 Currently viewing: {(selectedBot.exchange || 'Unknown').toUpperCase()} {selectedBot.tradingMode === 'paper' ? '📄 PAPER TRADING' : '💰 LIVE TRADING'} • ID: {selectedBot.id.slice(0, 12)}...
              </p>
            </div>

            <PriceProvider
              prices={prices}
              status={priceStatus}
              isStale={isStale}
              stalePairs={stalePairs}
            >
              {/* Stale price warning */}
              {isStale && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-600 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="text-yellow-600 dark:text-yellow-300 font-semibold text-sm">⚠️ Prices may be stale (15+ seconds old)</span>
                  {stalePairs.length > 0 && (
                    <span className="text-yellow-500 dark:text-yellow-400 text-xs">— affected: {stalePairs.join(', ')}</span>
                  )}
                </div>
              )}
              {/* Bot Status Badge */}
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {selectedBot.name}
                </h1>
                {selectedBot.liveSince && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    Live since {new Date(selectedBot.liveSince).toLocaleDateString()}
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  selectedBot.tradingMode === 'paper'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                }`}>
                  {selectedBot.tradingMode === 'paper' ? '📄 PAPER' : '💰 LIVE'}
                </span>
                {selectedBot.botStatus === 'running' && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                    🟢 Running
                  </span>
                )}
                {selectedBot.botStatus === 'paused' && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                    ⏸ Paused
                  </span>
                )}
                {selectedBot.botStatus === 'stopped' && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                    🔴 Stopped
                  </span>
                )}
                {/* Pause / Resume button */}
                {(() => {
                  const isResuming = selectedBot.botStatus !== 'running';
                  const total = totalAccountValues[selectedBot.id];
                  const min = liveMinimums[selectedBot.id] ?? 1000;
                  const blockedByBalance = isResuming && selectedBot.tradingMode === 'live' && total != null && total < min;
                  return (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => !blockedByBalance && handleToggleBot(selectedBot.id, selectedBot.botStatus === 'running')}
                        disabled={isTogglingBot || blockedByBalance}
                        title={blockedByBalance ? `Total account value $${total?.toFixed(2)} is below the $${min.toLocaleString()} minimum` : undefined}
                        className={`px-3 py-1 rounded text-sm font-semibold transition ${
                          blockedByBalance
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                            : selectedBot.botStatus === 'running'
                              ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 disabled:opacity-50'
                              : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/60 disabled:opacity-50'
                        }`}
                      >
                        {isTogglingBot ? '⟳' : selectedBot.botStatus === 'running' ? '⏸ Pause' : '▶ Resume'}
                      </button>
                      {blockedByBalance && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Add funds first — account value ${total?.toFixed(0)} &lt; ${min.toLocaleString()} min
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Close All Button — only shown when there are open trades */}
              {openTradeCount > 0 && <div className="flex justify-end mt-2">
                {showCloseAllConfirm ? (
                  <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg px-4 py-2">
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">
                      Close all open trades at market price?
                    </span>
                    <button
                      onClick={handleCloseAll}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded transition"
                    >
                      Yes, Close All
                    </button>
                    <button
                      onClick={() => setShowCloseAllConfirm(false)}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-sm font-semibold rounded transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCloseAllConfirm(true)}
                    disabled={isClosingAll}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition"
                  >
                    {isClosingAll ? '⟳ Closing...' : '🚨 Close All Trades'}
                  </button>
                )}
              </div>}

              {/* Stats Mode Toggle — shown only for live bots that have a live_since date */}
              {selectedBot.tradingMode === 'live' && selectedBot.liveSince && (
                <div className="flex items-center gap-1 mt-4">
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Stats:</span>
                  {(['live', 'paper', 'all'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setTradeViewMode(m)}
                      className={`px-3 py-1 text-xs font-medium rounded transition ${
                        tradeViewMode === m
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {m === 'live' ? '💰 Live Only' : m === 'paper' ? '📄 Paper Only' : '📊 All'}
                    </button>
                  ))}
                </div>
              )}

              {/* Bot Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mt-4">
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                    {selectedBot.initialCapital === 0 ? 'Available Balance' : 'Initial Capital'}
                  </p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">
                    {selectedBot.initialCapital === 0
                      ? isLoadingBalance && !liveBalances[selectedBot.id]
                        ? '⟳ Loading...'
                        : liveBalances[selectedBot.id]
                        ? `$${liveBalances[selectedBot.id].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 🔓`
                        : '⚠️ Unavailable'
                      : `$${selectedBot.initialCapital.toLocaleString()}`}
                  </p>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Profit / Loss</p>
                  <p
                    className={`text-xl font-semibold ${
                      selectedBot.profitLoss >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    ${selectedBot.profitLoss.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Total Trades</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">{selectedBot.totalTrades}</p>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Pairs</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">{selectedBot.enabledPairs.length}</p>
                </div>
              </div>

              {/* Main P&L Ticker */}
              <div>
                <LivePnLTicker
                  bot={selectedBot}
                  modeFilter={selectedBot.tradingMode === 'live' && selectedBot.liveSince ? tradeViewMode : 'all'}
                />
              </div>

              {/* Risk Metrics */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  ⚖️ Risk Metrics
                </h2>
                <RiskMetrics
                  botId={selectedBot.id}
                  modeFilter={selectedBot.tradingMode === 'live' && selectedBot.liveSince ? tradeViewMode : 'all'}
                />
              </div>

              {/* Market Prices */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  📈 Market Prices
                </h2>
                <MarketPrices />
              </div>

              {/* Activity Feed */}
              <div>
                <ActivityFeed
                  botId={selectedBot.id}
                  modeFilter={selectedBot.tradingMode === 'live' && selectedBot.liveSince ? tradeViewMode : 'all'}
                />
              </div>

              {/* Open and Closed Trades */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  📊 Trade History
                </h2>
                <OpenClosedTrades
                  botId={null}
                  modeFilter={selectedBot.tradingMode === 'live' && selectedBot.liveSince ? tradeViewMode : 'all'}
                  onOpenTradeCount={setOpenTradeCount}
                />
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-200">
                  💡 <strong>Live Dashboard:</strong> All data updates in real-time. Market prices and unrealized P&L refresh every 10 seconds. For full bot configuration and historical analysis, visit the <Link href="/dashboard/bots" className="underline font-semibold">Bot Management</Link> page.
                </p>
              </div>
            </PriceProvider>
          </div>
        )}

        {/* No Selected Bot */}
        {!selectedBot && hasBot && bots.length === 1 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 rounded-lg p-8 text-center">
            <p className="text-green-700 dark:text-green-200 mb-4 text-lg">
              ✅ You have 1 bot configured. Loading dashboard...
            </p>
            <Link
              href="/dashboard/bots"
              className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded font-medium transition"
            >
              Manage Bot
            </Link>
          </div>
        )}

        {/* Bot Selection Error */}
        {!selectedBot && hasBot && bots.length > 1 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500 rounded-lg p-8 text-center">
            <p className="text-yellow-700 dark:text-yellow-200 mb-2 text-lg">
              ⏹️ Select a bot from the dropdown above to view trading stats.
            </p>
            <p className="text-yellow-600 dark:text-yellow-300 text-sm mb-4">
              {selectedBotId ? `Bot ID: ${selectedBotId} (not found in list)` : 'No bot selected'}
            </p>
            <Link
              href="/dashboard/bots"
              className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded font-medium transition"
            >
              Go to Bot Management
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
