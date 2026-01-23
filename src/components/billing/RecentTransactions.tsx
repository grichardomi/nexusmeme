'use client';

import { useEffect, useCallback } from 'react';
import { useLoadMore } from '@/hooks/useLoadMore';

interface Transaction {
  trade_id: string;
  pair: string;
  profit_amount: number;
  fee_amount: number;
  status: 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived';
  paid_at?: string;
  created_at?: string;
}

/**
 * Recent Transactions Component
 * Shows recent trades with fees with load more pagination
 * Initial load: 20 transactions
 * Subsequent loads: 20 transactions per click
 */
export function RecentTransactions() {
  // Memoize fetch function to prevent infinite re-renders
  const fetchTransactionsData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/fees/performance?type=transactions&offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch transactions');

    const data = await response.json();
    return {
      items: data.recentTransactions || [],
      total: data.transactionTotal || 0,
    };
  }, []);

  // Load more pagination
  const { items: transactions, isLoading, error, hasMore, load, loadMore } = useLoadMore<Transaction>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchTransactionsData,
  });

  // Initialize on mount
  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Recent Transactions</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600 dark:text-slate-400">Loading transactions...</div>
        </div>
      </section>
    );
  }

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

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Recent Transactions</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-2">📈</div>
          <p className="text-slate-600 dark:text-slate-400">No transactions yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            Your first fee will appear here when your bot makes a profitable trade
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
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
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {transactions.map(tx => (
                <tr key={tx.trade_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
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
                    {tx.paid_at
                      ? new Date(tx.paid_at).toLocaleDateString()
                      : tx.created_at
                      ? new Date(tx.created_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pt-6">
          <button
            onClick={() => loadMore()}
            disabled={isLoading}
            className={`px-6 py-2 rounded font-medium transition ${
              isLoading
                ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {isLoading ? 'Loading...' : 'Load More Transactions'}
          </button>
        </div>
      )}

      {/* Loading indicator at bottom */}
      {isLoading && transactions.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="text-slate-600 dark:text-slate-400 text-sm">Loading more transactions...</div>
        </div>
      )}

      {/* Error on load more */}
      {error && hasMore && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mt-4">
          {error}
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Showing {transactions.length} of {transactions.length + (hasMore ? '+' : '')} transactions
          </p>
        </div>
      )}
    </section>
  );
}
