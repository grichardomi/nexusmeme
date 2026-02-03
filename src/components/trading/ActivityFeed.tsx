'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

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
 *
 * Smooth updates: Background polling merges new data without flicker
 */
export function ActivityFeed({ botId }: ActivityFeedProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!botId) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          Activity Feed
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
 * Inner component keyed by botId to ensure independent state per bot
 *
 * Smooth update strategy:
 * - Initial load shows skeleton
 * - Background polls silently merge data (no loading flash)
 * - Items are compared by ID to avoid unnecessary re-renders
 * - CSS transitions for smooth item appearance
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageSize] = useState(10);
  const offsetRef = useRef(0);
  const previousDataRef = useRef<string>('');

  // Fetch and merge trades without flickering
  const fetchTrades = useCallback(async (offset: number, limit: number) => {
    try {
      const cacheParam = Date.now();
      const response = await fetch(`/api/trades?botId=${botId}&offset=${offset}&limit=${limit}&_cb=${cacheParam}`);
      if (!response.ok) return null;

      const data = await response.json();
      const allTrades: Trade[] = data.trades || [];

      // Safety filter: ensure only current bot's trades
      const filtered = allTrades.filter(trade => trade.botId === botId);

      // Sort by most recent activity (exit time if closed, entry time if open)
      filtered.sort((a, b) => {
        const timeA = a.exitTime ? new Date(a.exitTime).getTime() : new Date(a.entryTime).getTime();
        const timeB = b.exitTime ? new Date(b.exitTime).getTime() : new Date(b.entryTime).getTime();
        return timeB - timeA;
      });

      return {
        items: filtered,
        hasMore: filtered.length === limit,
      };
    } catch (err) {
      console.error('Failed to fetch trades:', err);
      return null;
    }
  }, [botId]);

  // Initial load + background polling
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      const result = await fetchTrades(0, pageSize);
      if (!mounted || !result) return;

      // Compare serialized data to avoid unnecessary state updates
      const serialized = JSON.stringify(result.items);
      if (serialized === previousDataRef.current) return; // No change - skip update
      previousDataRef.current = serialized;

      // Merge: keep any additional loaded pages, replace first page
      setTrades(prev => {
        if (prev.length <= pageSize) {
          // Only first page loaded - replace entirely
          return result.items;
        }
        // Multiple pages loaded - replace first page, keep rest
        const extraItems = prev.slice(pageSize);
        return [...result.items, ...extraItems];
      });

      setHasMore(result.hasMore);
      offsetRef.current = pageSize;

      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    };

    // Initial fetch
    poll();

    // Background poll every 10 seconds (silent - no loading state)
    const interval = setInterval(poll, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchTrades, pageSize, isInitialLoad]);

  // Load more (user-triggered - shows loading)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const result = await fetchTrades(offsetRef.current, pageSize);
    setIsLoadingMore(false);

    if (!result) return;

    setTrades(prev => {
      // Deduplicate by ID
      const existingIds = new Set(prev.map(t => t.id));
      const newItems = result.items.filter(t => !existingIds.has(t.id));
      return [...prev, ...newItems];
    });

    offsetRef.current += pageSize;
    setHasMore(result.hasMore);
  }, [fetchTrades, pageSize, hasMore, isLoadingMore]);

  const handleClearFeed = useCallback(() => {
    setTrades([]);
    setHasMore(true);
    setIsInitialLoad(true);
    offsetRef.current = 0;
    previousDataRef.current = '';
  }, []);

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

  // Loading state - only on initial load
  if (isInitialLoad) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          Activity Feed
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
          Activity Feed
        </h3>
        <p className="text-center text-slate-600 dark:text-slate-400 py-6 sm:py-8 text-sm sm:text-base">
          No trades yet. Start the bot to see activity.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          Activity Feed
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

      {/* Trade List - Smooth collapse/expand */}
      <div
        className="transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isCollapsed ? '0px' : '2000px',
          opacity: isCollapsed ? 0 : 1,
          overflow: 'hidden',
        }}
      >
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
          {trades.map((trade, index) => {
            const isOpen = trade.status === 'open';
            const isProfitable = (trade.profitLoss ?? 0) >= 0;

            return (
              <div
                key={trade.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 border-l-4 rounded-r hover:bg-slate-50 dark:hover:bg-slate-700/50 gap-2 sm:gap-4 transition-all duration-200 ease-in-out"
                style={{
                  borderLeftColor: isOpen ? '#3b82f6' : isProfitable ? '#10b981' : '#ef4444',
                  animation: `fadeSlideIn 0.3s ease-out ${Math.min(index * 0.03, 0.3)}s both`,
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
                      <span className="mx-1">·</span>
                      <span>{trade.quantity.toFixed(4)}</span>
                    </p>
                  </div>
                </div>

                {/* Right: P&L and time */}
                <div className="text-right flex-shrink-0">
                  {!isOpen && trade.profitLoss !== null && (
                    <div>
                      <p className={`font-bold text-sm sm:text-base transition-colors duration-300 ${
                        isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {isProfitable ? '+' : ''}{trade.profitLoss >= 0 ? '$' : '-$'}{Math.abs(trade.profitLoss).toFixed(2)}
                      </p>
                      {trade.profitLossPercent !== null && (
                        <p className={`text-xs transition-colors duration-300 ${
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

        {/* Load More */}
        {trades.length > 0 && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            {hasMore && (
              <div className="flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className={`px-4 sm:px-6 py-2 rounded font-medium transition-all duration-200 text-sm ${
                    isLoadingMore
                      ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {isLoadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSS Animation Keyframes */}
      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
