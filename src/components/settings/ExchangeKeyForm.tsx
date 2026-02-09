'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';

const addKeySchema = z.object({
  exchange: z.enum(['kraken', 'binance']),
  publicKey: z.string().min(1, 'Public key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
});

type AddKeyInput = z.infer<typeof addKeySchema>;

interface SavedKey {
  id: string;
  exchange: string;
  validated_at: string | null;
  created_at: string;
}

interface Bot {
  id: string;
  name: string;
  status: string;
  open_trades: number;
}

interface ExchangeKeyFormProps {
  exchange: 'kraken' | 'binance';
  onSuccess?: () => void;
}

export function ExchangeKeyForm({ exchange, onSuccess }: ExchangeKeyFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedKey, setSavedKey] = useState<SavedKey | null>(null);
  const [botsUsingExchange, setBotsUsingExchange] = useState<Bot[]>([]);
  const [formData, setFormData] = useState({
    publicKey: '',
    secretKey: '',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch saved keys and bots using this exchange on mount
  const fetchData = async () => {
    try {
      setIsFetching(true);

      // Fetch saved keys
      const keysResponse = await fetch('/api/exchange-keys');
      if (keysResponse.ok) {
        const keysData = await keysResponse.json();
        const keys = keysData.keys || [];
        const found = keys.find((k: SavedKey) => k.exchange === exchange);
        setSavedKey(found || null);
      }

      // Fetch bots using this exchange
      const botsResponse = await fetch(`/api/exchange-keys/${exchange}`);
      if (botsResponse.ok) {
        const botsData = await botsResponse.json();
        const bots: Bot[] = botsData.bots || [];
        console.log(`[ExchangeKeyForm] Fetched bots for ${exchange}:`, bots);
        setBotsUsingExchange(bots);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [exchange]);

  // Check if any bot has open trades
  const totalOpenTrades = botsUsingExchange.reduce((sum, bot) => sum + (bot.open_trades || 0), 0);
  const hasOpenTrades = totalOpenTrades > 0;
  const canRemoveKeys = botsUsingExchange.length === 0 && !hasOpenTrades;

  // Debug logging
  useEffect(() => {
    console.log(`[ExchangeKeyForm ${exchange}] State:`, {
      botsCount: botsUsingExchange.length,
      bots: botsUsingExchange,
      totalOpenTrades,
      hasOpenTrades,
      canRemoveKeys,
    });
  }, [botsUsingExchange, totalOpenTrades, hasOpenTrades, canRemoveKeys, exchange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      const payload: AddKeyInput = {
        exchange,
        publicKey: formData.publicKey.trim(),
        secretKey: formData.secretKey.trim(),
      };

      const validation = addKeySchema.safeParse(payload);
      if (!validation.success) {
        setError('Please fill in all fields');
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/exchange-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to save API keys');
        setIsLoading(false);
        return;
      }

      // Success! Clear form immediately
      setFormData({ publicKey: '', secretKey: '' });
      setSuccess(true);
      setIsLoading(false);

      // Refresh saved keys immediately
      try {
        const keysResponse = await fetch('/api/exchange-keys');
        if (keysResponse.ok) {
          const keysData = await keysResponse.json();
          const keys = keysData.keys || [];
          const found = keys.find((k: SavedKey) => k.exchange === exchange);
          setSavedKey(found || null);
        }
      } catch (err) {
        console.error('Failed to refresh keys:', err);
      }

      // Close form and reset success message after short delay
      setTimeout(() => {
        setIsOpen(false);
        setTimeout(() => {
          setSuccess(false);
        }, 500);
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setError(null);
    setFormData({ publicKey: '', secretKey: '' });
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/exchange-keys/${exchange}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to delete API keys');
        setIsDeleting(false);
        return;
      }

      setSavedKey(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      onSuccess?.();
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const exchangeNames: Record<string, { name: string; docUrl: string }> = {
    binance: {
      name: 'Binance',
      docUrl: 'https://www.binance.com/en/support/faq/360002502072',
    },
  };

  const info = exchangeNames[exchange];

  if (!info) {
    return (
      <div className="text-red-700 dark:text-red-300 text-sm" role="alert">
        Unsupported exchange configuration: {exchange}
      </div>
    );
  }

  if (isFetching) {
    return (
      <div className="text-slate-600 dark:text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div>
      {savedKey && !isOpen ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-green-700 dark:text-green-200">✓ {info.name} Connected</p>
              <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                API keys are securely stored and encrypted
              </p>
              {savedKey.validated_at && (
                <p className="text-xs text-green-600 dark:text-green-300">
                  Last validated: {new Date(savedKey.validated_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {success && (
            <div className="bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-600 text-green-700 dark:text-green-200 px-3 py-2 rounded text-sm">
              ✓ API keys deleted successfully
            </div>
          )}

          {botsUsingExchange.length > 0 && (
            <div className={`px-3 py-2 rounded text-sm border ${
              hasOpenTrades
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-500 text-red-700 dark:text-red-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-500 text-amber-700 dark:text-amber-200'
            }`}>
              <p className="font-medium">
                {hasOpenTrades ? '🔴 Cannot remove - open trades active' : '⚠️ Cannot remove - bot(s) in use'}
              </p>
              <p className="text-xs mt-1">
                {hasOpenTrades
                  ? `Close all ${totalOpenTrades} open trade(s) and delete bot(s) to remove keys:`
                  : 'Delete these bot(s) to remove API keys:'}
              </p>
              <ul className="text-xs mt-2 space-y-1 ml-4">
                {botsUsingExchange.map(bot => (
                  <li key={bot.id}>
                    • {bot.name} ({bot.status}{bot.open_trades > 0 ? ` • ${bot.open_trades} open trade(s)` : ''})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm font-medium transition"
            >
              Update Keys
            </button>
            <button
              type="button"
              onClick={() => fetchData()}
              className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded text-sm font-medium transition"
              title="Refresh open trades status"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || !canRemoveKeys}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded text-sm font-medium transition"
              title={
                hasOpenTrades
                  ? `Close all ${totalOpenTrades} open trade(s) first`
                  : botsUsingExchange.length > 0
                  ? 'Delete all bots using this exchange first'
                  : ''
              }
            >
              {isDeleting ? 'Deleting...' : 'Remove'}
            </button>
          </div>
        </div>
      ) : !isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition"
        >
          Connect {info.name}
        </button>
      ) : (
        <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 text-green-700 dark:text-green-200 px-3 py-2 rounded text-sm">
              ✓ {info.name} API keys saved successfully!
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Public Key (API Key)
            </label>
            <input
              type="text"
              name="publicKey"
              value={formData.publicKey}
              onChange={handleChange}
              placeholder="Paste your public API key"
              disabled={isLoading}
              autoComplete="new-password"
              spellCheck="false"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Never share this key. Keep it private and secure.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Secret Key (API Secret)
            </label>
            <input
              type="password"
              name="secretKey"
              value={formData.secretKey}
              onChange={handleChange}
              placeholder="Paste your secret key"
              disabled={isLoading}
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your secret is encrypted and stored securely.
            </p>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded">
            <p className="font-semibold mb-1">Quick setup — create your Binance API key:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Log in to <a href="https://www.binance.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">binance.com</a></li>
              <li>Go to Profile → API Management → Create API</li>
              <li>Enable <strong>Reading</strong> + <strong>Spot & Margin Trading</strong></li>
              <li>Do NOT enable Withdrawals</li>
              <li>Copy API Key and Secret Key, paste above</li>
            </ol>
            <div className="mt-2 flex gap-3">
              <a
                href="/help#getting-started"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Full step-by-step guide →
              </a>
              <a
                href={info.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Binance docs →
              </a>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !formData.publicKey.trim() || !formData.secretKey.trim()}
              title={
                !formData.publicKey.trim() || !formData.secretKey.trim()
                  ? 'Please fill in both Public Key and Secret Key'
                  : 'Save API keys'
              }
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition"
            >
              {isLoading ? 'Saving...' : savedKey ? 'Update API Keys' : 'Save API Keys'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded font-medium transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Remove API Keys"
        message={`Are you sure you want to remove ${info.name} API keys? This cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
