'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLiveBots } from '@/hooks/useLiveBots';
import { useLoadMore } from '@/hooks/useLoadMore';

interface Trade {
  id: string;
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

interface Activity {
  id: string;
  type: 'entry' | 'exit';
  pair: string;
  price: number;
  quantity: number;
  timestamp: string;
  profitLoss?: number;
  profitLossPercent?: number;
}

interface ActivityFeedProps {
  botId?: string | null;
}

export function ActivityFeed({ botId }: ActivityFeedProps) {
  const bots = useLiveBots(120000); // Poll every 120 seconds for efficiency
  const [activeBotId, setActiveBotId] = useState<string | null>(botId || null);
  const [isCollapsed, setIsCollapsed] = useState(true); // Start collapsed to reduce clutter on dashboard

  // Handle bot changes - only change activeBotId, don't reload
  useEffect(() => {
    if (botId) {
      setActiveBotId(botId);
      return;
    }

    const activeBots = bots.filter((b) => b.isActive);
    const newBotId = activeBots.length > 0 ? activeBots[0].id : null;
    setActiveBotId(newBotId);
  }, [bots, botId]);

  // If no active bot, show empty state
  if (!activeBotId) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Recent Activity Feed
        </h3>
        <p className="text-center text-slate-600 dark:text-slate-400 py-6 sm:py-8 text-sm sm:text-base">
          No activity yet. Start the bot to see trades.
        </p>
      </div>
    );
  }

  // Render activity feed content with key to force reset per bot
  return <ActivityFeedContent key={activeBotId} botId={activeBotId} isCollapsed={isCollapsed} onCollapsedChange={setIsCollapsed} />;
}

/**
 * Inner component keyed by botId to ensure independent hook instances per bot
 * This prevents state bleeding when switching between bots
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

  // Memoize fetch function for this specific bot
  const fetchActivitiesData = useCallback(async (offset: number, limit: number) => {
    try {
      // Add cache-busting timestamp to force fresh data
      const cacheParam = Date.now();
      const tradesResponse = await fetch(`/api/trades?botId=${botId}&offset=${offset}&limit=${limit}&_cb=${cacheParam}`);
      if (!tradesResponse.ok) return { items: [], total: 0 };

      const tradesData = await tradesResponse.json();
      const trades: Trade[] = tradesData.trades;

      // Convert trades to activities
      const newActivities: Activity[] = [];

      trades.forEach(trade => {
        newActivities.push({
          id: `${trade.id}-entry`,
          type: 'entry',
          pair: trade.pair,
          price: trade.entryPrice,
          quantity: trade.quantity,
          timestamp: trade.entryTime,
        });

        if (trade.exitPrice && trade.exitTime) {
          newActivities.push({
            id: `${trade.id}-exit`,
            type: 'exit',
            pair: trade.pair,
            price: trade.exitPrice,
            quantity: trade.quantity,
            timestamp: trade.exitTime,
            profitLoss: trade.profitLoss || 0,
            profitLossPercent: trade.profitLossPercent || 0,
          });
        }
      });

      // Sort by timestamp descending
      newActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Calculate hasMore based on whether we got a full page
      // If we got fewer trades than requested, we're at the end
      const gotFullPage = trades.length === limit;
      const hasMoreTrades = gotFullPage && trades.length > 0;

      return {
        items: newActivities,
        // If we got a full page, add estimated size to indicate more might exist
        // If we got partial/no results, total = items (no more to load)
        total: newActivities.length + (hasMoreTrades ? limit : 0),
      };
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      return { items: [], total: 0 };
    }
  }, [botId]);

  // Use Load More hook - fresh instance per bot due to key
  const { items: activities, isLoading, hasMore, load: loadActivities, loadMore, reset: resetActivities } = useLoadMore<Activity>({
    initialPageSize: 10,
    pageSize: 10,
    fetchFn: fetchActivitiesData,
  });

  // Load activities on mount and set up polling
  useEffect(() => {
    loadActivities();

    // Poll for new activities every 10 seconds
    const interval = setInterval(() => {
      loadActivities();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadActivities]);

  // Handle clear feed - clears UI display only (doesn't delete actual trades)
  const handleClearFeed = () => {
    resetActivities();
  };

  if (isLoading && activities.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Recent Activity Feed
        </h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-slate-100 dark:bg-slate-700 rounded h-12 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-4 sm:mb-6">
          📋 Recent Activity Feed
        </h3>
        <p className="text-center text-slate-600 dark:text-slate-400 py-6 sm:py-8 text-sm sm:text-base">
          No activity yet. Start the bot to see trades.
        </p>
      </div>
    );
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          📋 Recent Activity Feed
          {activities.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({activities.length})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2 ml-auto">
          {activities.length > 0 && !hasMore && !isCollapsed && (
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mr-2">
              All loaded
            </span>
          )}
          {activities.length > 0 && (
            <button
              onClick={handleClearFeed}
              className="p-1 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-600 dark:text-slate-400 text-sm"
              title="Clear feed display (trades are preserved)"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => onCollapsedChange(!isCollapsed)}
            className="p-1 px-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-600 dark:text-slate-400 font-medium text-sm"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
        {activities.map(activity => (
          <div
            key={activity.id}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 border-l-4 rounded-r transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 gap-3 sm:gap-4"
            style={{
              borderLeftColor:
                activity.type === 'entry'
                  ? '#3b82f6' // blue
                  : activity.profitLoss !== undefined && activity.profitLoss >= 0
                  ? '#10b981' // green
                  : '#ef4444', // red
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl flex-shrink-0">
                  {activity.type === 'entry' ? '📈' : '📉'}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm sm:text-base truncate">
                    {activity.type === 'entry' ? 'ENTRY' : 'EXIT'} • {activity.pair}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">
                    {activity.quantity.toFixed(4)} @ ${activity.price.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right ml-auto">
              {activity.type === 'exit' && activity.profitLoss !== undefined ? (
                <div>
                  <p
                    className={`font-bold text-sm sm:text-base ${
                      activity.profitLoss >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {activity.profitLoss >= 0 ? '+' : ''} ${activity.profitLoss.toFixed(2)}
                  </p>
                  <p
                    className={`text-xs ${
                      activity.profitLossPercent! >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {activity.profitLossPercent! >= 0 ? '+' : ''} {activity.profitLossPercent!.toFixed(2)}%
                  </p>
                </div>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 sm:mt-2">
                {formatTime(activity.timestamp)}
              </p>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Load More Section */}
      {!isCollapsed && activities.length > 0 && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 mt-0">
          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => loadMore()}
                disabled={isLoading || isCollapsed}
                title={isCollapsed ? 'Expand feed to load more' : undefined}
                className={`px-4 sm:px-6 py-2 rounded font-medium transition text-sm sm:text-base ${
                  isLoading || isCollapsed
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {isLoading ? 'Loading...' : 'Load More Activities'}
              </button>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && activities.length > 0 && (
            <div className="flex justify-center py-4">
              <div className="text-slate-600 dark:text-slate-400 text-sm">Loading more activities...</div>
            </div>
          )}

          {/* All loaded indicator */}
          {!hasMore && activities.length > 0 && (
            <div className="text-center text-sm text-slate-600 dark:text-slate-400 py-4">
              All activities loaded
            </div>
          )}
        </div>
      )}
    </div>
  );
}
