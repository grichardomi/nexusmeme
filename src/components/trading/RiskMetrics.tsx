'use client';

import { useEffect, useState } from 'react';
import { useLiveBots } from '@/hooks/useLiveBots';

interface RiskMetrics {
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  riskRewardRatio: number;
  maxConsecutiveLosses: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
  totalTrades: number;
  bestTrade: number;
  worstTrade: number;
}

interface RiskMetricsProps {
  botId?: string;
  modeFilter?: 'live' | 'paper' | 'all';
}

export function RiskMetrics({ botId, modeFilter = 'all' }: RiskMetricsProps) {
  const bots = useLiveBots(30000); // Poll every 30 seconds (reduced from 10s)
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    maxDrawdown: 0,
    currentDrawdown: 0,
    sharpeRatio: 0,
    riskRewardRatio: 0,
    maxConsecutiveLosses: 0,
    winRate: 0,
    profitFactor: 0,
    totalProfit: 0,
    totalTrades: 0,
    bestTrade: 0,
    worstTrade: 0,
  });
  const [isLoading, setIsLoading] = useState(bots.length === 0);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        let id = botId;

        if (!id) {
          const activeBot = bots.find((b) => b.isActive);
          if (!activeBot) {
            setIsLoading(false);
            return;
          }
          id = activeBot.id;
        }

        // Fetch only last 200 trades instead of 1000 for better performance
        const tradesResponse = await fetch(`/api/trades?botId=${id}&limit=200&mode=${modeFilter}`);
        if (!tradesResponse.ok) return;

        const data = await tradesResponse.json();
        const trades = data.trades?.filter((t: any) => t.status === 'closed' || t.exitPrice) || [];

        if (trades.length === 0) {
          setRiskMetrics({
            maxDrawdown: 0,
            currentDrawdown: 0,
            sharpeRatio: 0,
            riskRewardRatio: 0,
            maxConsecutiveLosses: 0,
            winRate: 0,
            profitFactor: 0,
            totalProfit: 0,
            totalTrades: 0,
            bestTrade: 0,
            worstTrade: 0,
          });
          setIsLoading(false);
          return;
        }

        // Use net P&L (after fees) for all calculations — gross overstates performance
        // profitLossNet is provided by /api/trades and deducts entry + exit fees
        const pnl = (t: any): number => {
          const net = t.profitLossNet;
          return net != null ? net : (t.profitLoss || 0);
        };
        const pnlPct = (t: any): number => {
          const net = t.profitLossPercentNet;
          return net != null ? net : (t.profitLossPercent || 0);
        };

        // Calculate real max drawdown from equity curve
        let equity = 0;
        let peak = 0;
        let maxDD = 0;
        let currentDD = 0;

        trades.forEach((t: any) => {
          equity += pnl(t);
          if (equity > peak) peak = equity;
          const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
          maxDD = Math.max(maxDD, dd);
          currentDD = dd;
        });

        // Calculate max consecutive losses (net-based)
        const losses = trades.filter((t: any) => pnl(t) < 0);
        let maxConsecutive = 0;
        let currentConsecutive = 0;
        trades.forEach((t: any) => {
          if (pnl(t) < 0) {
            currentConsecutive++;
            maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
          } else {
            currentConsecutive = 0;
          }
        });

        // Calculate Sharpe ratio with annualization (252 trading days per year)
        const returns = trades.map((t: any) => pnlPct(t));
        const avgReturn = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

        // Calculate win/loss count ratio (net-based)
        const winningTrades = trades.filter((t: any) => pnl(t) > 0);
        const winCount = winningTrades.length;
        const lossCount = losses.length;
        const winLossRatio = lossCount > 0 ? winCount / lossCount : winCount > 0 ? winCount : 0;

        // Calculate win rate
        const totalClosedTrades = trades.length;
        const winRate = totalClosedTrades > 0 ? (winCount / totalClosedTrades) * 100 : 0;

        // Calculate profit factor (net wins / net losses)
        const totalWins = winningTrades.reduce((sum: number, t: any) => sum + pnl(t), 0);
        const totalLosses = Math.abs(losses.reduce((sum: number, t: any) => sum + pnl(t), 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

        // Find best and worst trades (net)
        const bestTrade = trades.length > 0 ? Math.max(...trades.map((t: any) => pnl(t))) : 0;
        const worstTrade = trades.length > 0 ? Math.min(...trades.map((t: any) => pnl(t))) : 0;

        // Total profit (net)
        const totalProfit = trades.reduce((sum: number, t: any) => sum + pnl(t), 0);

        setRiskMetrics({
          maxDrawdown: maxDD,
          currentDrawdown: currentDD,
          sharpeRatio: Math.max(sharpeRatio, 0),
          riskRewardRatio: winLossRatio,
          maxConsecutiveLosses: maxConsecutive,
          winRate: Math.round(winRate * 100) / 100,
          profitFactor: profitFactor > 0 ? Math.round(profitFactor * 100) / 100 : 0,
          totalProfit: Math.round(totalProfit * 100) / 100,
          totalTrades: totalClosedTrades,
          bestTrade: Math.round(bestTrade * 100) / 100,
          worstTrade: Math.round(worstTrade * 100) / 100,
        });
        setIsLoading(false);
      } catch (err) {
        setIsLoading(false);
      }
    }

    if (botId || bots.length > 0) {
      fetchMetrics();

      // Auto-refresh every 30 seconds instead of 10 (less API calls)
      const interval = setInterval(fetchMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [botId, bots, modeFilter]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-4">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="bg-slate-100 dark:bg-slate-700 rounded-lg h-20 sm:h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Win Rate',
      value: `${riskMetrics.winRate.toFixed(1)}%`,
      color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 border-green-200 dark:border-green-700',
      icon: '🎯',
    },
    {
      label: 'Profit Factor',
      value: riskMetrics.profitFactor > 0 ? riskMetrics.profitFactor.toFixed(2) : '—',
      color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
      icon: '💰',
    },
    {
      label: 'Total Profit',
      value: `$${riskMetrics.totalProfit.toFixed(2)}`,
      color: riskMetrics.totalProfit >= 0
        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 border-green-200 dark:border-green-700'
        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-700',
      icon: '📈',
    },
    {
      label: 'Best Trade',
      value: `$${riskMetrics.bestTrade.toFixed(2)}`,
      color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-700',
      icon: '⬆️',
    },
    {
      label: 'Worst Trade',
      value: `$${riskMetrics.worstTrade.toFixed(2)}`,
      color: riskMetrics.worstTrade >= 0
        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 border-green-200 dark:border-green-700'
        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-700',
      icon: '⬇️',
    },
    {
      label: 'Max Drawdown',
      value: `${riskMetrics.maxDrawdown.toFixed(1)}%`,
      color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-700',
      icon: '📉',
    },
    {
      label: 'Current Drawdown',
      value: `${riskMetrics.currentDrawdown.toFixed(1)}%`,
      color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
      icon: '⚠️',
    },
    {
      label: 'Sharpe Ratio',
      value: riskMetrics.sharpeRatio.toFixed(2),
      color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700',
      icon: '📊',
    },
    {
      label: 'Win/Loss Count',
      value: riskMetrics.totalTrades > 0 ? `${Math.round(riskMetrics.totalTrades * (riskMetrics.winRate / 100))}/${Math.round(riskMetrics.totalTrades * (1 - riskMetrics.winRate / 100))}` : '0/0',
      color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-700',
      icon: '⚖️',
    },
    {
      label: 'Loss Streak',
      value: riskMetrics.maxConsecutiveLosses,
      color: riskMetrics.maxConsecutiveLosses >= 5
        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-700'
        : riskMetrics.maxConsecutiveLosses >= 3
        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-700'
        : 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-300 border-pink-200 dark:border-pink-700',
      icon: riskMetrics.maxConsecutiveLosses >= 5 ? '🚨' : riskMetrics.maxConsecutiveLosses >= 3 ? '⚠️' : '🔗',
      warning: riskMetrics.maxConsecutiveLosses >= 3
        ? `${riskMetrics.maxConsecutiveLosses} consecutive losses — position sizing reduced`
        : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {metricCards.map((card, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 sm:p-4 border ${card.color}`}
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <p className="text-xs sm:text-sm font-medium">{card.label}</p>
              <span className="text-lg sm:text-xl">{card.icon}</span>
            </div>
            <p className="text-base sm:text-xl font-bold">{card.value}</p>
            {(card as any).warning && (
              <p className="text-xs mt-1 opacity-80">{(card as any).warning}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 text-right">All metrics calculated on net P&L (after fees)</p>
    </div>
  );
}
