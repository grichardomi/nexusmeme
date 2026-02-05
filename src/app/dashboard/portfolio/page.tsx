'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';

/**
 * Portfolio Page - Mobile-First Design
 * View portfolio holdings and performance
 */

interface Trade {
  id: string;
  botId: string;
  pair: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string;
  exitTime: string | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  status: string;
  exitReason: string | null;
}

interface TradeStats {
  totalTrades: number;
  completedTrades: number;
  totalProfit: number;
  winRate: number;
  averageReturn: number;
  sharpeRatio?: number;
  profitFactor?: number;
  maxDrawdown?: number;
  riskRewardRatio?: number;
}

type StatusFilter = 'all' | 'open' | 'closed' | 'profitable' | 'losses';

export default function PortfolioPage() {
  const { status } = useSession();
  const [stats, setStats] = useState<TradeStats>({
    totalTrades: 0,
    completedTrades: 0,
    totalProfit: 0,
    winRate: 0,
    averageReturn: 0,
    sharpeRatio: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    riskRewardRatio: 0,
  });
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isRiskMetricsCollapsed, setIsRiskMetricsCollapsed] = useState(true);
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
  const { items: trades, isLoading: tradesLoading, error, hasMore, load: loadTrades, loadMore } = useLoadMore<Trade>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchTradesData,
  });

  // Fetch stats on mount
  useEffect(() => {
    async function fetchStats() {
      try {
        const statsResponse = await fetch('/api/trades?limit=1000');
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData.stats || {
            totalTrades: 0,
            completedTrades: 0,
            totalProfit: 0,
            winRate: 0,
            averageReturn: 0,
            sharpeRatio: 0,
            profitFactor: 0,
            maxDrawdown: 0,
            riskRewardRatio: 0,
          });
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setIsLoadingInitial(false);
      }
    }

    fetchStats();
  }, []);

  // Load trades when filter changes
  useEffect(() => {
    loadTrades();
  }, [statusFilter, loadTrades]);

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

  const isInitialLoading = tradesLoading && trades.length === 0;

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  if (status === 'loading' || isLoadingInitial) {
    return (
      <DashboardLayout title="Portfolio">
        <div className="text-center py-12">
          <p className="text-slate-600 dark:text-slate-400">Loading portfolio data...</p>
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
    <DashboardLayout title="Portfolio">
      <div className="space-y-4 sm:space-y-6">
        {/* Primary Stats - Mobile-First Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Trades</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.totalTrades}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stats.completedTrades} completed
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">All Time P&L</div>
            <div
              className={`text-2xl font-bold ${
                stats.totalProfit >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              ${stats.totalProfit.toFixed(2)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Win Rate</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stats.completedTrades > 0
                ? `${Math.round((stats.winRate / 100) * stats.completedTrades)} wins`
                : 'No completed'}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Avg Return</div>
            <div
              className={`text-2xl font-bold ${
                stats.averageReturn >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {stats.averageReturn.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Risk Metrics - Collapsible */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setIsRiskMetricsCollapsed(!isRiskMetricsCollapsed)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg
                className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                  isRiskMetricsCollapsed ? '' : 'rotate-90'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Risk Metrics</h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isRiskMetricsCollapsed ? 'Show' : 'Hide'}
            </span>
          </button>

          <div
            className={`transition-all duration-300 ease-in-out ${
              isRiskMetricsCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[500px] opacity-100'
            }`}
          >
            <div className="p-4 pt-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Sharpe Ratio</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.sharpeRatio?.toFixed(2) ?? '—'}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">Risk-adjusted</div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Profit Factor</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.profitFactor?.toFixed(2) ?? '—'}
                </div>
                <div className="text-xs text-green-600 dark:text-green-300 mt-1">Gross P/L ratio</div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
                <div className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-1">Max Drawdown</div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.maxDrawdown?.toFixed(1) ?? '—'}%
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-300 mt-1">Peak to trough</div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Risk/Reward</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.riskRewardRatio?.toFixed(2) ?? '—'}
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-300 mt-1">Per risk unit</div>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Trades */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Recent Trades
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Showing last 2 years</p>
            </div>
            <button
              onClick={() => (window.location.href = '/api/trades?type=export')}
              className="px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition"
              title="Download last 2 years of trades"
            >
              📥 Export CSV
            </button>
          </div>

          {/* Status Filters - Mobile Scrollable */}
          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-slate-200 dark:border-slate-700 scrollbar-hide">
            {filterButtons.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  statusFilter === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {filter.icon} {filter.label}
              </button>
            ))}
          </div>

          {/* Trades List */}
          {isInitialLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-24" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">📊</div>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {statusFilter === 'all' ? 'No trades yet' : `No ${statusFilter} trades`}
              </p>
              <Link
                href="/dashboard/bots"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition text-sm"
              >
                View Bots
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="space-y-3">
                {trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600"
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-lg">
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
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          trade.status === 'closed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        }`}
                      >
                        {trade.status === 'closed' ? '✓ Closed' : '◔ Open'}
                      </span>
                    </div>

                    {/* Price Info */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Entry</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          ${trade.entryPrice.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Exit</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}
                        </p>
                      </div>
                    </div>

                    {/* P&L Row */}
                    <div className="flex items-end justify-between pt-3 border-t border-slate-200 dark:border-slate-600">
                      <div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Quantity</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {trade.quantity.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xl font-bold ${
                            trade.profitLoss !== null && trade.profitLoss >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {trade.profitLoss !== null ? `$${trade.profitLoss.toFixed(2)}` : '—'}
                        </p>
                        <p
                          className={`text-sm font-medium ${
                            trade.profitLossPercent !== null && trade.profitLossPercent >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {trade.profitLossPercent !== null
                            ? `${trade.profitLossPercent >= 0 ? '+' : ''}${trade.profitLossPercent.toFixed(2)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Exit Reason (if available) */}
                    {trade.exitReason && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Exit: <span className="text-slate-700 dark:text-slate-300">{trade.exitReason}</span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Scroll anchor */}
              <div ref={loadMoreRef} />

              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center pt-6">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className={`w-full sm:w-auto px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                      isLoadingMore
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm hover:shadow'
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
                      `Load More`
                    )}
                  </button>
                </div>
              )}

              {/* Error on load more */}
              {error && trades.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mt-4">
                  {error}
                  <button onClick={handleLoadMore} className="ml-2 underline font-medium">
                    Retry
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
