'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLiveBots, type Bot } from '@/hooks/useLiveBots';
import { usePriceContext } from '@/contexts/PriceContext';

interface LivePnLTickerProps {
  bot?: Bot | null;
}

export function LivePnLTicker({ bot: providedBot }: LivePnLTickerProps) {
  const bots = useLiveBots(30000); // 30-second polling (reduced from 5s to prevent page jumping)
  const { prices } = usePriceContext();
  const [bot, setBot] = useState<Bot | null>(null);
  const [unrealizedPnL, setUnrealizedPnL] = useState(0);
  const [closedPnL, setClosedPnL] = useState(0);
  const [isLoading, setIsLoading] = useState(bots.length === 0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch and calculate unrealized P&L for open positions
  const calculateUnrealizedPnL = useCallback(async (botId: string) => {
    try {
      const response = await fetch(`/api/trades?botId=${botId}&limit=200`);
      if (!response.ok) return;
      const data = await response.json();
      const trades = data.trades || [];

      // Calculate unrealized P&L from open positions
      let unrealized = 0;
      let closed = 0;

      trades.forEach((trade: any) => {
        if (!trade.exitPrice && trade.status !== 'closed') {
          const currentPrice = prices.get(trade.pair)?.price;
          if (currentPrice) {
            unrealized += (currentPrice - trade.entryPrice) * trade.quantity;
          }
        } else if (trade.profitLoss !== null && trade.profitLoss !== undefined) {
          closed += Number(trade.profitLoss) || 0;
        }
      });

      setUnrealizedPnL(unrealized);
      setClosedPnL(closed);
    } catch (err) {
      console.error('Error calculating unrealized P&L:', err);
    }
  }, [prices]);

  useEffect(() => {
    if (providedBot) {
      setBot(providedBot);
      calculateUnrealizedPnL(providedBot.id);
      setLastUpdate(new Date());
      setIsLoading(false);
      return;
    }

    const activeBot = bots.find((b) => b.isActive);
    if (activeBot) {
      setBot(activeBot);
      calculateUnrealizedPnL(activeBot.id);
      setLastUpdate(new Date());
      setIsLoading(false);
    } else if (bots.length > 0) {
      setIsLoading(false);
    }
  }, [bots, calculateUnrealizedPnL, providedBot]);

  if (isLoading || !bot) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {[...Array(1)].map((_, i) => (
          <div
            key={i}
            className="bg-slate-100 dark:bg-slate-700 rounded-lg p-6 sm:p-8 border border-slate-200 dark:border-slate-600 animate-pulse h-32"
          />
        ))}
      </div>
    );
  }

  const combinedPnL = closedPnL + unrealizedPnL;
  const isPositive = combinedPnL >= 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Main P&L Ticker */}
      <div className={`rounded-lg p-6 sm:p-8 border-2 transition-all ${
        isPositive
          ? 'bg-gradient-to-br from-green-50 dark:from-green-900/30 to-green-100 dark:to-green-900/20 border-green-300 dark:border-green-500'
          : 'bg-gradient-to-br from-red-50 dark:from-red-900/30 to-red-100 dark:to-red-900/20 border-red-300 dark:border-red-500'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className={`text-xs sm:text-sm font-medium mb-2 ${
              isPositive
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            }`}>
              TOTAL P&L (Real-time)
            </p>
            <div className={`text-3xl sm:text-4xl md:text-5xl font-bold ${
              isPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {isPositive ? '+' : ''} ${Math.abs(combinedPnL).toFixed(2)}
            </div>
            <p className={`text-xs sm:text-sm mt-2 ${
              isPositive
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            }`}>
              {bot.exchange.toUpperCase()} • {bot.enabledPairs.length} pairs
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl sm:text-4xl font-bold ${
              isPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {isPositive ? '🟢' : '🔴'}
            </div>
            {lastUpdate && (
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-2">
                Updated {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1 sm:mb-2">Status</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {bot.isActive ? '🟢 LIVE' : '⚫ STOPPED'}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1 sm:mb-2">Closed P&L</p>
          <p className={`text-base sm:text-lg font-bold ${closedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {closedPnL >= 0 ? '+' : ''} ${closedPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1 sm:mb-2">Unrealized P&L</p>
          <p className={`text-base sm:text-lg font-bold ${unrealizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {unrealizedPnL >= 0 ? '+' : ''} ${unrealizedPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1 sm:mb-2">Exchange / Pairs</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {bot.exchange.toUpperCase()} / {bot.enabledPairs.length}
          </p>
        </div>
      </div>
    </div>
  );
}
