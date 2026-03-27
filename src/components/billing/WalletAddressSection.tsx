'use client';

import { useState, useEffect } from 'react';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletAddressSection() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/user/wallet')
      .then(r => r.json())
      .then(d => {
        setWallet(d.walletAddress ?? null);
        if (!d.walletAddress) setEditing(true); // open editor immediately if no address set
      })
      .catch(() => {});
  }, []);

  function startEdit() {
    setDraft(wallet ?? '');
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft('');
    setError(null);
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && !ETH_ADDRESS_RE.test(trimmed)) {
      setError('Must be a valid 0x Ethereum/Base address (42 characters)');
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
      setWallet(d.walletAddress);
      setEditing(false);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💳</span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payment Wallet</h2>
          {wallet ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              Set
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              Not set
            </span>
          )}
        </div>
        {wallet && !editing && (
          <button
            onClick={startEdit}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Change
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Your USDC wallet address on Base chain. Used to identify your payments.
      </p>

      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(null); }}
            placeholder="0x… (Base / Ethereum address)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {wallet && (
              <button
                onClick={cancel}
                className="px-4 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : wallet ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 flex-1 truncate">
            {wallet}
          </span>
          <span className="hidden sm:inline font-mono text-xs text-slate-400">
            {truncate(wallet)}
          </span>
          <button
            onClick={copy}
            title="Copy address"
            className="shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
