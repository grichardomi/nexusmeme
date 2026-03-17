'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

/**
 * Admin Fees Management Page
 * View, adjust, waive, and refund performance fees
 */

interface FeeRecord {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  trade_id: string;
  pair: string;
  profit_amount: number;
  fee_amount: number;
  fee_rate_applied?: number | null;
  original_fee_amount?: number;
  adjustment_reason?: string;
  status: 'pending_billing' | 'billed' | 'paid' | 'refunded' | 'waived' | 'disputed';
  created_at: string;
  billed_at?: string;
  paid_at?: string;
  payment_reference?: string;
}

interface PaginationData {
  fees: FeeRecord[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

interface UserOverride {
  user_id: string;
  email: string;
  fee_rate: number;
  reason: string | null;
  created_at: string;
}

export default function AdminFeesPage() {
  const { status } = useSession();
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalFees, setTotalFees] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedFee, setSelectedFee] = useState<FeeRecord | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'adjust' | 'waive' | 'refund' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fee rate management state
  const [globalFeeRate, setGlobalFeeRate] = useState<number | null>(null);
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [editingGlobalRate, setEditingGlobalRate] = useState(false);
  const [globalRateInput, setGlobalRateInput] = useState('');
  const [overrideEmail, setOverrideEmail] = useState('');
  const [overrideRate, setOverrideRate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [rateSettingsError, setRateSettingsError] = useState<string | null>(null);
  const [rateSaving, setRateSaving] = useState(false);

  // Trial duration state
  const [trialDurationDays, setTrialDurationDays] = useState<number | null>(null);
  const [editingTrialDays, setEditingTrialDays] = useState(false);
  const [trialDaysInput, setTrialDaysInput] = useState('');
  const [trialDaysSaving, setTrialDaysSaving] = useState(false);

  // Exchange fee rates state
  interface ExchangeFeeRates { taker_fee: number; maker_fee: number; min_profit_weak: number; min_profit_moderate: number; min_profit_strong: number; }
  const [exchangeFees, setExchangeFees] = useState<{ binance: ExchangeFeeRates; kraken: ExchangeFeeRates } | null>(null);
  const [editingExchangeFee, setEditingExchangeFee] = useState<string | null>(null);
  const [exchangeFeeInput, setExchangeFeeInput] = useState('');
  const [exchangeFeeSaving, setExchangeFeeSaving] = useState(false);

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  const fetchBillingSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/billing-settings');
      if (!res.ok) return;
      const data = await res.json();
      setGlobalFeeRate(parseFloat(String(data.globalFeeRate)));
      setTrialDurationDays(data.trialDurationDays ?? null);
      setUserOverrides(data.userOverrides ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  const fetchExchangeFees = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/exchange-fees');
      if (!res.ok) return;
      setExchangeFees(await res.json());
    } catch {
      // non-fatal
    }
  }, []);

  const saveExchangeFee = async (key: string) => {
    const val = parseFloat(exchangeFeeInput);
    if (isNaN(val) || val < 0 || val > 1) {
      setRateSettingsError('Enter a decimal between 0 and 1 (e.g. 0.001 for 0.1%)');
      return;
    }
    setExchangeFeeSaving(true);
    setRateSettingsError(null);
    try {
      const res = await fetch('/api/admin/exchange-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setEditingExchangeFee(null);
      await fetchExchangeFees();
    } catch (err) {
      setRateSettingsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setExchangeFeeSaving(false);
    }
  };

  useEffect(() => {
    fetchFees();
  }, [page, filterStatus, searchQuery]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchBillingSettings();
      fetchExchangeFees();
    }
  }, [status, fetchBillingSettings, fetchExchangeFees]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPage(1); // Reset to first page on new search
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const fetchFees = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const statusParam = filterStatus !== 'all' ? `&status=${filterStatus}` : '';
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`/api/admin/fees?page=${page}&pageSize=${pageSize}${statusParam}${searchParam}`);

      if (!response.ok) throw new Error('Failed to fetch fees');

      const data: PaginationData = await response.json();
      setFees(data.fees);
      setTotalFees(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fees');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedFee || !actionType || !actionReason) {
      setError('Please fill in all fields');
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        feeId: selectedFee.id,
        action: actionType,
        reason: actionReason,
        newAmount: actionType === 'adjust' ? parseFloat(actionAmount) : undefined,
      };

      const response = await fetch('/api/admin/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to process action');
      }

      setActionModalOpen(false);
      setSelectedFee(null);
      setActionType(null);
      setActionReason('');
      setActionAmount('');
      fetchFees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process action');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'billed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'pending_billing':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'refunded':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'waived':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const saveGlobalRate = async () => {
    const rate = parseFloat(globalRateInput);
    if (isNaN(rate) || rate <= 0 || rate > 1) {
      setRateSettingsError('Enter a decimal between 0.01 and 1.00 (e.g. 0.05 for 5%)');
      return;
    }
    setRateSaving(true);
    setRateSettingsError(null);
    try {
      const res = await fetch('/api/admin/billing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'global', feeRate: rate }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setGlobalFeeRate(rate);
      setEditingGlobalRate(false);
    } catch (err) {
      setRateSettingsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setRateSaving(false);
    }
  };

  const saveTrialDays = async () => {
    const days = parseInt(trialDaysInput, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      setRateSettingsError('Trial days must be between 1 and 365');
      return;
    }
    setTrialDaysSaving(true);
    setRateSettingsError(null);
    try {
      const res = await fetch('/api/admin/billing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'trial_days', trialDays: days }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setTrialDurationDays(days);
      setEditingTrialDays(false);
    } catch (err) {
      setRateSettingsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setTrialDaysSaving(false);
    }
  };

  const saveUserOverride = async () => {
    const rate = parseFloat(overrideRate);
    if (!overrideEmail || isNaN(rate) || rate <= 0 || rate > 1) {
      setRateSettingsError('Enter a valid email and decimal rate (e.g. 0.03 for 3%)');
      return;
    }
    setRateSaving(true);
    setRateSettingsError(null);
    try {
      const res = await fetch('/api/admin/billing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', userEmail: overrideEmail, feeRate: rate, reason: overrideReason }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setOverrideEmail('');
      setOverrideRate('');
      setOverrideReason('');
      await fetchBillingSettings();
    } catch (err) {
      setRateSettingsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setRateSaving(false);
    }
  };

  const removeUserOverride = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/billing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', userId, feeRate: null }),
      });
      if (res.ok) await fetchBillingSettings();
    } catch {
      // non-fatal
    }
  };

  const pages = Math.ceil(totalFees / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin/dashboard" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Admin Dashboard
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Performance Fees Management</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">View, adjust, waive, and refund performance fees</p>
      </div>

      {/* Fee Rate Management */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fee Rate Settings</h2>

        {rateSettingsError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
            {rateSettingsError}
          </div>
        )}

        {/* Global Rate */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Global Performance Fee Rate</p>
            {editingGlobalRate ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={globalRateInput}
                  onChange={(e) => setGlobalRateInput(e.target.value)}
                  placeholder="e.g. 0.05"
                  className="w-32 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <button
                  onClick={saveGlobalRate}
                  disabled={rateSaving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {rateSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingGlobalRate(false)}
                  className="px-4 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {globalFeeRate !== null ? `${(globalFeeRate * 100).toFixed(2)}%` : '…'}
                </span>
                <button
                  onClick={() => { setGlobalRateInput(globalFeeRate?.toString() ?? ''); setEditingGlobalRate(true); setRateSettingsError(null); }}
                  className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Trial Duration */}
        <div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Free Trial Duration</p>
            {editingTrialDays ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="365"
                  value={trialDaysInput}
                  onChange={(e) => setTrialDaysInput(e.target.value)}
                  placeholder="e.g. 14"
                  className="w-24 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                <span className="text-sm text-slate-500">days</span>
                <button
                  onClick={saveTrialDays}
                  disabled={trialDaysSaving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {trialDaysSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingTrialDays(false)}
                  className="px-4 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {trialDurationDays !== null ? `${trialDurationDays} days` : '…'}
                </span>
                <button
                  onClick={() => { setTrialDaysInput(trialDurationDays?.toString() ?? ''); setEditingTrialDays(true); setRateSettingsError(null); }}
                  className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Edit
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Applied to all new user signups. Existing trials are not affected.
            </p>
          </div>
        </div>

        {/* Exchange Fee Rates — moved to own card below */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 hidden">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Exchange Trading Fee Rates</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Update when negotiated fees change. Used to set minimum profit targets per exchange. No deploy needed.
          </p>
          {exchangeFees && (['binance', 'kraken'] as const).map(exchange => {
            const fees = exchangeFees[exchange];
            const rows: { key: string; label: string; value: number; format: (v: number) => string }[] = [
              { key: `${exchange}_taker_fee`,           label: 'Taker Fee',          value: fees.taker_fee,           format: v => `${(v*100).toFixed(3)}%` },
              { key: `${exchange}_maker_fee`,           label: 'Maker Fee',          value: fees.maker_fee,           format: v => `${(v*100).toFixed(3)}%` },
              { key: `${exchange}_min_profit_weak`,     label: 'Min Profit (Weak)',   value: fees.min_profit_weak,     format: v => `${(v*100).toFixed(1)}%` },
              { key: `${exchange}_min_profit_moderate`, label: 'Min Profit (Moderate)',value: fees.min_profit_moderate, format: v => `${(v*100).toFixed(1)}%` },
              { key: `${exchange}_min_profit_strong`,   label: 'Min Profit (Strong)', value: fees.min_profit_strong,   format: v => `${(v*100).toFixed(1)}%` },
            ];
            return (
              <div key={exchange} className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  {exchange === 'binance' ? 'Binance (Global + US)' : 'Kraken'}
                  {exchange === 'binance' && <span className="ml-2 text-slate-400 text-xs font-normal normal-case tracking-normal">binance.com &amp; binance.us · BNB discount may lower actual fee</span>}
                  {exchange === 'kraken' && <span className="ml-2 text-blue-500">US accessible · USD/USDT/USDC</span>}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {rows.map(row => (
                    <div key={row.key} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{row.label}</p>
                      {editingExchangeFee === row.key ? (
                        <div className="space-y-1">
                          <input
                            type="number" step="0.0001" min="0" max="1"
                            value={exchangeFeeInput}
                            onChange={e => setExchangeFeeInput(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button onClick={() => saveExchangeFee(row.key)} disabled={exchangeFeeSaving}
                              className="flex-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:opacity-50">
                              {exchangeFeeSaving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingExchangeFee(null)}
                              className="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded">
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{row.format(row.value)}</span>
                          <button onClick={() => { setExchangeFeeInput(String(row.value)); setEditingExchangeFee(row.key); setRateSettingsError(null); }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1">Edit</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-User Overrides */}
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Per-User Overrides</p>
          {userOverrides.length > 0 && (
            <div className="mb-3 space-y-2">
              {userOverrides.map((ov) => (
                <div key={ov.user_id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-slate-700 dark:text-slate-300">{ov.email}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{(ov.fee_rate * 100).toFixed(2)}%</span>
                  {ov.reason && <span className="text-slate-500 dark:text-slate-400 text-xs">{ov.reason}</span>}
                  <button
                    onClick={() => removeUserOverride(ov.user_id)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={overrideEmail}
              onChange={(e) => setOverrideEmail(e.target.value)}
              placeholder="user@example.com"
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm w-52"
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1"
              value={overrideRate}
              onChange={(e) => setOverrideRate(e.target.value)}
              placeholder="rate e.g. 0.03"
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm w-36"
            />
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="reason (optional)"
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm w-48"
            />
            <button
              onClick={saveUserOverride}
              disabled={rateSaving}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              Add Override
            </button>
          </div>
        </div>
      </div>

      {/* Exchange Trading Fee Rates */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Exchange Trading Fee Rates</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Global rates charged by each exchange per trade. Update when negotiated fees change — affects bot profit targets immediately. No deploy needed.
        </p>
        {rateSettingsError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm mb-4">
            {rateSettingsError}
          </div>
        )}
        {exchangeFees && (['binance', 'kraken'] as const).map(exchange => {
          const fees = exchangeFees[exchange];
          const rows: { key: string; label: string; value: number; format: (v: number) => string }[] = [
            { key: `${exchange}_taker_fee`,            label: 'Taker Fee',           value: fees.taker_fee,            format: v => `${(v*100).toFixed(3)}%` },
            { key: `${exchange}_maker_fee`,            label: 'Maker Fee',           value: fees.maker_fee,            format: v => `${(v*100).toFixed(3)}%` },
            { key: `${exchange}_min_profit_weak`,      label: 'Min Profit (Weak)',   value: fees.min_profit_weak,      format: v => `${(v*100).toFixed(1)}%` },
            { key: `${exchange}_min_profit_moderate`,  label: 'Min Profit (Moderate)', value: fees.min_profit_moderate, format: v => `${(v*100).toFixed(1)}%` },
            { key: `${exchange}_min_profit_strong`,    label: 'Min Profit (Strong)', value: fees.min_profit_strong,    format: v => `${(v*100).toFixed(1)}%` },
          ];
          return (
            <div key={exchange} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {exchange === 'binance' ? 'Binance International' : 'Kraken'}
                </p>
                {exchange === 'binance'
                  ? <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Global · 180+ countries</span>
                  : <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Global + US</span>
                }
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {rows.map(row => (
                  <div key={row.key} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{row.label}</p>
                    {editingExchangeFee === row.key ? (
                      <div className="space-y-1">
                        <input
                          type="number" step="0.0001" min="0" max="1"
                          value={exchangeFeeInput}
                          onChange={e => setExchangeFeeInput(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button onClick={() => saveExchangeFee(row.key)} disabled={exchangeFeeSaving}
                            className="flex-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:opacity-50">
                            {exchangeFeeSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingExchangeFee(null)}
                            className="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded">
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{row.format(row.value)}</span>
                        <button onClick={() => { setExchangeFeeInput(String(row.value)); setEditingExchangeFee(row.key); setRateSettingsError(null); }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1">Edit</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Fees</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            ${fees.reduce((sum, f) => sum + f.fee_amount, 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Pending Billing</p>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
            {fees.filter((f) => f.status === 'pending_billing').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Records</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalFees}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Waived Fees</p>
          <p className="text-3xl font-bold text-slate-500 dark:text-slate-400">
            ${fees.filter((f) => f.status === 'waived').reduce((sum, f) => sum + f.fee_amount, 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-6">
        {/* Search Box */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Search Users</h2>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by email or name..."
                className="w-full px-4 py-2.5 pl-10 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg className="w-5 h-5 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={handleSearch}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              Search
            </button>
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition"
              >
                Clear
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Showing results for: <span className="font-semibold">"{searchQuery}"</span>
            </p>
          )}
        </div>

        {/* Status Filter */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Filter by Status</h2>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending_billing', 'billed', 'paid', 'waived', 'refunded'].map((status) => (
              <button
                key={status}
                onClick={() => {
                  setFilterStatus(status);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Fees Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-600 dark:text-slate-400">Loading fees...</div>
          </div>
        ) : fees.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 dark:text-slate-400">No fees found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-slate-900 dark:text-white">Date</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-900 dark:text-white">User</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-900 dark:text-white">Trade ID</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-900 dark:text-white">Pair</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-900 dark:text-white">Profit</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-900 dark:text-white">Fee</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-900 dark:text-white">Status</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-900 dark:text-white">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {fees.map((fee) => (
                    <tr key={fee.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                        <div className="text-sm">{new Date(fee.created_at).toLocaleDateString()}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(fee.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-900 dark:text-white">
                        <div className="text-sm font-medium">{fee.user_email}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">{fee.user_name}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono text-xs">
                        {fee.trade_id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{fee.pair}</td>
                      <td className="px-6 py-4 text-right text-green-600 dark:text-green-400 font-semibold">
                        ${fee.profit_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 dark:text-white font-semibold">
                        ${fee.fee_amount.toFixed(2)}
                        {fee.fee_rate_applied != null && (
                          <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            {(parseFloat(String(fee.fee_rate_applied)) * 100).toFixed(2)}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(fee.status)}`}>
                          {getStatusLabel(fee.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedFee(fee);
                            setActionModalOpen(true);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Page {page} of {pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Modal */}
      {actionModalOpen && selectedFee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-md w-full border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Manage Fee</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Fee: <strong>${selectedFee.fee_amount.toFixed(2)}</strong> on trade {selectedFee.trade_id.slice(0, 8)}...
            </p>

            {/* Action Type Selection */}
            <div className="space-y-3 mb-6">
              {['adjust', 'waive', 'refund'].map((type) => (
                <button
                  key={type}
                  onClick={() => setActionType(type as any)}
                  className={`w-full px-4 py-3 rounded-lg font-medium transition text-left ${
                    actionType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)} Fee
                </button>
              ))}
            </div>

            {/* Adjust Amount (only if adjust selected) */}
            {actionType === 'adjust' && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  New Fee Amount
                </label>
                <input
                  type="number"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="Enter new amount"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Reason */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Reason</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Why are you adjusting this fee?"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setActionModalOpen(false);
                  setSelectedFee(null);
                  setActionType(null);
                  setActionReason('');
                  setActionAmount('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={isProcessing || !actionType || !actionReason}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {isProcessing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
