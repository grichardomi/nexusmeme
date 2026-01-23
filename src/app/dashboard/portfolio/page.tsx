'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';

/**
 * Portfolio Page
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

interface Bot {
  id: string;
  isActive: boolean;
}

export default function PortfolioPage() {
  const { status } = useSession();
  const [bots, setBots] = useState<Bot[]>([]);
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
  const [error, setError] = useState<string | null>(null);

  // Memoize fetch function to prevent infinite re-renders
  const fetchTradesData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/trades?offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch trades');

    const data = await response.json();
    return {
      items: data.trades || [],
      total: data.total || 0,
    };
  }, []);

  // Use Load More hook for trades
  const { items: trades, isLoading: tradesLoading, hasMore, load: loadTrades, loadMore } = useLoadMore<Trade>({
    initialPageSize: 20,
    pageSize: 30,
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
        } catch (botErr) {
          console.error('Failed to fetch bots:', botErr);
          setBots([]);
        }

        // Load initial trades and stats
        loadTrades();

        // Fetch full stats from larger batch for accurate metrics
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
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoadingInitial(false);
      }
    }

    fetchData();
  }, [loadTrades]);

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

  if (isLoadingInitial) {
    return (
      <DashboardLayout title="Portfolio">
        <div className="text-center py-12">
          <p className="text-slate-600 dark:text-slate-400">Loading portfolio data...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Portfolio">
      <div className="space-y-8">
        {/* Portfolio Overview - Primary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Total Trades</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {stats.totalTrades}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {stats.completedTrades} completed
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">All Time P&L</div>
            <div
              className={`text-2xl sm:text-3xl font-bold ${
                stats.totalProfit >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              ${stats.totalProfit.toFixed(2)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Win Rate</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {stats.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {stats.completedTrades > 0
                ? `${Math.round((stats.winRate / 100) * stats.completedTrades)} wins`
                : 'No completed'}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Avg Return</div>
            <div
              className={`text-2xl sm:text-3xl font-bold ${
                stats.averageReturn >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {stats.averageReturn.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Portfolio Overview - Risk Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 sm:p-6 border border-blue-200 dark:border-blue-700">
            <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Sharpe Ratio</div>
            <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.sharpeRatio?.toFixed(2) ?? '—'}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-300 mt-2">Risk-adjusted returns</div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 sm:p-6 border border-green-200 dark:border-green-700">
            <div className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300 mb-2">Profit Factor</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.profitFactor?.toFixed(2) ?? '—'}
            </div>
            <div className="text-xs text-green-600 dark:text-green-300 mt-2">Gross profit / gross loss</div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 sm:p-6 border border-orange-200 dark:border-orange-700">
            <div className="text-xs sm:text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">Max Drawdown</div>
            <div className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">
              {stats.maxDrawdown?.toFixed(1) ?? '—'}%
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-300 mt-2">Peak-to-trough decline</div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 sm:p-6 border border-purple-200 dark:border-purple-700">
            <div className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">Risk/Reward</div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
              {stats.riskRewardRatio?.toFixed(2) ?? '—'}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-300 mt-2">Expected return per risk unit</div>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded">
            <p className="text-sm">
              ℹ️ Trade history not yet available. Start your bot to begin recording trades.
            </p>
          </div>
        )}

        {/* Recent Trades */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-8 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
              Recent Trades
            </h2>
            {trades.length > 0 && !hasMore && (
              <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                All {trades.length} trades loaded
              </span>
            )}
          </div>

          {trades.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-slate-600 dark:text-slate-400">
              {bots.length === 0 ? (
                <>
                  <p className="mb-4 text-sm sm:text-base">No bot created yet. Create one to start trading.</p>
                  <Link
                    href="/dashboard/bots/new"
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition text-sm sm:text-base"
                  >
                    Create Bot
                  </Link>
                </>
              ) : (
                <p className="text-sm sm:text-base">No trades yet. Start your bot to begin recording trades.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Pair
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Entry
                      </th>
                      <th className="hidden sm:table-cell text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Exit
                      </th>
                      <th className="hidden lg:table-cell text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Qty
                      </th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        P&L
                      </th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        %
                      </th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {trades.map(trade => (
                      <tr
                        key={trade.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-slate-900 dark:text-white font-medium">
                          {trade.pair}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-slate-700 dark:text-slate-300">
                          ${trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="hidden sm:table-cell py-2 sm:py-3 px-2 sm:px-4 text-slate-700 dark:text-slate-300">
                          {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="hidden lg:table-cell py-2 sm:py-3 px-2 sm:px-4 text-slate-700 dark:text-slate-300">
                          {trade.quantity.toFixed(4)}
                        </td>
                        <td
                          className={`py-2 sm:py-3 px-2 sm:px-4 text-right font-medium ${
                            trade.profitLoss !== null && trade.profitLoss >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {trade.profitLoss !== null ? `$${trade.profitLoss.toFixed(2)}` : '—'}
                        </td>
                        <td
                          className={`py-2 sm:py-3 px-2 sm:px-4 text-right font-medium ${
                            trade.profitLossPercent !== null && trade.profitLossPercent >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {trade.profitLossPercent !== null
                            ? `${trade.profitLossPercent >= 0 ? '+' : ''}${trade.profitLossPercent.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded inline-block ${
                              trade.status === 'closed'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                            }`}
                          >
                            {trade.status === 'closed' ? '✓ Closed' : '◔ Open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => loadMore()}
                    disabled={tradesLoading}
                    className={`px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base ${
                      tradesLoading
                        ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {tradesLoading ? 'Loading...' : 'Load More Trades'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
