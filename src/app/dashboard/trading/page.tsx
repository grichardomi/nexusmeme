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
  enabledPairs: string[];
  exchange: string;
  tradingMode: 'paper' | 'live';
  createdAt: string;
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
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const selectedBotIdRef = useRef<string | null>(null);

  // Fetch bots and refresh periodically
  useEffect(() => {
    async function fetchBots() {
      try {
        const response = await fetch('/api/bots');
        if (!response.ok) return;
        const data = await response.json();
        setBots(data);

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
        setIsLoading(false);
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

  // Fetch live balance for unlimited capital bots
  useEffect(() => {
    if (!selectedBotId) {
      return;
    }

    const bot = bots.find(b => b.id === selectedBotId);
    if (!bot) {
      return;
    }

    // Check if bot has unlimited capital (0 = unlimited)
    const isUnlimited = bot.initialCapital === 0;
    if (!isUnlimited) {
      return;
    }

    const fetchBalance = async () => {
      try {
        setIsLoadingBalance(true);
        const response = await fetch(`/api/bots/${selectedBotId}/balance`);

        if (!response.ok) {
          console.error('Failed to fetch balance:', response.status);
          return;
        }

        const data = await response.json();
        setLiveBalances(prev => ({
          ...prev,
          [selectedBotId]: data.available,
        }));
      } catch (err) {
        console.error('Error fetching balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Fetch immediately
    fetchBalance();

    // Refresh every 10 seconds
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [selectedBotId, bots]);

  // Get selected bot's trading pairs for price fetching
  const selectedBot = selectedBotId ? bots.find(b => b.id === selectedBotId) : null;

  // Memoize pairs to provide stable reference for hook dependency
  const selectedBotPairs = useMemo(() => {
    return selectedBot?.enabledPairs ? [...selectedBot.enabledPairs] : [];
  }, [selectedBot]);

  // Fetch prices once at page level (shared across all components)
  const { prices, status: priceStatus, isStale, stalePairs } = usePriceCachePolling(
    selectedBotPairs,
    { pollIntervalMs: 10000, staleThresholdMs: 30000 }
  );

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout title={selectedBot ? selectedBot.name : 'Live Trading Dashboard'}>
        <div className="text-center py-12">
          <p className="text-slate-600 dark:text-slate-400">Initializing dashboard...</p>
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
                  {bot.exchange} {bot.tradingMode === 'paper' ? '📄 PAPER' : '💰 LIVE'} {bot.isActive ? '🟢' : '⚫'} (ID: {bot.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>
        )}

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
              {/* Bot Status Badge */}
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {selectedBot.name}
                </h1>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  selectedBot.tradingMode === 'paper'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                }`}>
                  {selectedBot.tradingMode === 'paper' ? '📄 PAPER' : '💰 LIVE'}
                </span>
                {selectedBot.isActive && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                    🟢 Running
                  </span>
                )}
                {!selectedBot.isActive && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                    🔴 Stopped
                  </span>
                )}
              </div>

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
                <LivePnLTicker bot={selectedBot} />
              </div>

              {/* Risk Metrics */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  ⚖️ Risk Metrics
                </h2>
                <RiskMetrics botId={selectedBot.id} />
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
                <ActivityFeed botId={selectedBot.id} />
              </div>

              {/* Open and Closed Trades */}
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                  📊 Trade History
                </h2>
                <OpenClosedTrades botId={selectedBot.id} />
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
