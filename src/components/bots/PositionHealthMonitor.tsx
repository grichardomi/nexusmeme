'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePriceContext } from '@/contexts/PriceContext';
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

interface PositionHealth {
  tradeId: string;
  peakProfitPct: string;
  currentProfitPct: string;
  erosionPct: string;
  erosionRatioPct: string;
  erosionCap: string;
  healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT';
  alertMessage: string;
  regime: string;
}

interface PositionHealthMonitorProps {
  botId: string;
}

export function PositionHealthMonitor({ botId }: PositionHealthMonitorProps) {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [healthData, setHealthData] = useState<Map<string, PositionHealth>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);

  // Get market prices from context (shared across all components)
  const { prices } = usePriceContext();

  // Fetch all trades once for filtering
  useEffect(() => {
    async function fetchAllTrades() {
      try {
        // Fetch larger batch for comprehensive position view
        const response = await fetch(`/api/trades?botId=${botId}&limit=500`);
        if (!response.ok) {
          throw new Error('Failed to fetch trades');
        }
        const data = await response.json();
        setAllTrades(data.trades || []);
      } catch (err) {
        console.error('Error fetching trades:', err);
      }
    }

    async function fetchHealthData() {
      try {
        const url = botId ? `/api/positions/health?botId=${botId}` : `/api/positions/health`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch position health');
        }
        const data = await response.json();
        const healthMap = new Map<string, PositionHealth>();
        (data.positions || []).forEach((pos: PositionHealth) => {
          healthMap.set(pos.tradeId, pos);
        });
        setHealthData(healthMap);
      } catch (err) {
        console.error('Error fetching position health:', err);
      } finally {
        setInitialLoading(false);
      }
    }

    fetchAllTrades();
    fetchHealthData();

    // Auto-refresh every 30 seconds for position updates
    const interval = setInterval(() => {
      fetchAllTrades();
      fetchHealthData();
    }, 30000);
    return () => clearInterval(interval);
  }, [botId]);

  // Separate trades into open and closed
  const openPositions = allTrades.filter(t => t.status !== 'closed' && !t.exitPrice);
  const closedPositions = allTrades.filter(t => t.status === 'closed' || t.exitPrice);

  // Fetch function for closed positions pagination
  const fetchClosedPositions = useCallback(
    async (offset: number, limit: number) => {
      // Use local data already fetched, just paginate
      const paginated = closedPositions.slice(offset, offset + limit);
      return {
        items: paginated,
        total: closedPositions.length,
      };
    },
    [closedPositions]
  );

  // Load More hook for closed positions
  const {
    items: displayedClosedPositions,
    hasMore: hasMoreClosed,
    loadMore: loadMoreClosed,
    isLoading: isLoadingClosed,
  } = useLoadMore<Trade>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchClosedPositions,
  });

  // Load More hook for open positions (if > 15 items)
  const fetchOpenPositions = useCallback(
    async (offset: number, limit: number) => {
      const paginated = openPositions.slice(offset, offset + limit);
      return {
        items: paginated,
        total: openPositions.length,
      };
    },
    [openPositions]
  );

  const {
    items: displayedOpenPositions,
    hasMore: hasMoreOpen,
    loadMore: loadMoreOpen,
    isLoading: isLoadingOpen,
  } = useLoadMore<Trade>({
    initialPageSize: 15,
    pageSize: 15,
    fetchFn: fetchOpenPositions,
  });

  const calculateMetrics = (position: Trade) => {
    if (!position.exitPrice) {
      // For open positions, calculate unrealized P&L using current market price
      const currentPrice = prices.get(position.pair)?.price;
      let unrealizedPnL: number | null = null;
      let unrealizedPnLPercent: number | null = null;

      if (currentPrice) {
        unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
        unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      }

      return {
        currentPnL: unrealizedPnL,
        currentPnLPercent: unrealizedPnLPercent,
        peakPnL: position.profitLoss,
        erosion: null,
        holdTime: Date.now() - new Date(position.entryTime).getTime(),
      };
    }

    return {
      currentPnL: position.profitLoss,
      currentPnLPercent: position.profitLossPercent,
      peakPnL: position.profitLoss,
      erosion: null,
      holdTime: new Date(position.exitTime || Date.now()).getTime() - new Date(position.entryTime).getTime(),
    };
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getHealthStatusColor = (status: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT') => {
    switch (status) {
      case 'HEALTHY':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'CAUTION':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'RISK':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'ALERT':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  };

  const getErosionColor = (erosionRatioPct: number) => {
    if (erosionRatioPct > 100) {
      return 'text-red-600 dark:text-red-400 font-semibold';
    } else if (erosionRatioPct > 70) {
      return 'text-orange-600 dark:text-orange-400 font-semibold';
    } else if (erosionRatioPct > 30) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
      return 'text-green-600 dark:text-green-400';
    }
  };

  if (initialLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
          📊 Positions
        </h3>
        <p className="text-slate-600 dark:text-slate-400">Loading positions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Open Positions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          🟢 Open Positions ({openPositions.length})
        </h3>

        {openPositions.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400 text-sm">No open positions</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Pair
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Entry Price
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Qty
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Unrealized P&L
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Peak Profit %
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Erosion %
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Cap
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Current Price
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Hold Time
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Health
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {displayedOpenPositions.map(position => {
                    const metrics = calculateMetrics(position);
                    const currentPrice = prices.get(position.pair)?.price;
                    const health = healthData.get(position.id);
                    const erosionRatioPct = health ? parseFloat(health.erosionRatioPct) : 0;
                    return (
                      <tr key={position.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {position.pair}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          ${position.entryPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {position.quantity.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {metrics.currentPnL !== null ? (
                            <div>
                              <span className={metrics.currentPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {metrics.currentPnL >= 0 ? '+' : ''} ${metrics.currentPnL.toFixed(2)}
                              </span>
                              {metrics.currentPnLPercent !== null && (
                                <div className={`text-xs ${metrics.currentPnLPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {metrics.currentPnLPercent >= 0 ? '+' : ''} {metrics.currentPnLPercent.toFixed(2)}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-slate-700 dark:text-slate-300">
                          {health ? (
                            <span className={parseFloat(health.peakProfitPct) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}>
                              {parseFloat(health.peakProfitPct) >= 0 ? '+' : ''}{health.peakProfitPct}%
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-right text-sm ${health ? getErosionColor(erosionRatioPct) : 'text-slate-500 dark:text-slate-400'}`}>
                          {health ? (
                            <div>
                              <div>{health.erosionRatioPct}%</div>
                              <div className="text-xs text-slate-600 dark:text-slate-400">{health.erosionPct}</div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-slate-700 dark:text-slate-300">
                          {health ? `${health.erosionCap}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-xs text-slate-500 dark:text-slate-400">
                          {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {formatDuration(metrics.holdTime)}
                        </td>
                        <td className="py-3 px-4">
                          {health ? (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getHealthStatusColor(health.healthStatus)}`}>
                                {health.healthStatus}
                              </span>
                              {health.alertMessage && (
                                <div className="text-xs text-slate-600 dark:text-slate-400 max-w-[150px]">
                                  {health.alertMessage}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-block bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-semibold">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More for Open Positions */}
            {hasMoreOpen && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => loadMoreOpen()}
                  disabled={isLoadingOpen}
                  className={`px-4 py-2 rounded font-medium transition text-sm ${
                    isLoadingOpen
                      ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {isLoadingOpen ? 'Loading...' : 'Load More Open Positions'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Closed Positions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          ⚪ Closed Positions ({closedPositions.length})
        </h3>

        {closedPositions.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400 text-sm">No closed positions</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Pair
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Entry
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Exit
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      P&L
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      %
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Duration
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {displayedClosedPositions.map(position => {
                    const metrics = calculateMetrics(position);
                    return (
                      <tr key={position.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {position.pair}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          ${position.entryPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          ${position.exitPrice?.toFixed(2) || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {position.profitLoss !== null ? (
                            <span className={position.profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              ${position.profitLoss.toFixed(2)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {position.profitLossPercent !== null ? (
                            <span className={position.profitLossPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {position.profitLossPercent >= 0 ? '+' : ''}{position.profitLossPercent.toFixed(2)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {metrics.holdTime ? formatDuration(metrics.holdTime) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-semibold">
                            ✓ Closed
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More for Closed Positions */}
            {(hasMoreClosed || displayedClosedPositions.length > 0) && (
              <div className="mt-4">
                {hasMoreClosed && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => loadMoreClosed()}
                      disabled={isLoadingClosed}
                      className={`px-4 py-2 rounded font-medium transition text-sm ${
                        isLoadingClosed
                          ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {isLoadingClosed ? 'Loading...' : 'Load More Closed Positions'}
                    </button>
                  </div>
                )}

                {!hasMoreClosed && displayedClosedPositions.length > 0 && (
                  <div className="text-center text-sm text-slate-600 dark:text-slate-400 py-2">
                    All positions loaded ({closedPositions.length} total)
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
