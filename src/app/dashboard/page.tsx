'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';
import { TrialWarningBanner } from '@/components/billing/TrialWarningBanner';

/**
 * Dashboard Home Page
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
}

interface DashboardStats {
  totalProfit: number;
  activeBots: number;
  winRate: number;
  totalTrades: number;
  profitFactor?: number;
  sharpeRatio?: number;
}

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
    initialPageSize: 5,
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

  // Update stats when trades first load
  useEffect(() => {
    if (trades.length > 0 && stats.totalTrades === 0) {
      // Fetch full stats on initial load
      fetch('/api/trades?limit=1000')
        .then(res => res.json())
        .then(data => {
          const tradeStats = data.stats || {};
          setStats(prev => ({
            ...prev,
            winRate: tradeStats.winRate ?? prev.winRate,
            totalTrades: tradeStats.totalTrades ?? prev.totalTrades,
            profitFactor: tradeStats.profitFactor,
            sharpeRatio: tradeStats.sharpeRatio,
            totalProfit: tradeStats.totalProfit ?? prev.totalProfit,
          }));
        })
        .catch(err => console.error('Failed to fetch trade stats:', err));
    }
  }, [trades.length]);

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
      <DashboardLayout title="Dashboard">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-100 dark:bg-slate-700 rounded-lg h-24 animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* Trial Warning Banner */}
      <div className="mb-8">
        <TrialWarningBanner minimal={false} />
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
        {/* Active Bots Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Active Trading Bot</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {stats.activeBots}
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
            {stats.activeBots > 0 ? 'Running' : 'Ready to start'}
          </div>
        </div>

        {/* Total Profit Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Total P&L</div>
          <div
            className={`text-2xl sm:text-3xl font-bold ${
              stats.totalProfit >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            ${Math.abs(stats.totalProfit).toFixed(2)}
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">All time</div>
        </div>

        {/* Win Rate Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Win Rate</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">From {stats.totalTrades} trades</div>
        </div>

        {/* Sharpe Ratio Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2">Sharpe Ratio</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {stats.sharpeRatio?.toFixed(2) ?? '—'}
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">Risk-adjusted</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700 mb-8">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {bots.length === 0 && (
            <Link
              href="/dashboard/bots/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base text-center"
            >
              + Create New Bot
            </Link>
          )}
          <Link
            href="/dashboard/trading"
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base text-center"
          >
            📊 Live Trading
          </Link>
          <Link
            href="/dashboard/portfolio"
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base text-center"
          >
            📈 Portfolio
          </Link>
          <Link
            href="/help"
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base text-center"
          >
            ❓ Help Center
          </Link>
        </div>
      </div>

      {/* Bot Status Card - When Bot Exists */}
      {bots.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700 mb-8">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">Your Trading Bot</h2>
            <Link
              href={`/dashboard/bots/${bots[0].id}`}
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Configure →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status */}
            <div className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-3 h-3 rounded-full ${bots[0].isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Status</p>
                <p className={`text-sm sm:text-base font-semibold ${bots[0].isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {bots[0].isActive ? '🟢 RUNNING' : '⚫ STOPPED'}
                </p>
              </div>
            </div>

            {/* Exchange */}
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-1">Exchange</p>
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                {bots[0].exchange.toUpperCase()}
              </p>
            </div>

            {/* Trading Pairs */}
            <div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-1">Trading Pairs</p>
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                {bots[0].enabledPairs.length} pair{bots[0].enabledPairs.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-4">
            <Link
              href={`/dashboard/bots/${bots[0].id}`}
              className={`inline-block px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base ${
                bots[0].isActive
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/40'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40'
              }`}
            >
              {bots[0].isActive ? '⏹️ Stop Bot' : '▶️ Start Bot'}
            </Link>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">Recent Trades</h2>
          {trades.length > 0 && !hasMore && (
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Showing all {trades.length} trades
            </span>
          )}
        </div>

        {trades.length === 0 ? (
          <div className="text-center py-8 sm:py-12 text-slate-600 dark:text-slate-400">
            {bots.length === 0 ? (
              <>
                <p className="text-sm sm:text-base mb-3">📊 Create a trading bot to get started!</p>
                <Link
                  href="/dashboard/bots/new"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base"
                >
                  Create Your First Bot
                </Link>
              </>
            ) : bots[0].isActive ? (
              <>
                <p className="text-sm sm:text-base mb-3">✨ Your bot is running and monitoring the market...</p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">
                  Trades will appear here once your bot executes them. Check the Live Trading dashboard for real-time updates.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm sm:text-base mb-3">⏹️ Your bot is stopped</p>
                <Link
                  href={`/dashboard/bots/${bots[0].id}`}
                  className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded font-medium transition text-sm sm:text-base"
                >
                  Start Bot
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {trades.map(trade => (
                <div
                  key={trade.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 border-l-4 rounded-r hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  style={{
                    borderLeftColor:
                      trade.exitPrice
                        ? trade.profitLoss && trade.profitLoss >= 0
                          ? '#10b981' // green
                          : '#ef4444' // red
                        : '#3b82f6', // blue
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm sm:text-base truncate">
                      {trade.pair}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      Entry: ${trade.entryPrice.toFixed(2)}
                      {trade.exitPrice && ` → Exit: $${trade.exitPrice.toFixed(2)}`}
                    </p>
                  </div>
                  {trade.status === 'closed' && trade.profitLoss !== null ? (
                    <div className="text-right mt-1 sm:mt-0 ml-auto">
                      <p
                        className={`text-sm sm:text-base font-bold ${
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
                    <div className="text-right mt-1 sm:mt-0 ml-auto">
                      <p className="text-xs sm:text-sm text-yellow-600 dark:text-yellow-400 font-medium">Open</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-2">
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
    </DashboardLayout>
  );
}
