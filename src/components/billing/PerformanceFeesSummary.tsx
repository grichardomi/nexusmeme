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
 * Shows overview of profits, fees collected, and billing status
 * Fetches from `/api/fees/performance` endpoint
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

  if (isLoading) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600 dark:text-slate-400">Loading performance data...</div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Performance Fees</h2>
        <div className="text-center py-12 text-slate-600 dark:text-slate-400">
          No fee data available. Create a bot and start trading to see your performance fees.
        </div>
      </section>
    );
  }

  const { summary, billing } = data;

  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Performance Fees</h2>
        <Link
          href="/help/performance-fees"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          Learn more →
        </Link>
      </div>

      {/* Billing Status Warning */}
      {billing.billing_status === 'past_due' && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            Payment Overdue
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
            Your payment failed. Please update your payment method to continue trading. Stripe is retrying automatically.
          </p>
        </div>
      )}

      {billing.billing_status === 'suspended' && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200 flex items-center gap-2">
            <span className="text-lg">🚫</span>
            Billing Suspended
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            Your bot will pause in 24 hours. Update your payment method immediately to resume trading.
          </p>
        </div>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Total Profits */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-2">
            Total Profits
          </p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
            ${summary.total_profits.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            From {summary.total_trades} trades
          </p>
        </div>

        {/* Fees Collected */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-2">
            Fees Collected
          </p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
            ${summary.total_fees_collected.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            5% of profits (paid)
          </p>
        </div>

        {/* Pending Fees */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-amber-200 dark:border-amber-800">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-2">
            Pending Fees
          </p>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-1">
            ${summary.pending_fees.toFixed(2)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Due on 1st of month
          </p>
        </div>

        {/* Billing Status */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/20 dark:to-slate-800/20 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase mb-2">
            Billing Status
          </p>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                billing.billing_status === 'active'
                  ? 'bg-green-500'
                  : billing.billing_status === 'past_due'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
            />
            <p className="text-lg font-bold text-slate-900 dark:text-white capitalize">
              {billing.billing_status === 'active'
                ? 'Active'
                : billing.billing_status === 'past_due'
                ? 'Past Due'
                : 'Suspended'}
            </p>
          </div>
          {billing.failed_charge_attempts > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              {billing.failed_charge_attempts} failed attempt{billing.failed_charge_attempts !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Fee Explanation */}
      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <div className="text-2xl flex-shrink-0">💡</div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white mb-2">How Performance Fees Work</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              You pay <strong>5% of your profits</strong> when your trading bot generates profitable trades. Losing trades are free.
              All pending fees are automatically charged on the <strong>1st of each month</strong>.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
              Example: $500 profit → $25 fee (5%) charged on next billing date
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-6">
        <Link
          href="/help/performance-fees"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          View Full Guide →
        </Link>
        {billing.billing_status !== 'active' && (
          <button
            onClick={() => (window.location.href = '/api/billing/customer-portal')}
            className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            Update Payment Method →
          </button>
        )}
      </div>
    </section>
  );
}
