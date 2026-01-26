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

/**
 * Performance Fees Summary Component
 * Shows overview of profits, fees by status, and billing lifecycle
 * Best practice: Clear fee status progression and actionable next steps
 */
export function PerformanceFeesSummary() {
  const [data, setData] = useState<PerformanceFeesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Performance Fees</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            5% fee on profitable trades only
          </p>
        </div>
        <Link
          href="/help/performance-fees"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          How it works →
        </Link>
      </div>

      {/* CRITICAL: Overdue/Failed Payment Alert */}
      {hasOverdue && overdueAmount > 0 && (
        <div className={`mb-6 rounded-lg p-4 border ${
          billing.billing_status === 'suspended'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className={`text-sm font-semibold flex items-center gap-2 ${
                billing.billing_status === 'suspended'
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-amber-800 dark:text-amber-200'
              }`}>
                {billing.billing_status === 'suspended' ? '🚫' : '⚠️'}
                {billing.billing_status === 'suspended' ? 'Payment Failed - Action Required' : 'Payment Overdue'}
              </p>
              <p className={`text-sm mt-1 ${
                billing.billing_status === 'suspended'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                <span className="font-bold text-lg">${overdueAmount.toFixed(2)}</span> overdue
                {billing.failed_charge_attempts > 0 && (
                  <span className="ml-2">• {billing.failed_charge_attempts} failed attempt{billing.failed_charge_attempts !== 1 ? 's' : ''}</span>
                )}
              </p>
              {billing.billing_status === 'suspended' && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Trading will be paused until payment is resolved
                </p>
              )}
            </div>
            <button
              onClick={() => (window.location.href = '/api/billing/customer-portal')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition whitespace-nowrap ${
                billing.billing_status === 'suspended'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              Update Payment Method
            </button>
          </div>
        </div>
      )}

      {/* Fee Lifecycle Progress */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-3">Fee Lifecycle</p>
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Step 1: Pending */}
          <div className="flex-1 text-center">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-full flex items-center justify-center text-lg sm:text-xl ${
              summary.pending_fees > 0
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 ring-2 ring-amber-300 dark:ring-amber-700'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
            }`}>
              ⏳
            </div>
            <p className="text-xs font-medium text-slate-900 dark:text-white mt-2">Pending</p>
            <p className={`text-sm font-bold ${summary.pending_fees > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
              ${summary.pending_fees.toFixed(2)}
            </p>
          </div>

          {/* Arrow */}
          <div className="text-slate-400 dark:text-slate-500">→</div>

          {/* Step 2: Billed */}
          <div className="flex-1 text-center">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-full flex items-center justify-center text-lg sm:text-xl ${
              summary.billed_fees > 0
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 ring-2 ring-blue-300 dark:ring-blue-700'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
            }`}>
              📄
            </div>
            <p className="text-xs font-medium text-slate-900 dark:text-white mt-2">Billed</p>
            <p className={`text-sm font-bold ${summary.billed_fees > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
              ${summary.billed_fees.toFixed(2)}
            </p>
          </div>

          {/* Arrow */}
          <div className="text-slate-400 dark:text-slate-500">→</div>

          {/* Step 3: Paid */}
          <div className="flex-1 text-center">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-full flex items-center justify-center text-lg sm:text-xl ${
              summary.total_fees_collected > 0
                ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 ring-2 ring-green-300 dark:ring-green-700'
                : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
            }`}>
              ✓
            </div>
            <p className="text-xs font-medium text-slate-900 dark:text-white mt-2">Paid</p>
            <p className={`text-sm font-bold ${summary.total_fees_collected > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`}>
              ${summary.total_fees_collected.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Total Profits */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 sm:p-5 border border-blue-200 dark:border-blue-800">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-1">
            Total Profits
          </p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
            ${summary.total_profits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {summary.total_trades} trades
          </p>
        </div>

        {/* Fees Paid */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 sm:p-5 border border-green-200 dark:border-green-800">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-1">
            Fees Paid
          </p>
          <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
            ${summary.total_fees_collected.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Completed
          </p>
        </div>

        {/* Pending Collection */}
        <div className={`rounded-lg p-4 sm:p-5 border ${
          summary.pending_fees > 0
            ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-600'
        }`}>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-1">
            Pending
          </p>
          <p className={`text-xl sm:text-2xl font-bold ${
            summary.pending_fees > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
          }`}>
            ${summary.pending_fees.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {daysUntilBilling} days to billing
          </p>
        </div>

        {/* Billing Status */}
        <div className={`rounded-lg p-4 sm:p-5 border ${
          billing.billing_status === 'active'
            ? 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-600'
            : billing.billing_status === 'past_due'
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-1">
            Status
          </p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                billing.billing_status === 'active'
                  ? 'bg-green-500'
                  : billing.billing_status === 'past_due'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500 animate-pulse'
              }`}
            />
            <p className={`text-lg font-bold ${
              billing.billing_status === 'active'
                ? 'text-green-600 dark:text-green-400'
                : billing.billing_status === 'past_due'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {billing.billing_status === 'active'
                ? 'Active'
                : billing.billing_status === 'past_due'
                ? 'Overdue'
                : 'Suspended'}
            </p>
          </div>
          {billing.billing_status === 'active' && summary.pending_fees > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Next: {getNextBillingDate()}
            </p>
          )}
        </div>
      </div>

      {/* Next Billing Info */}
      {billing.billing_status === 'active' && summary.pending_fees > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="text-2xl">📅</div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Next Billing: {getNextBillingDate()}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">${summary.pending_fees.toFixed(2)}</span> will be charged automatically
                </p>
              </div>
            </div>
            <button
              onClick={() => (window.location.href = '/api/billing/customer-portal')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap"
            >
              Manage Payment →
            </button>
          </div>
        </div>
      )}

      {/* How it Works - Collapsed by default for returning users */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-2">
          <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          How Performance Fees Work
        </summary>
        <div className="mt-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <div className="flex gap-3">
              <span className="text-lg">1️⃣</span>
              <p><strong>Trade & Profit:</strong> You only pay fees on profitable trades. Losing trades = $0 fee.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-lg">2️⃣</span>
              <p><strong>Fees Accumulate:</strong> 5% of each profit is added to your pending balance.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-lg">3️⃣</span>
              <p><strong>Monthly Billing:</strong> On the 1st of each month, pending fees are charged automatically.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
            Example: $1,000 profit → $50 fee (5%) charged on {getNextBillingDate()}
          </p>
        </div>
      </details>

      {/* Action Links */}
      <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <Link
          href="/help/performance-fees"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          View FAQ →
        </Link>
        <button
          onClick={() => (window.location.href = '/api/billing/customer-portal')}
          className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline"
        >
          Stripe Portal →
        </button>
        <Link
          href="/dashboard/support"
          className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline"
        >
          Get Help →
        </Link>
      </div>
    </section>
  );
}
