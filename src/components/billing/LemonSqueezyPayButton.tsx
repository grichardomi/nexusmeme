'use client';

import React, { useState, useEffect } from 'react';

interface LemonSqueezyPayButtonProps {
  onPaymentCreated?: (checkoutUrl: string) => void;
  tradingMode?: 'paper' | 'live';
  onGoLive?: () => void;
}

interface PendingOrder {
  id: number;
  checkoutId: string | null;
  amountUsd: number;
  checkoutUrl: string | null;
  createdAt: string;
}

interface CheckoutStatus {
  enabled: boolean;
  pendingFees: {
    count: number;
    totalAmount: number;
  };
  pendingOrders: PendingOrder[];
  summary: {
    totalProfits: number;
    totalFeesCollected: number;
    pendingFees: number;
    billedFees: number;
  };
}

export function LemonSqueezyPayButton({ onPaymentCreated, tradingMode, onGoLive }: LemonSqueezyPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paper trading — no real fees
  if (tradingMode === 'paper') {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <svg className="w-6 h-6 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Paper Trading Mode</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">No fees for simulated trades</p>
          </div>
        </div>
        <div className="text-center py-4 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
          <p className="font-medium">No payment required during trial</p>
          <p className="text-sm mt-2 mb-3">After switching to live, fees are billed monthly (card or PayPal).</p>
          <button
            onClick={onGoLive}
            className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
          >
            Switch to Live Trading →
          </button>
        </div>
      </div>
    );
  }

  // Check for pending fees on mount
  useEffect(() => {
    checkPendingFees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkPendingFees = async () => {
    try {
      setChecking(true);
      const res = await fetch('/api/billing/lemonsqueezy/checkout');
      const data = await res.json();

      if (data.enabled === false) {
        setStatus(null);
        return;
      }

      setStatus(data);
    } catch (err) {
      console.error('Failed to check pending fees:', err);
    } finally {
      setChecking(false);
    }
  };

  const handlePay = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/billing/lemonsqueezy/checkout', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create payment');
        return;
      }

      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank');
        onPaymentCreated?.(data.checkoutUrl);
      }

      await checkPendingFees();
    } catch (err) {
      setError('Failed to create payment');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <div className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg h-24" />;
  }

  if (!status) {
    return null; // Lemon Squeezy not enabled
  }

  const hasPendingFees = status.pendingFees.count > 0;
  const hasPendingOrder = status.pendingOrders.length > 0;
  const pendingOrder = status.pendingOrders[0];

  return (
    <div id="ls-pay-section" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Pay Performance Fees</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Card or PayPal via Lemon Squeezy</p>
        </div>
      </div>

      {/* Pending Fees Summary */}
      {hasPendingFees && !hasPendingOrder && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex justify-between items-center">
            <span className="text-amber-800 dark:text-amber-200">
              {status.pendingFees.count} pending fee{status.pendingFees.count > 1 ? 's' : ''}
            </span>
            <span className="font-bold text-amber-900 dark:text-amber-100">
              ${Number(status.pendingFees.totalAmount).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Existing Pending Order */}
      {hasPendingOrder && pendingOrder && pendingOrder.checkoutUrl && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex justify-between items-center mb-2">
            <span className="text-blue-800 dark:text-blue-200">Pending Payment</span>
            <span className="font-bold text-blue-900 dark:text-blue-100">
              ${pendingOrder.amountUsd.toFixed(2)}
            </span>
          </div>
          <a
            href={pendingOrder.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Complete Payment
          </a>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Pay Button */}
      {hasPendingFees && !hasPendingOrder && (
        <button
          onClick={handlePay}
          disabled={loading || !hasPendingFees}
          className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-slate-400 disabled:to-slate-500 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating Payment...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Pay ${Number(status.pendingFees.totalAmount).toFixed(2)}
            </>
          )}
        </button>
      )}

      {/* No Pending Fees */}
      {!hasPendingFees && !hasPendingOrder && (
        <div className="text-center py-4 text-slate-500 dark:text-slate-400">
          <p>No pending fees</p>
          <p className="text-sm mt-1">Fees are generated from profitable trades</p>
        </div>
      )}

      {/* Fee Summary */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500 dark:text-slate-400">Total Profits</p>
            <p className="font-semibold text-green-600 dark:text-green-400">
              ${Number(status.summary.totalProfits || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">Fees Paid</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              ${Number(status.summary.totalFeesCollected || 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
