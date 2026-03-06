'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface USDCInvoice {
  id: string;
  reference: string;
  amount: number;
  walletAddress: string;
  expiresAt: string;
  status: string;
}

interface USDCPayStatus {
  enabled: boolean;
  walletAddress: string | null;
  network: string;
  pendingFees: { count: number; totalAmount: number };
  activeInvoice: USDCInvoice | null;
  summary: {
    total_profits: number;
    total_fees_collected: number;
    pending_fees: number;
  };
}

interface USDCPayButtonProps {
  tradingMode?: 'paper' | 'live';
}

export function USDCPayButton({ tradingMode }: USDCPayButtonProps) {
  const [status, setStatus] = useState<USDCPayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [copied, setCopied] = useState<'address' | 'reference' | 'amount' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setChecking(true);
      const res = await fetch('/api/billing/usdc/invoice');
      const data = await res.json();
      setStatus(data.enabled ? data : null);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleCreateInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/billing/usdc/invoice', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create invoice'); return; }
      await fetchStatus();
    } catch {
      setError('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'address' | 'reference' | 'amount') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (tradingMode === 'paper') return null;
  if (checking) return <div className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg h-24" />;
  if (!status) return null;

  const { pendingFees, activeInvoice } = status;
  const hasPending = pendingFees.count > 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Pay with USDC</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Direct on Base · No processor · Instant confirmation
          </p>
        </div>
        <span className="ml-auto text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full font-medium">
          Always online
        </span>
      </div>

      {/* Pending fees summary */}
      {hasPending && !activeInvoice && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex justify-between items-center">
            <span className="text-amber-800 dark:text-amber-200 text-sm">
              {pendingFees.count} pending fee{pendingFees.count > 1 ? 's' : ''}
            </span>
            <span className="font-bold text-amber-900 dark:text-amber-100">
              ${Number(pendingFees.totalAmount).toFixed(2)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Active invoice — payment instructions */}
      {activeInvoice && (
        <div className="mb-4 space-y-3">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-3">
              Send exactly this amount of USDC on Base:
            </p>

            {/* Amount */}
            <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Amount (USDC)</p>
                <p className="font-bold text-lg text-slate-900 dark:text-white">
                  {Number(activeInvoice.amount).toFixed(6)}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(Number(activeInvoice.amount).toFixed(6), 'amount')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copied === 'amount' ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Wallet address */}
            <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">To Address (Base)</p>
                <p className="font-mono text-sm text-slate-900 dark:text-white truncate">
                  {activeInvoice.walletAddress}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(activeInvoice.walletAddress, 'address')}
                className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              >
                {copied === 'address' ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Payment reference */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-700 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Payment Reference</p>
                <p className="font-mono font-bold text-slate-900 dark:text-white">
                  {activeInvoice.reference}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(activeInvoice.reference, 'reference')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copied === 'reference' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* QR Code for wallet scan */}
          <div className="flex justify-center mt-3">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <QRCodeSVG
                value={activeInvoice.walletAddress}
                size={140}
                level="M"
              />
            </div>
          </div>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-1">
            Scan with your wallet to fill address
          </p>

          {/* Instructions */}
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2">
            <p>① Make sure you&apos;re on the <strong>Base</strong> network in your wallet</p>
            <p>② Send USDC (not ETH) to the address above</p>
            <p>③ Payment confirms automatically within ~10 seconds</p>
            <p className="text-amber-600 dark:text-amber-400">
              Expires: {new Date(activeInvoice.expiresAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Create invoice button */}
      {hasPending && !activeInvoice && (
        <button
          onClick={handleCreateInvoice}
          disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating Invoice...
            </>
          ) : (
            `Generate USDC Invoice · $${Number(pendingFees.totalAmount).toFixed(2)}`
          )}
        </button>
      )}

      {/* No pending fees */}
      {!hasPending && !activeInvoice && (
        <div className="text-center py-4 text-slate-500 dark:text-slate-400">
          <p className="font-medium">No pending fees</p>
          <p className="text-sm mt-1">Fees are generated from profitable trades and billed monthly</p>
        </div>
      )}

      {/* Fee summary footer */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Total Profits</p>
          <p className="font-semibold text-green-600 dark:text-green-400">
            ${Number(status.summary?.total_profits || 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Fees Paid</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            ${Number(status.summary?.total_fees_collected || 0).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
