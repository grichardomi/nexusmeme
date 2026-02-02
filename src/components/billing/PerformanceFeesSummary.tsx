'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PerformanceFeesData {
  summary: {
    total_profits: number;
    total_fees_collected: number;
    pending_fees: number;
    billed_fees: number;
    total_trades: number;
  };
  billing: {
    billing_status: 'active' | 'past_due' | 'suspended';
    failed_charge_attempts: number;
    pause_trading_on_failed_charge: boolean;
  };
}

interface PerformanceFeesSummaryProps {
  tradingMode?: 'paper' | 'live';
}

/**
 * Performance Fees Summary Component
 * Shows overview of profits, fees by status, and billing lifecycle
 * Best practice: Clear fee status progression and actionable next steps
 */
export function PerformanceFeesSummary({ tradingMode }: PerformanceFeesSummaryProps) {
  const [data, setData] = useState<PerformanceFeesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paper trading - show simulated stats only
  if (tradingMode === 'paper') {
    return (
      <section className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Performance Fees</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
            Paper Trading
          </span>
        </div>

        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Paper Trading Mode
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            You&apos;re practicing with simulated trades. No real money is involved and no fees are charged.
          </p>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Ready to earn real profits? You&apos;ll only pay 5% on profitable trades.
            </p>
            <a
              href="/dashboard/bots"
              className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
            >
              Go to Bots → Switch to Live
            </a>
          </div>
        </div>
      </section>
    );
  }

  useEffect(() => {
    fetchFeesSummary();
  }, []);

  const fetchFeesSummary = async () => {
    try {
      const response = await fetch('/api/fees/performance');
      if (!response.ok) throw new Error('Failed to fetch fees');
      const feeData = await response.json();
      setData(feeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fees');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate next billing date (1st of next month)
  const getNextBillingDate = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Days until next billing
  const getDaysUntilBilling = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diffTime = nextMonth.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="space-y-4">
          <div className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-32" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-24" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="text-center py-12 text-slate-600 dark:text-slate-400">
          No fee data available. Create a bot and start trading to see your performance fees.
        </div>
      </section>
    );
  }

  const { summary, billing } = data;
  const daysUntilBilling = getDaysUntilBilling();
  const hasOverdue = billing.billing_status === 'past_due' || billing.billing_status === 'suspended';
  const overdueAmount = summary.billed_fees; // Billed but not paid = overdue

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      {/* Header - Compact for mobile */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Performance Fees</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
          5% on profits
        </span>
      </div>

      {/* CRITICAL: Overdue/Failed Payment Alert */}
      {hasOverdue && overdueAmount > 0 && (
        <div className={`mb-4 rounded-lg p-3 ${
          billing.billing_status === 'suspended'
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${
                billing.billing_status === 'suspended'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {billing.billing_status === 'suspended' ? '🚫 Payment Failed' : '⚠️ Overdue'}
              </p>
              <p className={`text-lg font-bold ${
                billing.billing_status === 'suspended'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                ${Number(overdueAmount).toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => (window.location.href = '/api/billing/customer-portal')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-xs text-white shrink-0 ${
                billing.billing_status === 'suspended'
                  ? 'bg-red-600 active:bg-red-700'
                  : 'bg-amber-600 active:bg-amber-700'
              }`}
            >
              Pay Now
            </button>
          </div>
        </div>
      )}

      {/* Mobile-First Metrics - Single column on mobile, 2 cols on sm+ */}
      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3 mb-4">
        {/* Total Profits - Hero metric */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
          <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Total Profits</p>
          <p className="text-2xl sm:text-3xl font-bold mt-1">
            ${Number(summary.total_profits || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-blue-200 text-sm mt-1">{summary.total_trades} trades</p>
        </div>

        {/* Pending Fees - Important secondary metric */}
        <div className={`rounded-xl p-4 ${
          summary.pending_fees > 0
            ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700'
            : 'bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600'
        }`}>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Pending Fees</p>
          <p className={`text-2xl sm:text-3xl font-bold mt-1 ${
            Number(summary.pending_fees) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
          }`}>
            ${Number(summary.pending_fees || 0).toFixed(2)}
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {summary.pending_fees > 0 ? `Due in ${daysUntilBilling} days` : 'None pending'}
          </p>
        </div>
      </div>

      {/* Secondary Stats Row - Compact horizontal layout */}
      <div className="flex items-center justify-between gap-2 py-3 border-y border-slate-200 dark:border-slate-700 mb-4">
        {/* Fees Paid */}
        <div className="text-center flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Paid</p>
          <p className="text-base font-bold text-green-600 dark:text-green-400">
            ${Number(summary.total_fees_collected || 0).toFixed(2)}
          </p>
        </div>

        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

        {/* Billing Status */}
        <div className="text-center flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status</p>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${
              billing.billing_status === 'active'
                ? 'bg-green-500'
                : billing.billing_status === 'past_due'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-red-500 animate-pulse'
            }`} />
            <span className={`text-base font-bold ${
              billing.billing_status === 'active'
                ? 'text-green-600 dark:text-green-400'
                : billing.billing_status === 'past_due'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {billing.billing_status === 'active' ? 'Active' : billing.billing_status === 'past_due' ? 'Overdue' : 'Suspended'}
            </span>
          </div>
        </div>

        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />

        {/* Next Billing */}
        <div className="text-center flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Next Bill</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {summary.pending_fees > 0 ? getNextBillingDate().split(',')[0] : '—'}
          </p>
        </div>
      </div>

      {/* Fee Lifecycle - Simplified for mobile */}
      <details className="group mb-4">
        <summary className="cursor-pointer flex items-center justify-between py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-2">
            <span className="text-base">📊</span>
            Fee Lifecycle
          </span>
          <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-2 flex items-center justify-around py-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
          <div className="text-center">
            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${
              summary.pending_fees > 0
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-400'
            }`}>⏳</div>
            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Pending</p>
            <p className="text-xs font-bold">${Number(summary.pending_fees || 0).toFixed(0)}</p>
          </div>
          <span className="text-slate-300 dark:text-slate-600">→</span>
          <div className="text-center">
            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${
              summary.billed_fees > 0
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-400'
            }`}>📄</div>
            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Billed</p>
            <p className="text-xs font-bold">${Number(summary.billed_fees || 0).toFixed(0)}</p>
          </div>
          <span className="text-slate-300 dark:text-slate-600">→</span>
          <div className="text-center">
            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${
              summary.total_fees_collected > 0
                ? 'bg-green-100 dark:bg-green-900/50 text-green-600'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-400'
            }`}>✓</div>
            <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">Paid</p>
            <p className="text-xs font-bold">${Number(summary.total_fees_collected || 0).toFixed(0)}</p>
          </div>
        </div>
      </details>

      {/* How it Works - Collapsed */}
      <details className="group">
        <summary className="cursor-pointer flex items-center justify-between py-2 text-sm font-medium text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-2">
            <span className="text-base">💡</span>
            How it works
          </span>
          <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg text-sm text-slate-600 dark:text-slate-400 space-y-2">
          <p>1. Trade → 5% of profits added to pending</p>
          <p>2. Monthly → Pending fees charged on 1st</p>
          <p>3. Losing trades → No fee</p>
        </div>
      </details>

      {/* Quick Actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => (window.location.href = '/api/billing/customer-portal')}
          className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg active:bg-slate-200 dark:active:bg-slate-600"
        >
          Manage Payment
        </button>
        <Link
          href="/help/performance-fees"
          className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg active:bg-blue-100 dark:active:bg-blue-900/40"
        >
          FAQ
        </Link>
      </div>
    </section>
  );
}
