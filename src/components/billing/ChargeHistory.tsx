'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';

interface ChargeRecord {
  id?: string;
  invoice_id: string;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  billing_period_start: string;
  billing_period_end: string;
  total_fees: number;
  trade_count: number;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  paid_at?: string;
  created_at?: string;
  invoice_url?: string;
}

/**
 * Charge History Component
 * Shows monthly billing cycles with load more pagination
 * Collapsible, mobile-first design
 */
export function ChargeHistory() {
  const [totalCount, setTotalCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  // Memoize fetch function to prevent infinite re-renders
  const fetchChargesData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/fees/performance?type=charges&offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch charge history');

    const data = await response.json();
    setTotalCount(data.chargeTotal || 0);
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

  // Smooth scroll to new items after load more completes
  useEffect(() => {
    if (!isLoadingMore && charges.length > previousCountRef.current && previousCountRef.current > 0) {
      requestAnimationFrame(() => {
        loadMoreRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
    previousCountRef.current = charges.length;
  }, [charges.length, isLoadingMore]);

  // Handle load more with loading state
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    await loadMore();
    setIsLoadingMore(false);
  };

  // Only show full loading skeleton on initial load
  const isInitialLoading = isLoading && charges.length === 0;

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
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Billing History</h2>
            {totalCount > 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {totalCount} billing cycle{totalCount !== 1 ? 's' : ''} (last 2 years)
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Showing last 2 years</p>
            )}
          </div>
        </div>
        {!isCollapsed && charges.length > 0 && (
          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full font-medium">
            {charges.length} loaded
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
          {/* Export & Portal Actions */}
          {charges.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 justify-end mb-4 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => (window.location.href = '/api/fees/performance?type=export-charges')}
                className="text-sm px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition font-medium"
                title="Download last 2 years of billing history"
              >
                📥 Export CSV
              </button>
              <button
                onClick={() => document.getElementById('crypto-pay-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition font-medium"
              >
                Pay with Crypto
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Initial Loading State */}
          {isInitialLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-24" />
              ))}
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-2">📋</div>
              <p className="text-slate-600 dark:text-slate-400">No billing history yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
                Your first charge will appear here when monthly billing runs on the 1st
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="sm:hidden space-y-3">
                {charges.map((charge, index) => (
                  <div
                    key={charge.id || `${charge.invoice_id}-${index}`}
                    className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-600"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {new Date(charge.billing_period_start).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {charge.trade_count} trade{charge.trade_count !== 1 ? 's' : ''} billed
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(charge.status)}`}
                      >
                        {getStatusIcon(charge.status)} {getStatusLabel(charge.status)}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${charge.total_fees.toFixed(2)}
                      </p>
                      {charge.invoice_url ? (
                        <a
                          href={charge.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 text-sm font-medium"
                        >
                          View Invoice
                        </a>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-sm">
                          No invoice
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Layout */}
              <div className="hidden sm:block space-y-3">
                {charges.map((charge, index) => (
                  <div
                    key={charge.id || `${charge.invoice_id}-${index}`}
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
                        {charge.stripe_invoice_id ? (
                          <>Invoice: {charge.stripe_invoice_id.slice(0, 16)}...</>
                        ) : (
                          <>ID: {charge.invoice_id.slice(0, 12)}...</>
                        )}
                      </p>
                      {charge.paid_at && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          Paid {new Date(charge.paid_at).toLocaleDateString()}
                        </p>
                      )}
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
                        <span className="text-slate-400 dark:text-slate-500 text-sm">
                          No invoice
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Scroll anchor */}
              <div ref={loadMoreRef} />

              {/* Load More Button */}
              {hasMore && (
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
                      `Load More (${charges.length} of ${totalCount})`
                    )}
                  </button>
                </div>
              )}

              {/* Error on load more */}
              {error && charges.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mt-4">
                  {error}
                  <button onClick={handleLoadMore} className="ml-2 underline font-medium">
                    Retry
                  </button>
                </div>
              )}
            </>
          )}

          {/* Stats Footer */}
          {charges.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              {/* Pagination info */}
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Showing <span className="font-semibold text-slate-900 dark:text-white">{charges.length}</span> of{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> billing cycles
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Total Charged</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    ${charges.reduce((sum, c) => sum + c.total_fees, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Trades Billed</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    {charges.reduce((sum, c) => sum + c.trade_count, 0)}
                  </p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Cycles</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{charges.length}</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">Success</p>
                  <p className={`text-lg sm:text-xl font-bold ${
                    charges.filter((c) => c.status === 'succeeded').length === charges.length
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-slate-900 dark:text-white'
                  }`}>
                    {charges.length > 0
                      ? Math.round(
                          ((charges.filter((c) => c.status === 'succeeded').length / charges.length) * 100)
                        )
                      : 0}
                    %
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Help Section */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Need help?</strong> For invoice questions, contact{' '}
              <Link href="/dashboard/support" className="underline font-semibold hover:text-blue-700 dark:hover:text-blue-300">
                contact support
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
