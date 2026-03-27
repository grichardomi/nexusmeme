'use client';

import { useState, useEffect, useRef } from 'react';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface WalletBadgeProps {
  /** Wallet address fetched by parent (DashboardLayout). Keeps badge in sync. */
  walletAddress: string | null;
  onSaved: (addr: string | null) => void;
}

export function WalletBadge({ walletAddress, onSaved }: WalletBadgeProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill draft when opening
  function openModal() {
    setDraft(walletAddress ?? '');
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError(null);
  }

  // Focus input after open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && !ETH_ADDRESS_RE.test(trimmed)) {
      setError('Must be a valid 0x Ethereum / Base address (42 characters)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/user/wallet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to save');
        return;
      }
      const d = await res.json();
      onSaved(d.walletAddress);
      closeModal();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isSet = !!walletAddress;

  return (
    <>
      {/* ── Badge pill ────────────────────────────────────────────── */}
      <button
        onClick={openModal}
        title={isSet ? `Wallet: ${walletAddress}` : 'Add payment wallet'}
        className={`flex items-center gap-1 rounded-full border text-xs font-semibold transition flex-shrink-0 ${
          isSet
            ? 'px-2 py-1 sm:px-3 sm:py-1.5 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50'
            : 'px-2 py-1 sm:px-3 sm:py-1.5 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 animate-pulse'
        }`}
      >
        {/* Wallet icon */}
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V9" />
        </svg>
        {/* Mobile: icon + dot only */}
        <span className={`inline-block w-1.5 h-1.5 rounded-full sm:hidden ${isSet ? 'bg-green-500' : 'bg-amber-500'}`} />
        {/* sm+: truncated address or prompt */}
        <span className="hidden sm:inline">
          {isSet ? truncate(walletAddress) : 'Add wallet'}
        </span>
      </button>

      {/* ── Modal ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          {/* Sheet — bottom-anchored on mobile, centered on sm+ */}
          <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-xl p-6 z-10"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {/* Handle — mobile only */}
            <div className="sm:hidden flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {isSet ? 'Change wallet' : 'Add payment wallet'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">×</button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Your USDC wallet address on Base chain — used to identify your monthly payments.
            </p>

            {/* Current address display + copy */}
            {isSet && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">{walletAddress}</span>
                <button onClick={copy} className="shrink-0 p-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
                  {copied
                    ? <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  }
                </button>
              </div>
            )}

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') closeModal(); }}
              placeholder="0x… (Base / Ethereum address)"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-2"
            />
            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

            <div className="flex gap-2 mt-3">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition"
              >
                {saving ? 'Saving…' : 'Save wallet'}
              </button>
              <button
                onClick={closeModal}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
