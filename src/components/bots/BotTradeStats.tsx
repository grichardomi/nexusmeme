'use client';

import { useEffect, useState } from 'react';

interface TradeStats {
  totalTrades: number;
  completedTrades: number;
  totalProfit: number;
  winRate: number;
  averageReturn: number;
  winningTrades?: number;
  losingTrades?: number;
  bestTrade?: number;
  worstTrade?: number;
  profitFactor?: number;
}

interface BotTradeStatsProps {
  botId: string;
}

export function BotTradeStats({ botId }: BotTradeStatsProps) {
  const [stats, setStats] = useState<TradeStats>({
    totalTrades: 0,
    completedTrades: 0,
    totalProfit: 0,
    winRate: 0,
    averageReturn: 0,
    winningTrades: 0,
    losingTrades: 0,
    bestTrade: 0,
    worstTrade: 0,
    profitFactor: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch(`/api/trades?botId=${botId}&limit=1000`);
        if (!response.ok) {
          throw new Error('Failed to fetch trade stats');
        }
        const data = await response.json();

        // Calculate additional metrics
        const completedTrades = data.trades.filter(
          (t: any) => t.status === 'closed' || t.exitPrice
        );
        const winningTrades = completedTrades.filter((t: any) => (t.profitLoss || 0) > 0);
        const losingTrades = completedTrades.filter((t: any) => (t.profitLoss || 0) < 0);
        const totalProfit = completedTrades.reduce((sum: number, t: any) => sum + (t.profitLoss || 0), 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum: number, t: any) => sum + (t.profitLoss || 0), 0));
        const bestTrade = completedTrades.length > 0
          ? Math.max(...completedTrades.map((t: any) => t.profitLoss || 0))
          : 0;
        const worstTrade = completedTrades.length > 0
          ? Math.min(...completedTrades.map((t: any) => t.profitLoss || 0))
          : 0;
        const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

        setStats({
          totalTrades: data.stats.totalTrades,
          completedTrades: completedTrades.length,
          totalProfit: data.stats.totalProfit,
          winRate: data.stats.winRate,
          averageReturn: data.stats.averageReturn,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          bestTrade,
          worstTrade,
          profitFactor: isFinite(profitFactor) ? profitFactor : 0,
        });
      } catch (err) {
        // Set default empty stats if error
        setStats({
          totalTrades: 0,
          completedTrades: 0,
          totalProfit: 0,
          winRate: 0,
          averageReturn: 0,
          winningTrades: 0,
          losingTrades: 0,
          bestTrade: 0,
          worstTrade: 0,
          profitFactor: 0,
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, [botId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="bg-slate-200 dark:bg-slate-700 rounded-lg p-4 h-24 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Profit/Loss */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Total P&L
          </div>
          <div
            className={`text-3xl font-bold ${
              stats.totalProfit >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            ${stats.totalProfit.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {stats.completedTrades} trades closed
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Win Rate
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {stats.winningTrades}W / {stats.losingTrades}L
          </div>
        </div>

        {/* Average Return */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Avg Return
          </div>
          <div
            className={`text-3xl font-bold ${
              stats.averageReturn >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {stats.averageReturn.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            per trade
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Profit Factor
          </div>
          <div
            className={`text-3xl font-bold ${
              (stats.profitFactor ?? 0) >= 1.5
                ? 'text-green-600 dark:text-green-400'
                : (stats.profitFactor ?? 0) >= 1
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {(stats.profitFactor ?? 0) > 100 ? '∞' : (stats.profitFactor ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {(stats.profitFactor ?? 0) >= 1.5 ? '✓ Excellent' : (stats.profitFactor ?? 0) >= 1 ? '~ Good' : '✗ Poor'}
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Trades */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Total Trades
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.totalTrades}
          </div>
        </div>

        {/* Winning Trades */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Winning Trades
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.winningTrades}
          </div>
        </div>

        {/* Best Trade */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Best Trade
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            ${(stats.bestTrade ?? 0).toFixed(2)}
          </div>
        </div>

        {/* Worst Trade */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-2">
            Worst Trade
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            ${(stats.worstTrade ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Stats Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-200">
          <strong>📊 Metrics Guide:</strong> Profit Factor shows the ratio of gross profit to gross loss. A ratio above 1.5 is considered excellent. Win Rate is the percentage of profitable trades. All metrics are calculated from closed trades.
        </p>
      </div>
    </div>
  );
}
