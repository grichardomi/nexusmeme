'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLoadMore } from '@/hooks/useLoadMore';

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

interface ActivityFeedProps {
  botId: string; // Required - must be provided by parent
}

/**
 * Activity Feed - Shows trades for a SPECIFIC bot only
 *
 * Displays one row per trade (not separate entry/exit events)
 * Count in header matches number of rows displayed
 */
export function ActivityFeed({ botId }: ActivityFeedProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!botId) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Activity Feed
        </h3>
        <p className="text-center text-slate-600 dark:text-slate-400 py-6 sm:py-8 text-sm sm:text-base">
          No bot selected. Select a bot to see activity.
        </p>
      </div>
    );
  }

  return <ActivityFeedContent key={botId} botId={botId} isCollapsed={isCollapsed} onCollapsedChange={setIsCollapsed} />;
}

/**
 * Inner component keyed by botId to ensure independent hook instances per bot
 */
function ActivityFeedContent({
  botId,
  isCollapsed,
  onCollapsedChange,
}: {
  botId: string;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  // Fetch trades for this specific bot
  const fetchTradesData = useCallback(async (offset: number, limit: number) => {
    try {
      const cacheParam = Date.now();
      const response = await fetch(`/api/trades?botId=${botId}&offset=${offset}&limit=${limit}&_cb=${cacheParam}`);
      if (!response.ok) return { items: [], total: 0 };

      const data = await response.json();
      const allTrades: Trade[] = data.trades || [];

      // Safety filter: ensure only current bot's trades
      const trades = allTrades.filter(trade => trade.botId === botId);

      if (trades.length !== allTrades.length) {
        console.warn(`ActivityFeed: Filtered out ${allTrades.length - trades.length} trades from other bots`);
      }

      // Sort by most recent activity (exit time if closed, entry time if open)
      trades.sort((a, b) => {
        const timeA = a.exitTime ? new Date(a.exitTime).getTime() : new Date(a.entryTime).getTime();
        const timeB = b.exitTime ? new Date(b.exitTime).getTime() : new Date(b.entryTime).getTime();
        return timeB - timeA;
      });

      const gotFullPage = trades.length === limit;
      const hasMore = gotFullPage && trades.length > 0;

      return {
        items: trades,
        total: trades.length + (hasMore ? limit : 0),
      };
    } catch (err) {
      console.error('Failed to fetch trades:', err);
      return { items: [], total: 0 };
    }
  }, [botId]);

  const { items: trades, isLoading, hasMore, load: loadTrades, loadMore, reset: resetTrades } = useLoadMore<Trade>({
    initialPageSize: 10,
    pageSize: 10,
    fetchFn: fetchTradesData,
  });

  // Load on mount and poll every 10 seconds
  useEffect(() => {
    loadTrades();
    const interval = setInterval(() => loadTrades(), 10000);
    return () => clearInterval(interval);
  }, [loadTrades]);

  const handleClearFeed = () => resetTrades();

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const formatPrice = (price: number) => {
    return price >= 1000 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                         : `$${price.toFixed(2)}`;
  };

  // Loading state
  if (isLoading && trades.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Activity Feed
        </h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-100 dark:bg-slate-700 rounded h-14 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (trades.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Activity Feed
        </h3>
        <p className="text-center text-slate-600 dark:text-slate-400 py-6 sm:py-8 text-sm sm:text-base">
          No trades yet. Start the bot to see activity.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          📋 Activity Feed
          <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
            ({trades.length})
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {!hasMore && !isCollapsed && (
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">All loaded</span>
          )}
          <button
            onClick={handleClearFeed}
            className="p-1 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-600 dark:text-slate-400 text-sm"
            title="Clear feed display"
          >
            Clear
          </button>
          <button
            onClick={() => onCollapsedChange(!isCollapsed)}
            className="p-1 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-600 dark:text-slate-400 font-medium text-sm"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Trade List */}
      {!isCollapsed && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
          {trades.map(trade => {
            const isOpen = trade.status === 'open';
            const isProfitable = (trade.profitLoss ?? 0) >= 0;

            return (
              <div
                key={trade.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 border-l-4 rounded-r transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 gap-2 sm:gap-4"
                style={{
                  borderLeftColor: isOpen ? '#3b82f6' : isProfitable ? '#10b981' : '#ef4444',
                }}
              >
                {/* Left: Trade info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xl sm:text-2xl flex-shrink-0">
                    {isOpen ? '📊' : isProfitable ? '✅' : '❌'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm sm:text-base">
                      {trade.pair}
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        isOpen
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {isOpen ? 'OPEN' : 'CLOSED'}
                      </span>
                    </p>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      {formatPrice(trade.entryPrice)}
                      {trade.exitPrice && (
                        <span> → {formatPrice(trade.exitPrice)}</span>
                      )}
                      <span className="mx-1">•</span>
                      <span>{trade.quantity.toFixed(4)}</span>
                    </p>
                  </div>
                </div>

                {/* Right: P&L and time */}
                <div className="text-right flex-shrink-0">
                  {!isOpen && trade.profitLoss !== null && (
                    <div>
                      <p className={`font-bold text-sm sm:text-base ${
                        isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {isProfitable ? '+' : ''}{trade.profitLoss >= 0 ? '$' : '-$'}{Math.abs(trade.profitLoss).toFixed(2)}
                      </p>
                      {trade.profitLossPercent !== null && (
                        <p className={`text-xs ${
                          isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {isProfitable ? '+' : ''}{trade.profitLossPercent.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {formatTime(trade.exitTime || trade.entryTime)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {!isCollapsed && trades.length > 0 && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => loadMore()}
                disabled={isLoading}
                className={`px-4 sm:px-6 py-2 rounded font-medium transition text-sm ${
                  isLoading
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
          {isLoading && trades.length > 0 && (
            <div className="text-center text-slate-600 dark:text-slate-400 text-sm py-4">
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
