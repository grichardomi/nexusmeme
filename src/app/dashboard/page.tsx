'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { TrialWarningBanner } from '@/components/billing/TrialWarningBanner';
import { useLoadMore } from '@/hooks/useLoadMore';

/**
 * Dashboard Home Page - Mobile-First Design
 * Main dashboard overview with real-time data
 */

interface Bot {
  id: string;
  isActive: boolean;
  exchange: string;
  enabledPairs: string[];
}

interface Trade {
  id: string;
  pair: string;
  entryPrice: number;
  exitPrice: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  status: string;
  entryTime: string;
  exitTime: string | null;
  exitReason: string | null;
}

interface DashboardStats {
  totalProfit: number;
  activeBots: number;
  winRate: number;
  totalTrades: number;
  profitFactor?: number;
  sharpeRatio?: number;
}

type StatusFilter = 'all' | 'open' | 'closed' | 'profitable' | 'losses';

export default function DashboardPage() {
  const { status } = useSession();
  const [bots, setBots] = useState<Bot[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalProfit: 0,
    activeBots: 0,
    winRate: 0,
    totalTrades: 0,
    profitFactor: 0,
    sharpeRatio: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  // Memoize fetch function with status filter
  const fetchTradesData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/trades?offset=${offset}&limit=${limit}&status=${statusFilter}`);
    if (!response.ok) throw new Error('Failed to fetch trades');

    const data = await response.json();
    return {
      items: data.trades || [],
      total: data.total || 0,
    };
  }, [statusFilter]);

  // Use Load More hook for trades
  const { items: trades, isLoading: tradesLoading, error: tradesError, hasMore, load: loadTrades, loadMore } = useLoadMore<Trade>({
    initialPageSize: 10,
    pageSize: 10,
    fetchFn: fetchTradesData,
  });

  // Hooks must be called before any conditional returns
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch bots
        try {
          const botsResponse = await fetch('/api/bots');
          if (botsResponse.ok) {
            const botsData = await botsResponse.json();
            setBots(Array.isArray(botsData) ? botsData : []);
          }
        } catch (err) {
          console.error('Failed to fetch bots:', err);
          setBots([]);
        }

        // Load initial trades
        loadTrades();

        // Fetch stats
        const statsResponse = await fetch('/api/trades?limit=1000');
        if (statsResponse.ok) {
          const data = await statsResponse.json();
          const tradeStats = data.stats || {};
          setStats(prev => ({
            ...prev,
            winRate: tradeStats.winRate ?? 0,
            totalTrades: tradeStats.totalTrades ?? 0,
            profitFactor: tradeStats.profitFactor,
            sharpeRatio: tradeStats.sharpeRatio,
            totalProfit: tradeStats.totalProfit ?? 0,
          }));
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [loadTrades]);

  // Update active bots count
  useEffect(() => {
    const activeBotCount = bots.filter(b => b.isActive).length;
    setStats(prev => ({ ...prev, activeBots: activeBotCount }));
  }, [bots]);

  // Load trades when filter changes
  useEffect(() => {
    if (!isLoading) {
      loadTrades();
    }
  }, [statusFilter]);

  // Smooth scroll to new items after load more completes
  useEffect(() => {
    if (!isLoadingMore && trades.length > previousCountRef.current && previousCountRef.current > 0) {
      requestAnimationFrame(() => {
        loadMoreRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
    previousCountRef.current = trades.length;
  }, [trades.length, isLoadingMore]);

  // Handle load more with loading state
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    await loadMore();
    setIsLoadingMore(false);
  };

  const isInitialTradesLoading = tradesLoading && trades.length === 0;

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
      <DashboardLayout title="Overview">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-100 dark:bg-slate-700 rounded-lg h-24 animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  const filterButtons: { value: StatusFilter; label: string; icon: string }[] = [
    { value: 'all', label: 'All', icon: '📊' },
    { value: 'open', label: 'Open', icon: '◔' },
    { value: 'closed', label: 'Closed', icon: '✓' },
    { value: 'profitable', label: 'Wins', icon: '↗' },
    { value: 'losses', label: 'Losses', icon: '↘' },
  ];

  return (
    <DashboardLayout title="Overview">
      {/* Trial Warning Banner */}
      <div className="mb-6">
        <TrialWarningBanner minimal={false} />
      </div>

      {/* Primary Stats - Mobile-First Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Active Bots Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Active Bots</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.activeBots}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {stats.activeBots > 0 ? 'Running' : 'Ready'}
          </div>
        </div>

        {/* Total Profit Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total P&L</div>
          <div
            className={`text-2xl font-bold ${
              stats.totalProfit >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            ${Math.abs(stats.totalProfit).toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">All time</div>
        </div>

        {/* Win Rate Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Win Rate</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{stats.totalTrades} trades</div>
        </div>

        {/* Sharpe Ratio Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Sharpe Ratio</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.sharpeRatio?.toFixed(2) ?? '—'}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Risk-adjusted</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 mb-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {bots.length === 0 && (
            <Link
              href="/dashboard/bots/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition text-sm text-center"
            >
              + Create Bot
            </Link>
          )}
          <Link
            href="/dashboard/trading"
            className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition text-sm text-center"
          >
            📊 Live Trading
          </Link>
          <Link
            href="/dashboard/portfolio"
            className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition text-sm text-center"
          >
            📈 Portfolio
          </Link>
          <Link
            href="/help"
            className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition text-sm text-center"
          >
            ❓ Help
          </Link>
        </div>
      </div>

      {/* Bot Status Card - When Bot Exists */}
      {bots.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Your Trading Bot</h2>
            <Link
              href={`/dashboard/bots/${bots[0].id}`}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Configure →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {/* Status */}
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${bots[0].isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <p className={`text-sm font-semibold ${bots[0].isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {bots[0].isActive ? 'Running' : 'Stopped'}
                </p>
              </div>
            </div>

            {/* Exchange */}
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Exchange</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {bots[0].exchange.toUpperCase()}
              </p>
            </div>

            {/* Trading Pairs */}
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Pairs</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {bots[0].enabledPairs.length}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <Link
            href={`/dashboard/bots/${bots[0].id}`}
            className={`inline-block w-full text-center px-4 py-2 rounded font-medium transition text-sm ${
              bots[0].isActive
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40'
                : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40'
            }`}
          >
            {bots[0].isActive ? '⏹️ Stop Bot' : '▶️ Start Bot'}
          </Link>
        </div>
      )}

      {/* Recent Trades - Collapsible with Mobile-First Cards */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setTradesOpen(prev => !prev)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent Trades</h2>
            {trades.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                {trades.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Last 2 years</span>
            <svg
              className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${tradesOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {tradesOpen && (
          <div className="px-4 pb-4">
            {/* Export & Filters Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => (window.location.href = '/api/trades?type=export')}
                className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition"
              >
                📥 Export CSV
              </button>

              {/* Status Filters */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {filterButtons.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                      statusFilter === filter.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {filter.icon} {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trades List */}
            {isInitialTradesLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-20" />
                ))}
              </div>
            ) : trades.length === 0 ? (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                {bots.length === 0 ? (
                  <>
                    <p className="text-sm mb-3">Create a trading bot to get started!</p>
                    <Link
                      href="/dashboard/bots/new"
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition text-sm"
                    >
                      Create Bot
                    </Link>
                  </>
                ) : statusFilter === 'all' ? (
                  <>
                    <p className="text-sm mb-2">No trades yet</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Trades will appear here once your bot executes them
                    </p>
                  </>
                ) : (
                  <p className="text-sm">No {statusFilter} trades</p>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Cards */}
                <div className="space-y-2">
                  {trades.map(trade => (
                    <div
                      key={trade.id}
                      className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border-l-4"
                      style={{
                        borderLeftColor:
                          trade.status === 'closed'
                            ? trade.profitLoss && trade.profitLoss >= 0
                              ? '#10b981'
                              : '#ef4444'
                            : '#3b82f6',
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">
                            {trade.pair}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {new Date(trade.entryTime).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            trade.status === 'closed'
                              ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          }`}
                        >
                          {trade.status === 'closed' ? '✓' : '◔'}
                        </span>
                      </div>

                      <div className="flex items-end justify-between">
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          <span>${trade.entryPrice.toFixed(2)}</span>
                          {trade.exitPrice && (
                            <span> → ${trade.exitPrice.toFixed(2)}</span>
                          )}
                        </div>

                        {trade.status === 'closed' && trade.profitLoss !== null ? (
                          <div className="text-right">
                            <p
                              className={`text-sm font-bold ${
                                trade.profitLoss >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {trade.profitLossPercent?.toFixed(2)}%
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">Open</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scroll anchor */}
                <div ref={loadMoreRef} />

                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className={`w-full px-4 py-2 rounded-lg font-medium transition-all ${
                        isLoadingMore
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isLoadingMore ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Loading...
                        </span>
                      ) : (
                        'Load More'
                      )}
                    </button>
                  </div>
                )}

                {/* Error on load more */}
                {tradesError && trades.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm mt-3">
                    {tradesError}
                    <button onClick={handleLoadMore} className="ml-2 underline font-medium">
                      Retry
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
