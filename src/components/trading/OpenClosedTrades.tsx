'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  profitLossNet: number | null;
  profitLossPercentNet: number | null;
  fee: number | null;
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
  erosionDollars: number;
  erosionCapDollars: number;
  status?: 'healthy' | 'warning' | 'critical' | 'underwater';
  healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT';
  alertMessage?: string;
  regime: string;
}

interface OpenClosedTradesProps {
  botId: string;
}

type StatusFilter = 'all' | 'open' | 'closed' | 'profitable' | 'losses' | 'archived';

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
  const [isClosedPositionsCollapsed, setIsClosedPositionsCollapsed] = useState(true);
  const [isOpenPositionsCollapsed, setIsOpenPositionsCollapsed] = useState(false);
  const [isDeletingClosedTrades, setIsDeletingClosedTrades] = useState(false);
  const [isArchivedCollapsed, setIsArchivedCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const TRADES_PER_PAGE = 20;

  // Modal states
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ closedCount: number } | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<Trade | null>(null);
  const [deleteTradeConfirm, setDeleteTradeConfirm] = useState<Trade | null>(null);
  const [isDeletingTrade, setIsDeletingTrade] = useState<string | null>(null);

  const isAdmin = session?.user && (session.user as any).role === 'admin';

  // Fetch trades with 2-year window, status filter, and pagination
  const fetchTrades = useCallback(async (offset: number = 0, append: boolean = false) => {
    try {
      const params = new URLSearchParams({
        botId,
        offset: offset.toString(),
        limit: TRADES_PER_PAGE.toString(),
        status: statusFilter,
      });

      const response = await fetch(`/api/trades?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch trades');
      }
      const data = await response.json();
      const newTrades = data.trades || [];
      const total = data.total || 0;

      setTotalCount(total);
      setHasMore(newTrades.length === TRADES_PER_PAGE && offset + newTrades.length < total);

      if (append) {
        setTrades(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const uniqueNewTrades = newTrades.filter((t: Trade) => !existingIds.has(t.id));
          return [...prev, ...uniqueNewTrades];
        });
      } else {
        setTrades(newTrades);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [botId, statusFilter]);

  // Initial load and refresh on filter change
  useEffect(() => {
    setIsLoading(true);
    setTrades([]);
    fetchTrades(0, false);

    const interval = setInterval(() => fetchTrades(0, false), 10000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  // Load more handler
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const currentOffset = trades.length;
    await fetchTrades(currentOffset, true);

    // Smooth scroll
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [trades.length, isLoadingMore, hasMore, fetchTrades]);

  // Map backend exit reasons to user-friendly labels
  function formatExitReason(reason: any): string {
    const r = String(reason ?? '').toLowerCase();
    if (r === 'erosion_cap_profit_lock' || r === 'erosion_cap_protected' || r === 'erosion_cap_exceeded') return 'Erosion Cap';
    if (r === 'underwater_profitable_collapse') return 'Profitable Collapse';
    if (r === 'underwater_small_peak_timeout') return 'Small Peak Timeout';
    if (r === 'underwater_never_profited') return 'Never Profited';
    if (r === 'force_close_underwater') return 'Force Close';
    if (r === 'manual_close') return 'Manual Close';
    if (r === 'profit_target') return 'Profit Target';
    if (r === 'breakeven_protection') return 'Breakeven Protection';
    if (r === 'stop_loss') return 'Stop Loss';
    if (r === 'emergency_stop') return 'Emergency Stop';
    return String(reason ?? '');
  }

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
          const erosionRatioPct = Number(pos.erosionRatioPct) || 0;
          const erosionDollars = Number(pos.erosionDollars) || 0;
          const erosionCapDollars = Number(pos.erosionCapDollars) || 0;
          const erosionCap = Number(pos.erosionCap) || 0;

          // Use server-computed health status (matches actual exit trigger logic)
          const healthStatus = (pos.healthStatus as PositionHealth['healthStatus']) || 'HEALTHY';

          newHealthMap.set(pos.id, {
            tradeId: pos.id,
            peakProfitPct,
            currentProfitPct,
            erosionPct: Number(pos.erosionPct) || 0,
            erosionRatioPct,
            erosionCap,
            erosionDollars,
            erosionCapDollars,
            healthStatus,
            alertMessage: pos.alertMessage || pos.recommendation,
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
  const archivedTrades = trades.filter(t => t.status === 'archived');

  // CSV Export Handler
  const handleCSVExport = useCallback(() => {
    const params = new URLSearchParams({
      botId,
      status: statusFilter,
      type: 'export',
    });
    window.location.href = `/api/trades?${params}`;
  }, [botId, statusFilter]);

  async function handleManualClose(trade: Trade) {
    if (!currentPrices[trade.pair]) {
      setNotification({ type: 'error', message: 'Current price not available for this pair' });
      return;
    }

    setClosingTrade(trade.id);
    try {
      const currentPrice = currentPrices[trade.pair];
      // Send GROSS P&L to close endpoint - it handles fee deduction server-side
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

      const response = await fetch('/api/bots/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMsg = responseData.message || responseData.error || 'Failed to close trade';
        throw new Error(errorMsg);
      }

      // Refresh trades after closing
      await fetchTrades(0, false);

      setNotification({ type: 'success', message: `Trade closed successfully at $${currentPrice.toFixed(2)}` });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error closing trade:', errorMsg);
      setNotification({ type: 'error', message: `Error closing trade: ${errorMsg}` });
    } finally {
      setClosingTrade(null);
    }
  }

  async function handleConfirmClose() {
    if (!closeConfirm) return;
    const trade = closeConfirm;
    setCloseConfirm(null);
    await handleManualClose(trade);
  }

  async function handleDeleteSingleTrade() {
    if (!deleteTradeConfirm) return;
    const trade = deleteTradeConfirm;
    setDeleteTradeConfirm(null);
    setIsDeletingTrade(trade.id);

    try {
      const response = await fetch('/api/admin/trades/delete-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, tradeId: trade.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || data.message || 'Failed to delete trade';
        setNotification({ type: 'error', message: errorMsg });
        return;
      }

      await fetchTrades(0, false);
      setNotification({ type: 'success', message: `Trade deleted successfully` });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setNotification({ type: 'error', message: errorMsg });
    } finally {
      setIsDeletingTrade(null);
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
      await fetchTrades(0, false);

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

  // Mobile-first trade card component
  const TradeCard = ({ trade, isOpen }: { trade: Trade; isOpen: boolean }) => {
    const currentPrice = currentPrices[trade.pair];
    // Use NET P&L from API (includes estimated round-trip fees)
    // Fall back to GROSS client-side calc only if API NET values unavailable
    const unrealizedPnL = trade.profitLossNet ?? (currentPrice ? (currentPrice - trade.entryPrice) * trade.quantity : null);
    const unrealizedPnLPercent = trade.profitLossPercentNet ?? (currentPrice ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : null);
    const displayPnL = isOpen ? unrealizedPnL : (trade.profitLossNet ?? trade.profitLoss);
    const displayPnLPercent = isOpen ? unrealizedPnLPercent : (trade.profitLossPercentNet ?? trade.profitLossPercent);
    const health = healthData.get(trade.id);

    return (
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-lg text-slate-900 dark:text-white">{trade.pair}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(trade.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
            isOpen
              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
              : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
          }`}>
            {isOpen ? '◔ Open' : '✓ Closed'}
          </span>
        </div>

        {/* Price Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Entry Price</p>
            <p className="font-medium text-slate-900 dark:text-white">${trade.entryPrice.toFixed(2)}</p>
          </div>
          {isOpen && currentPrice && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Current Price</p>
              <p className="font-medium text-slate-900 dark:text-white">${currentPrice.toFixed(2)}</p>
            </div>
          )}
          {!isOpen && trade.exitPrice && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Exit Price</p>
              <p className="font-medium text-slate-900 dark:text-white">${trade.exitPrice.toFixed(2)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quantity</p>
            <p className="font-medium text-slate-900 dark:text-white">{trade.quantity.toFixed(4)}</p>
          </div>
          {trade.fee !== null && trade.fee > 0 && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isOpen ? 'Entry Fee' : 'Total Fees'}
              </p>
              <p className="font-medium text-amber-600 dark:text-amber-400 text-sm">
                ${trade.fee.toFixed(2)}
              </p>
            </div>
          )}
          {!isOpen && trade.exitReason && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Exit Reason</p>
              <p className="font-medium text-slate-700 dark:text-slate-300 text-xs truncate">{formatExitReason(trade.exitReason)}</p>
            </div>
          )}
        </div>

        {/* P&L */}
        <div className="border-t border-slate-200 dark:border-slate-600 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {isOpen ? 'Unrealized P&L' : 'Realized P&L'}
            </span>
            <div className="text-right">
              <p className={`font-bold text-lg ${
                displayPnL !== null && displayPnL >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {displayPnL !== null ? `${displayPnL >= 0 ? '+' : ''}$${displayPnL.toFixed(2)}` : '—'}
              </p>
              {displayPnLPercent !== null && (
                <p className={`text-sm ${
                  displayPnLPercent >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {displayPnLPercent >= 0 ? '+' : ''}{displayPnLPercent.toFixed(2)}%
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Open Position Health */}
        {isOpen && health && (
          <div className="border-t border-slate-200 dark:border-slate-600 pt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Peak P&L</span>
              <span className={`font-semibold ${health.peakProfitPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}`}>
                {health.peakProfitPct >= 0 ? '+' : ''}{`$${Math.abs((health.peakProfitPct / 100) * trade.entryPrice * trade.quantity).toFixed(2)}`}
                <span className="ml-1 text-xs opacity-75">
                  ({health.peakProfitPct >= 0 ? '+' : ''}{health.peakProfitPct.toFixed(2)}%)
                </span>
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500 dark:text-slate-400">
                  Erosion {health.erosionCapDollars > 0 && (
                    <span className="opacity-60">(cap ${health.erosionCapDollars.toFixed(2)})</span>
                  )}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {health.peakProfitPct > 0 && health.peakProfitPct <= 0.1
                    ? 'Flat'
                    : health.erosionDollars > 0
                      ? `$${health.erosionDollars.toFixed(2)} (${health.erosionRatioPct.toFixed(0)}%)`
                      : `${health.erosionRatioPct.toFixed(1)}%`
                  }
                </span>
              </div>
              <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${health.peakProfitPct > 0 && health.peakProfitPct <= 0.1 ? 0 : Math.min(100, Math.max(0, health.erosionRatioPct))}%`,
                    background: health.erosionRatioPct === 0 ? 'transparent'
                      : health.erosionRatioPct > 70 ? 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)'
                      : 'linear-gradient(90deg, #22c55e 0%, #eab308 100%)',
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Health Status</span>
              <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                health.healthStatus === 'HEALTHY' ? 'bg-emerald-600 text-white' :
                health.healthStatus === 'CAUTION' ? 'bg-amber-600 text-white' :
                health.healthStatus === 'RISK' ? 'bg-orange-600 text-white' :
                'bg-purple-600 text-white'
              }`}>
                {health.healthStatus}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        {isOpen && (
          <button
            onClick={() => setCloseConfirm(trade)}
            disabled={closingTrade === trade.id}
            className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-400 text-white rounded font-medium transition"
          >
            {closingTrade === trade.id ? 'Closing...' : 'Close Position'}
          </button>
        )}
        {/* Archive button for closed trades (admin only) */}
        {!isOpen && isAdmin && (
          <button
            onClick={() => setDeleteTradeConfirm(trade)}
            disabled={isDeletingTrade === trade.id}
            className="w-full px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:bg-slate-400 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded text-sm font-medium transition"
          >
            {isDeletingTrade === trade.id ? 'Archiving...' : 'Archive Trade'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-200">
          <strong>📊 Trade Management:</strong> Open positions close automatically when momentum signals fail OR manually via "Close Position" button. Showing last 2 years of trades.
        </p>
      </div>

      {/* Filters and Export */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Status Filters */}
        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {(['all', 'open', 'closed', 'profitable', 'losses', ...(isAdmin ? ['archived'] : [])] as StatusFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition ${
                  statusFilter === filter
                    ? filter === 'archived' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {filter === 'all' && '📊 All'}
                {filter === 'open' && '◔ Open'}
                {filter === 'closed' && '✓ Closed'}
                {filter === 'profitable' && '📈 Profitable'}
                {filter === 'losses' && '📉 Losses'}
                {filter === 'archived' && '📦 Archived'}
              </button>
            ))}
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleCSVExport}
          className="flex-shrink-0 px-4 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded border border-green-200 dark:border-green-700 transition"
        >
          📥 Export CSV
        </button>
      </div>

      {/* Open Positions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsOpenPositionsCollapsed(!isOpenPositionsCollapsed)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Open Positions ({openTrades.length})
            </h3>
          </div>
          <svg className={`w-5 h-5 text-slate-500 transition-transform ${isOpenPositionsCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!isOpenPositionsCollapsed && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            {openTrades.length === 0 ? (
              <p className="text-center py-8 text-slate-500 dark:text-slate-400">No open positions</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {openTrades.map(trade => (
                  <TradeCard key={trade.id} trade={trade} isOpen={true} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Closed Positions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setIsClosedPositionsCollapsed(!isClosedPositionsCollapsed)}
            className="flex-1 flex items-center justify-between hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Closed Positions ({totalCount > trades.length ? totalCount : closedTrades.length})
              </h3>
            </div>
            <svg className={`w-5 h-5 text-slate-500 transition-transform ${isClosedPositionsCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isAdmin && !isClosedPositionsCollapsed && closedTrades.length > 0 && (
            <button
              onClick={handleDeleteAllClosedTrades}
              disabled={isDeletingClosedTrades}
              className="ml-3 px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-slate-400 text-white rounded text-sm font-medium transition"
            >
              {isDeletingClosedTrades ? 'Archiving...' : 'Archive All'}
            </button>
          )}
        </div>

        {!isClosedPositionsCollapsed && (
          <div className="p-4">
            {closedTrades.length === 0 ? (
              <p className="text-center py-8 text-slate-500 dark:text-slate-400">No closed positions</p>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {closedTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} isOpen={false} />
                  ))}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center mt-6" ref={scrollRef}>
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className={`px-6 py-2 rounded font-medium transition text-sm ${
                        isLoadingMore
                          ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isLoadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Archived Trades (admin only, visible when archived filter is active) */}
      {isAdmin && statusFilter === 'archived' && (
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setIsArchivedCollapsed(!isArchivedCollapsed)}
            className="w-full flex items-center justify-between p-4 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
                Archived Trades ({archivedTrades.length})
              </h3>
            </div>
            <svg className={`w-5 h-5 text-amber-500 transition-transform ${isArchivedCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {!isArchivedCollapsed && (
            <div className="p-3 sm:p-4 border-t border-amber-200 dark:border-amber-700">
              {archivedTrades.length === 0 ? (
                <p className="text-center py-8 text-slate-500 dark:text-slate-400">No archived trades</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                    {archivedTrades.map(trade => (
                      <TradeCard key={trade.id} trade={trade} isOpen={false} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center mt-4 sm:mt-6" ref={scrollRef}>
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className={`w-full sm:w-auto px-6 py-3 sm:py-2 rounded-lg font-medium transition text-sm ${
                          isLoadingMore
                            ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/50 active:bg-amber-300'
                        }`}
                      >
                        {isLoadingMore ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification !== null}
        type={notification?.type || 'info'}
        message={notification?.message || ''}
        duration={3000}
        onClose={() => setNotification(null)}
      />

      {/* Confirmation Modal for Close Position */}
      {closeConfirm && (
        <ConfirmationModal
          isOpen={closeConfirm !== null}
          title="Close Position"
          message={`Close your ${closeConfirm.pair} position at ~$${(currentPrices[closeConfirm.pair] || 0).toFixed(2)}? This will place a market sell order on the exchange.`}
          confirmText="Close Position"
          cancelText="Cancel"
          isDangerous={true}
          isLoading={closingTrade === closeConfirm.id}
          onConfirm={handleConfirmClose}
          onCancel={() => setCloseConfirm(null)}
        />
      )}

      {/* Confirmation Modal for Archive All */}
      {confirmDialog && (
        <ConfirmationModal
          isOpen={confirmDialog !== null}
          title="Archive All Closed Trades"
          message={`Archive ${confirmDialog.closedCount} closed trades? They will be hidden from the dashboard but preserved for reporting and tax records.`}
          confirmText="Archive All"
          cancelText="Cancel"
          isDangerous={false}
          isLoading={isDeletingClosedTrades}
          onConfirm={handleConfirmDeleteAllClosedTrades}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Confirmation Modal for Archive Single Trade */}
      {deleteTradeConfirm && (
        <ConfirmationModal
          isOpen={deleteTradeConfirm !== null}
          title="Archive Trade"
          message={`Archive this ${deleteTradeConfirm.pair} trade? It will be hidden from the dashboard but preserved for reporting.`}
          confirmText="Archive"
          cancelText="Cancel"
          isDangerous={false}
          isLoading={isDeletingTrade === deleteTradeConfirm.id}
          onConfirm={handleDeleteSingleTrade}
          onCancel={() => setDeleteTradeConfirm(null)}
        />
      )}
    </div>
  );
}
