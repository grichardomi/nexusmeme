'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useLoadMore } from '@/hooks/useLoadMore';

interface Transaction {
  id?: string;
  trade_id: string;
  pair: string;
  profit_amount: number;
  fee_amount: number;
  status: 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived';
  paid_at?: string;
  created_at?: string;
  exit_time?: string;
  billed_at?: string;
  stripe_invoice_id?: string;
}

type StatusFilter = 'all' | 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived';

/**
 * Recent Transactions Component
 * Shows recent trades with fees with load more pagination and filtering
 * Mobile-first design with smooth scroll on load more
 */
export function RecentTransactions() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  // Memoize fetch function with status filter
  const fetchTransactionsData = useCallback(async (offset: number, limit: number) => {
    const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
    const response = await fetch(`/api/fees/performance?type=transactions&offset=${offset}&limit=${limit}${statusParam}`);
    if (!response.ok) throw new Error('Failed to fetch transactions');

    const data = await response.json();
    setTotalCount(data.transactionTotal || 0);
    return {
      items: data.recentTransactions || [],
      total: data.transactionTotal || 0,
    };
  }, [statusFilter]);

  // Load more pagination
  const { items: transactions, isLoading, error, hasMore, load, loadMore, reset } = useLoadMore<Transaction>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchTransactionsData,
  });

  // Initialize on mount and when filter changes
  useEffect(() => {
    reset();
    load();
  }, [load, reset, statusFilter]);

  // Smooth scroll to new items after load more completes
  useEffect(() => {
    if (!isLoadingMore && transactions.length > previousCountRef.current && previousCountRef.current > 0) {
      // Small delay to let DOM update
      requestAnimationFrame(() => {
        loadMoreRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
    previousCountRef.current = transactions.length;
  }, [transactions.length, isLoadingMore]);

  // Handle load more with loading state
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    await loadMore();
    setIsLoadingMore(false);
  };

  // Only show full loading skeleton on initial load (no transactions yet)
  const isInitialLoading = isLoading && transactions.length === 0;

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'billed':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'pending_billing':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'refunded':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'waived':
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_billing':
        return 'Pending';
      case 'billed':
        return 'Billed';
      case 'paid':
        return 'Paid';
      case 'refunded':
        return 'Refunded';
      case 'waived':
        return 'Waived';
      default:
        return status;
    }
  };

  const handleFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
  };

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full p-4 sm:p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
              isCollapsed ? '' : 'rotate-90'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="text-left">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Fee Transactions</h2>
            {totalCount > 0 && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {totalCount.toLocaleString()} total transactions
              </p>
            )}
          </div>
        </div>
        {!isCollapsed && totalCount > 0 && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
            {transactions.length} loaded
          </span>
        )}
      </button>

      {/* Collapsible Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[5000px] opacity-100'
        }`}
      >
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Filter Row */}
          <div className="flex items-center justify-between mb-4 pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Filter by status
            </p>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => handleFilterChange(e.target.value as StatusFilter)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="pending_billing">Pending</option>
              <option value="billed">Billed</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="waived">Waived</option>
            </select>
          </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Initial Loading State */}
      {isInitialLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-20" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-2">📈</div>
          <p className="text-slate-600 dark:text-slate-400">No transactions yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            Your first fee will appear here when your bot makes a profitable trade
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (shown on small screens) */}
          <div className="sm:hidden space-y-3">
            {transactions.map((tx, index) => (
              <div
                key={tx.id || `${tx.trade_id}-${index}`}
                className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {tx.trade_id.slice(0, 8)}...
                    </p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
                      {tx.pair}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(tx.status)}`}
                  >
                    {getStatusLabel(tx.status)}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Profit</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      ${tx.profit_amount.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Fee (5%)</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      ${tx.fee_amount.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Closed</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {tx.exit_time
                        ? new Date(tx.exit_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : tx.created_at
                        ? new Date(tx.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout (hidden on small screens) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Trade ID
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Pair
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Profit
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Fee (5%)
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white text-sm">
                    Closed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {transactions.map((tx, index) => (
                  <tr key={tx.id || `${tx.trade_id}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                    <td className="py-4 px-4 text-sm font-mono text-slate-900 dark:text-white">
                      {tx.trade_id.slice(0, 8)}...
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-slate-900 dark:text-white">
                      {tx.pair}
                    </td>
                    <td className="py-4 px-4 text-sm text-right text-green-600 dark:text-green-400 font-semibold">
                      ${tx.profit_amount.toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-sm text-right text-slate-900 dark:text-white font-semibold">
                      ${tx.fee_amount.toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(
                          tx.status
                        )}`}
                      >
                        {getStatusLabel(tx.status)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {tx.exit_time
                        ? new Date(tx.exit_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : tx.created_at
                        ? new Date(tx.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Scroll anchor for smooth scroll */}
      <div ref={loadMoreRef} />

      {/* Load More Button */}
      {hasMore && transactions.length > 0 && (
        <div className="flex justify-center pt-6">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className={`w-full sm:w-auto px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              isLoadingMore
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm hover:shadow'
            }`}
          >
            {isLoadingMore ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            ) : (
              `Load More (${transactions.length} of ${totalCount.toLocaleString()})`
            )}
          </button>
        </div>
      )}

      {/* Error on load more */}
      {error && transactions.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mt-4">
          {error}
          <button
            onClick={handleLoadMore}
            className="ml-2 underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

          {/* Footer Stats */}
          {transactions.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Showing <span className="font-semibold text-slate-900 dark:text-white">{transactions.length}</span> of{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{totalCount.toLocaleString()}</span>
                {statusFilter !== 'all' && (
                  <span className="ml-1">
                    ({getStatusLabel(statusFilter)})
                  </span>
                )}
              </p>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => handleFilterChange('all')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
