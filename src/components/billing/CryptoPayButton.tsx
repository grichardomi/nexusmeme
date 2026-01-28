'use client';

import React, { useState, useEffect } from 'react';

interface CryptoPayButtonProps {
  onPaymentCreated?: (chargeUrl: string) => void;
}

interface PendingCharge {
  id: string;
  code: string;
  amount: number;
  status: string;
  hostedUrl: string;
  expiresAt: string;
}

interface ChargeStatus {
  enabled: boolean;
  pendingFees: {
    count: number;
    totalAmount: number;
  };
  pendingCharges: PendingCharge[];
  summary: {
    totalProfits: number;
    totalFeesCollected: number;
    pendingFees: number;
    billedFees: number;
  };
}

export function CryptoPayButton({ onPaymentCreated }: CryptoPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<ChargeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for pending fees on mount
  useEffect(() => {
    checkPendingFees();
  }, []);

  const checkPendingFees = async () => {
    try {
      setChecking(true);
      const res = await fetch('/api/billing/coinbase/charge');
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

  const handlePayWithCrypto = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/billing/coinbase/charge', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create payment');
        return;
      }

      // Open payment URL in new tab
      if (data.charge?.hostedUrl) {
        window.open(data.charge.hostedUrl, '_blank');
        onPaymentCreated?.(data.charge.hostedUrl);
      }

      // Refresh status
      await checkPendingFees();
    } catch (err) {
      setError('Failed to create crypto payment');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // If Coinbase Commerce not enabled or still checking
  if (checking) {
    return (
      <div className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg h-24" />
    );
  }

  if (!status) {
    return null; // Coinbase Commerce not enabled
  }

  const hasPendingFees = status.pendingFees.count > 0;
  const hasPendingCharge = status.pendingCharges.length > 0;
  const pendingCharge = status.pendingCharges[0];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
          <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Pay with Crypto</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            BTC, ETH, USDC, and more
          </p>
        </div>
      </div>

      {/* Pending Fees Summary */}
      {hasPendingFees && !hasPendingCharge && (
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

      {/* Existing Pending Charge */}
      {hasPendingCharge && pendingCharge && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex justify-between items-center mb-2">
            <span className="text-blue-800 dark:text-blue-200">
              Pending Payment #{pendingCharge.code}
            </span>
            <span className="font-bold text-blue-900 dark:text-blue-100">
              ${Number(pendingCharge.amount).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
            Expires: {new Date(pendingCharge.expiresAt).toLocaleString()}
          </p>
          <a
            href={pendingCharge.hostedUrl}
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
      {hasPendingFees && !hasPendingCharge && (
        <button
          onClick={handlePayWithCrypto}
          disabled={loading || !hasPendingFees}
          className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-slate-400 disabled:to-slate-500 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
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
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
              </svg>
              Pay ${Number(status.pendingFees.totalAmount).toFixed(2)} with Crypto
            </>
          )}
        </button>
      )}

      {/* No Pending Fees */}
      {!hasPendingFees && !hasPendingCharge && (
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
