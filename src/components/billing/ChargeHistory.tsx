'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';

interface ChargeRecord {
  invoice_id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_fees: number;
  trade_count: number;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  invoice_url?: string;
}

/**
 * Charge History Component
 * Shows monthly billing cycles with load more pagination
 * Initial load: 10 charges
 * Subsequent loads: 10 charges per click
 */
export function ChargeHistory() {
  // Memoize fetch function to prevent infinite re-renders
  const fetchChargesData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/fees/performance?type=charges&offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch charge history');

    const data = await response.json();
    return {
      items: data.charges || [],
      total: data.chargeTotal || 0,
    };
  }, []);

  // Load more pagination
  const { items: charges, isLoading, error, hasMore, load, loadMore } = useLoadMore<ChargeRecord>({
    initialPageSize: 10,
    pageSize: 10,
    fetchFn: fetchChargesData,
  });

  // Initialize on mount
  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Charge History</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600 dark:text-slate-400">Loading charge history...</div>
        </div>
      </section>
    );
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'pending':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'refunded':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'Succeeded';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return '✓';
      case 'failed':
        return '✕';
      case 'pending':
        return '⧗';
      case 'refunded':
        return '↩';
      default:
        return '—';
    }
  };

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Charge History</h2>
        {charges.length > 0 && (
          <button
            onClick={() => (window.location.href = '/api/billing/customer-portal')}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            View in Portal →
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {charges.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-2">📋</div>
          <p className="text-slate-600 dark:text-slate-400">No billing history yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            Your first charge will appear here when monthly billing runs on the 1st
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {charges.map((charge) => (
              <div
                key={charge.invoice_id}
                className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                {/* Left Section: Date & Period */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {new Date(charge.billing_period_start).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400">•</span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {new Date(charge.billing_period_start).toLocaleDateString()} to{' '}
                      {new Date(charge.billing_period_end).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                    Invoice: {charge.invoice_id.slice(0, 12)}...
                  </p>
                </div>

                {/* Middle Section: Trade Count & Amount */}
                <div className="text-right mr-6">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    {charge.trade_count} {charge.trade_count === 1 ? 'trade' : 'trades'} billed
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white text-lg">
                    ${charge.total_fees.toFixed(2)}
                  </p>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-4">
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(
                      charge.status
                    )}`}
                  >
                    <span>{getStatusIcon(charge.status)}</span>
                    {getStatusLabel(charge.status)}
                  </span>

                  {/* Action Button */}
                  {charge.invoice_url ? (
                    <a
                      href={charge.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                    >
                      Download
                    </a>
                  ) : (
                    <button
                      onClick={() => (window.location.href = '/api/billing/customer-portal')}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

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
                {isLoading ? 'Loading...' : 'Load More Charges'}
              </button>
            </div>
          )}

          {/* Loading indicator at bottom */}
          {isLoading && charges.length > 0 && (
            <div className="flex justify-center py-4">
              <div className="text-slate-600 dark:text-slate-400 text-sm">Loading more charges...</div>
            </div>
          )}

          {/* Error on load more */}
          {error && hasMore && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mt-4">
              {error}
            </div>
          )}
        </>
      )}

      {charges.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Shown Total Charged</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              ${charges.reduce((sum, c) => sum + c.total_fees, 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Shown Total Trades</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {charges.reduce((sum, c) => sum + c.trade_count, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Shown Cycles</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{charges.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Success Rate</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {charges.length > 0
                ? Math.round(
                    ((charges.filter((c) => c.status === 'succeeded').length / charges.length) * 100)
                  )
                : 0}
              %
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>Need help?</strong> For detailed invoice information, visit your{' '}
          <button
            onClick={() => (window.location.href = '/api/billing/customer-portal')}
            className="underline font-semibold hover:text-blue-700 dark:hover:text-blue-300"
          >
            Stripe billing portal
          </button>{' '}
          or{' '}
          <Link href="/dashboard/support" className="underline font-semibold hover:text-blue-700 dark:hover:text-blue-300">
            contact support
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
