'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { NotificationModal, NotificationType } from '@/components/modals/NotificationModal';

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
  exitReason?: string | null;
  botId?: string;
}

interface PositionHealth {
  tradeId: string;
  peakProfitPct: number;
  currentProfitPct: number;
  erosionPct: number;
  erosionRatioPct: number;
  erosionCap: number;
  status?: 'healthy' | 'warning' | 'critical' | 'underwater';
  healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT';
  alertMessage?: string;
  regime: string;
}

interface OpenClosedTradesProps {
  botId: string;
}

interface CurrentPrices {
  [pair: string]: number;
}

export function OpenClosedTrades({ botId }: OpenClosedTradesProps) {
  const { data: session } = useSession();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrices, setCurrentPrices] = useState<CurrentPrices>({});
  const [healthData, setHealthData] = useState<Map<string, PositionHealth>>(new Map());
  const [closingTrade, setClosingTrade] = useState<string | null>(null);
  const [closedVisibleCount, setClosedVisibleCount] = useState(20);
  const [isDeletingClosedTrades, setIsDeletingClosedTrades] = useState(false);
  const [isClosedPositionsCollapsed, setIsClosedPositionsCollapsed] = useState(true); // Start collapsed

  // Modal states
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ closedCount: number } | null>(null);

  const isAdmin = session?.user && (session.user as any).role === 'admin';

  useEffect(() => {
    let isInitialLoad = true;

    async function fetchTrades() {
      try {
        const response = await fetch(`/api/trades?botId=${botId}&limit=500`);
        if (!response.ok) {
          throw new Error('Failed to fetch trades');
        }
        const data = await response.json();
        const newTrades = data.trades || [];

        // Only update state if data actually changed (prevents unnecessary re-renders)
        setTrades(prev => {
          if (JSON.stringify(prev) === JSON.stringify(newTrades)) {
            return prev; // No change, keep same reference
          }
          return newTrades;
        });
      } catch (err) {
        // Only show error on initial load, not on refresh failures
        if (isInitialLoad) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        // Only set loading false on initial load
        if (isInitialLoad) {
          setIsLoading(false);
          isInitialLoad = false;
        }
      }
    }

    fetchTrades();
    const interval = setInterval(fetchTrades, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [botId]);

  // Reset closed pagination when trades change
  useEffect(() => {
    setClosedVisibleCount(20);
  }, [trades]);

  // Fetch server-side position health (includes peak/erosion from DB)
  useEffect(() => {
    async function fetchPositionHealth() {
      try {
        const response = await fetch('/api/bots/dashboard/position-health');
        if (!response.ok) return;

        const data = await response.json();
        const positions = Array.isArray(data.positions) ? data.positions : [];

        // Build new health map
        const newHealthMap = new Map<string, PositionHealth>();
        positions.forEach((pos: any) => {
          const peakProfitPct = Number(pos.peakProfitPct) || 0;
          const currentProfitPct = Number(pos.currentProfitPct) || 0;
          const erosionCapFraction = Number(pos.erosionCapFraction) || 0;
          const erosionRatioPct = Number(pos.erosionRatioPct) || 0;
          const erosionAbsolutePct = Number(pos.erosionAbsolutePct) || (peakProfitPct > 0 ? peakProfitPct - currentProfitPct : 0);
          const status = (pos.status as PositionHealth['status']) || 'healthy';

          // Derive UI status (match Nexus bar coloring)
          let healthStatus: PositionHealth['healthStatus'] = 'HEALTHY';
          if (status === 'critical') {
            healthStatus = 'ALERT';
          } else if (status === 'warning' || status === 'underwater') {
            healthStatus = 'RISK';
          } else if (erosionRatioPct > 100) {
            healthStatus = 'ALERT';
          } else if (erosionRatioPct > 70) {
            healthStatus = 'RISK';
          } else if (erosionRatioPct > 30) {
            healthStatus = 'CAUTION';
          } else if (currentProfitPct < 0) {
            healthStatus = 'CAUTION';
          }

          newHealthMap.set(pos.id, {
            tradeId: pos.id,
            peakProfitPct,
            currentProfitPct,
            erosionPct: erosionAbsolutePct,
            erosionRatioPct,
            erosionCap: erosionCapFraction,
            status,
            healthStatus,
            alertMessage: pos.recommendation,
            regime: (pos.regime as string) || 'moderate',
          });
        });

        // Only update if data changed (compare by size and values)
        setHealthData(prev => {
          if (prev.size === newHealthMap.size) {
            let changed = false;
            for (const [key, val] of newHealthMap) {
              const old = prev.get(key);
              if (!old || old.currentProfitPct !== val.currentProfitPct || old.peakProfitPct !== val.peakProfitPct) {
                changed = true;
                break;
              }
            }
            if (!changed) return prev;
          }
          return newHealthMap;
        });
      } catch (err) {
        console.error('Failed to fetch position health', err);
      }
    }

    fetchPositionHealth();
    const interval = setInterval(fetchPositionHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch current prices for unrealized P&L calculation
  useEffect(() => {
    async function fetchPrices() {
      try {
        // Get unique pairs from open trades
        const uniquePairs = Array.from(new Set(trades.map(t => t.pair)));
        if (uniquePairs.length === 0) return;

        const pairsParam = uniquePairs.join(',');
        const response = await fetch(`/api/market-data/prices?pairs=${encodeURIComponent(pairsParam)}`);
        if (!response.ok) return;
        const data = await response.json();

        // Convert response format to simple price object
        const newPrices: CurrentPrices = {};
        Object.entries(data).forEach(([pair, marketData]: [string, any]) => {
          if (marketData && marketData.price) {
            newPrices[pair] = marketData.price;
          }
        });

        // Only update if prices actually changed (prevents unnecessary re-renders)
        setCurrentPrices(prev => {
          const keys = Object.keys(newPrices);
          if (keys.length !== Object.keys(prev).length) return newPrices;
          for (const key of keys) {
            if (prev[key] !== newPrices[key]) return newPrices;
          }
          return prev; // No change
        });
      } catch (err) {
        console.error('Failed to fetch prices:', err);
      }
    }

    if (trades.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [trades]);

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const displayedClosedTrades = closedTrades.slice(0, closedVisibleCount);

  async function handleManualClose(trade: Trade) {
    if (!currentPrices[trade.pair]) {
      setNotification({ type: 'error', message: 'Current price not available for this pair' });
      return;
    }

    setClosingTrade(trade.id);
    try {
      const currentPrice = currentPrices[trade.pair];
      const unrealizedPnL = (currentPrice - trade.entryPrice) * trade.quantity;
      const unrealizedPnLPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

      const requestPayload = {
        botInstanceId: botId,
        tradeId: trade.id,
        pair: trade.pair,
        exitTime: new Date().toISOString(),
        exitPrice: currentPrice,
        profitLoss: unrealizedPnL,
        profitLossPercent: unrealizedPnLPercent,
        exitReason: 'manual_close',
      };

      console.log('Closing trade with payload:', requestPayload);

      const response = await fetch('/api/bots/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const responseData = await response.json();
      console.log('Trade close response:', responseData, 'Status:', response.status);

      if (!response.ok) {
        const errorMsg = responseData.message || responseData.error || 'Failed to close trade';
        throw new Error(errorMsg);
      }

      // Refresh trades after closing
      const tradesResponse = await fetch(`/api/trades?botId=${botId}&limit=500`);
      if (tradesResponse.ok) {
        const data = await tradesResponse.json();
        setTrades(data.trades || []);
      }

      setNotification({ type: 'success', message: `Trade closed successfully at $${currentPrice.toFixed(2)}` });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error closing trade:', errorMsg);
      setNotification({ type: 'error', message: `Error closing trade: ${errorMsg}` });
    } finally {
      setClosingTrade(null);
    }
  }

  async function handleDeleteAllClosedTrades() {
    const closedCount = trades.filter(t => t.status === 'closed').length;
    setConfirmDialog({ closedCount });
  }

  async function handleConfirmDeleteAllClosedTrades() {
    if (!confirmDialog) return;
    const closedCount = confirmDialog.closedCount;

    setConfirmDialog(null);
    setIsDeletingClosedTrades(true);

    try {
      const response = await fetch('/api/admin/trades/delete-closed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || data.message || 'Failed to delete closed trades';
        setNotification({ type: 'error', message: errorMsg });
        console.error('Error deleting closed trades:', errorMsg);
        return;
      }

      // Refresh trades
      const tradesResponse = await fetch(`/api/trades?botId=${botId}&limit=500`);
      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json();
        setTrades(tradesData.trades || []);
      }

      setNotification({
        type: 'success',
        message: `Successfully deleted ${data.deletedCount || closedCount} closed trades`
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setNotification({ type: 'error', message: errorMsg });
      console.error('Error deleting closed trades:', errorMsg);
    } finally {
      setIsDeletingClosedTrades(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 dark:text-slate-400">Loading trades...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded">
        <p className="text-sm">⚠️ {error}</p>
      </div>
    );
  }

  const TradeTable = ({ tradeList, showExit = true, isOpen = false }: { tradeList: Trade[], showExit?: boolean, isOpen?: boolean }) => {
    if (tradeList.length === 0) {
      return (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p>No trades</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Pair</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Entry</th>
              {isOpen && <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Current</th>}
              {showExit && <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Exit</th>}
              {!isOpen && <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Exit Reason</th>}
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Qty</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">P&L</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">%</th>
              {isOpen && <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Peak P&L</th>}
              {isOpen && <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Erosion</th>}
              {isOpen && <th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Status</th>}
              <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Time</th>
              {isOpen && <th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {tradeList.map(trade => {
              const currentPrice = currentPrices[trade.pair];
              const unrealizedPnL = currentPrice ? (currentPrice - trade.entryPrice) * trade.quantity : null;
              const unrealizedPnLPercent = currentPrice ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : null;
              const displayPnL = isOpen ? unrealizedPnL : trade.profitLoss;
              const displayPnLPercent = isOpen ? unrealizedPnLPercent : trade.profitLossPercent;

              return (
                <tr key={trade.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">{trade.pair}</td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">${trade.entryPrice.toFixed(2)}</td>
                  {isOpen && (
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {currentPrice ? `$${currentPrice.toFixed(2)}` : '—'}
                    </td>
                  )}
                  {showExit && (
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'}
                    </td>
                  )}
                  {!isOpen && (
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {trade.exitReason || '—'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300">{trade.quantity.toFixed(4)}</td>
                  <td className={`py-3 px-4 text-right font-medium ${
                    displayPnL !== null && displayPnL >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {displayPnL !== null ? `$${displayPnL.toFixed(2)}` : '—'}
                  </td>
                  <td className={`py-3 px-4 text-right font-medium ${
                    displayPnLPercent !== null && displayPnLPercent >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {displayPnLPercent !== null ? `${displayPnLPercent >= 0 ? '+' : ''}${displayPnLPercent.toFixed(2)}%` : '—'}
                  </td>
                  {isOpen && (
                    <>
                      <td className="py-3 px-4 text-right text-sm">
                        {(() => {
                          const health = healthData.get(trade.id);
                          if (!health) return '—';

                          const peakProfitPct = health.peakProfitPct;
                          const peakProfitDollars = (peakProfitPct / 100) * trade.entryPrice * trade.quantity;

                          return (
                            <div>
                              <span className={peakProfitPct >= 0 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                                {peakProfitPct >= 0 ? '+$' : '-$'}{Math.abs(peakProfitDollars).toFixed(2)}
                              </span>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {peakProfitPct >= 0 ? '+' : ''}{peakProfitPct.toFixed(2)}%
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const health = healthData.get(trade.id);
                          if (!health) return <span className="text-slate-400 text-sm">—</span>;

                          const erosionRatioPct = health.erosionRatioPct;

                          // Bar width: clamped 0-100%
                          const barWidth = Math.min(100, Math.max(0, erosionRatioPct));

                          return (
                            <div className="flex items-center gap-2">
                              {/* Erosion bar - always visible */}
                              <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                                <div
                                  className="h-full transition-all"
                                  style={{
                                    width: `${barWidth}%`,
                                    background: barWidth === 0
                                      ? 'transparent'
                                      : 'linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 100%)',
                                  }}
                                />
                              </div>
                              {/* Percentage text */}
                              <span className="text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap min-w-[35px] text-right">
                                {erosionRatioPct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const health = healthData.get(trade.id);
                          if (!health) return '—';

                          // Map health status to badge colors - match Nexus style
                          const statusColors: Record<string, string> = {
                            HEALTHY: 'bg-emerald-600 text-white',
                            CAUTION: 'bg-amber-600 text-white',
                            RISK: 'bg-orange-600 text-white',
                            ALERT: 'bg-purple-600 text-white',
                          };

                          return (
                            <span className={`inline-block px-3 py-1 rounded font-semibold text-xs ${statusColors[health.healthStatus] || 'bg-slate-600 text-white'}`}>
                              {health.healthStatus}
                            </span>
                          );
                        })()}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs">
                    {new Date(trade.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  {isOpen && (
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleManualClose(trade)}
                        disabled={closingTrade === trade.id}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-400 text-white rounded text-xs font-medium transition"
                      >
                        {closingTrade === trade.id ? 'Closing...' : 'Close'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Info Box - How Trades Close */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-200">
          <strong>📊 Trade Management:</strong> Open positions close automatically when momentum signals fail (every 60 seconds) OR manually via the "Close" button. Unrealized P&L shows current profit/loss based on live market prices.
        </p>
      </div>

      {/* Open Positions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Open Positions ({openTrades.length})
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Unrealized P&L • Auto-close on momentum failure</span>
        </div>
        <TradeTable tradeList={openTrades} showExit={false} isOpen={true} />
      </div>

      {/* Closed Positions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
        <button
          onClick={() => setIsClosedPositionsCollapsed(!isClosedPositionsCollapsed)}
          className="w-full flex items-center justify-between text-lg font-semibold text-slate-900 dark:text-white hover:text-slate-700 dark:hover:text-slate-200 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
            <span>Closed Positions ({closedTrades.length})</span>
          </div>
          <span className="text-xl">{isClosedPositionsCollapsed ? '▶' : '▼'}</span>
        </button>

        {!isClosedPositionsCollapsed && (
          <>
            {isAdmin && closedTrades.length > 0 && (
              <div className="flex justify-end mt-4 mb-4">
                <button
                  onClick={handleDeleteAllClosedTrades}
                  disabled={isDeletingClosedTrades}
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-400 text-white rounded text-sm font-medium transition"
                >
                  {isDeletingClosedTrades ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            )}

            <TradeTable tradeList={displayedClosedTrades} showExit={true} />

            {closedTrades.length > displayedClosedTrades.length && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setClosedVisibleCount((count) => count + 20)}
                  className="px-4 py-2 rounded font-medium transition text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Load More Closed Positions
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification !== null}
        type={notification?.type || 'info'}
        message={notification?.message || ''}
        duration={3000}
        onClose={() => setNotification(null)}
      />

      {/* Confirmation Modal for Delete All */}
      {confirmDialog && (
        <ConfirmationModal
          isOpen={confirmDialog !== null}
          title="Delete All Closed Trades"
          message={`Delete all ${confirmDialog.closedCount} closed trades? This action cannot be undone.`}
          confirmText="Delete All"
          cancelText="Cancel"
          isDangerous={true}
          isLoading={isDeletingClosedTrades}
          onConfirm={handleConfirmDeleteAllClosedTrades}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
