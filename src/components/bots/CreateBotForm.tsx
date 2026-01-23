'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Create Bot Form Component
 * Form for creating new trading bot
 *
 * PROFITABILITY CONSTRAINT: Restricted to BTC/ETH only to maintain /nexus profitability
 * LIVE TRADING: This bot will trade with REAL funds on live markets
 */

interface ConnectedExchange {
  id: string;
  exchange: string;
  validated_at: string | null;
  created_at: string;
}

export function CreateBotForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [existingBotId, setExistingBotId] = useState<string | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<ConnectedExchange[]>([]);
  const [exchangesLoading, setExchangesLoading] = useState(true);
  const [formData, setFormData] = useState({
    exchange: '',
    enabledPairs: ['BTC/USD'],
    initialCapital: 1000,
    tradingMode: 'paper' as 'paper' | 'live',
  });

  // Fetch connected exchanges on mount
  useEffect(() => {
    const fetchConnectedExchanges = async () => {
      try {
        const response = await fetch('/api/exchange-keys');
        if (!response.ok) {
          throw new Error('Failed to fetch connected exchanges');
        }
        const data = await response.json();
        const exchanges = data.keys || [];
        setConnectedExchanges(exchanges);

        // Set default exchange to first connected exchange
        if (exchanges.length > 0) {
          setFormData(prev => ({
            ...prev,
            exchange: exchanges[0].exchange,
          }));
        }
      } catch (err) {
        console.error('Error fetching connected exchanges:', err);
        setConnectedExchanges([]);
      } finally {
        setExchangesLoading(false);
      }
    };

    fetchConnectedExchanges();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'radio' ? (value as 'paper' | 'live') : name === 'initialCapital' ? parseFloat(value) : value,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create bot');
        setErrorCode(data.code || null);
        if (data.existingBotId) {
          setExistingBotId(data.existingBotId);
        }
        return;
      }

      router.push(`/dashboard/bots/${data.id}?setupBilling=true`);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // PROFITABILITY: BTC/ETH only - matches /nexus proven profitable pairs
  const supportedPairs = ['BTC/USD', 'BTC/USDT', 'ETH/USD', 'ETH/USDT'];
  const hasConnectedExchanges = connectedExchanges.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          <p className="font-medium">{error}</p>
          {errorCode === 'NO_API_KEYS' && (
            <p className="text-xs mt-2">
              Go to{' '}
              <Link href="/dashboard/settings" className="underline font-semibold hover:text-red-900 dark:hover:text-red-100">
                Settings → Exchange Connections
              </Link>
              {' '}to connect your API keys.
            </p>
          )}
          {errorCode === 'BOT_EXISTS' && existingBotId && (
            <div className="text-xs mt-3 space-y-2">
              <p>You can manage your existing bot here:</p>
              <Link
                href={`/dashboard/bots/${existingBotId}`}
                className="inline-block underline font-semibold hover:text-red-900 dark:hover:text-red-100"
              >
                View Existing Bot →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* No Connected Exchanges Notice */}
      {!exchangesLoading && !hasConnectedExchanges && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500 text-amber-700 dark:text-amber-200 px-4 py-3 rounded">
          <p className="text-sm font-semibold">⚠️ No Connected Exchanges</p>
          <p className="text-xs mt-2">You need to connect at least one exchange before creating a bot.</p>
          <Link
            href="/dashboard/settings"
            className="inline-block mt-3 text-xs underline font-semibold hover:text-amber-900 dark:hover:text-amber-100 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded"
          >
            Go to Settings to Connect an Exchange →
          </Link>
        </div>
      )}

      {/* LIVE TRADING WARNING */}
      {hasConnectedExchanges && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded">
          <p className="text-sm font-semibold">⚠️ LIVE TRADING WITH REAL FUNDS</p>
          <p className="text-xs mt-2">This bot will execute trades using REAL money on live markets. Please review your API keys and initial capital carefully before proceeding.</p>
        </div>
      )}

      {/* Profitability Notice */}
      {hasConnectedExchanges && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 text-blue-700 dark:text-blue-200 px-4 py-3 rounded">
          <p className="text-sm font-medium">🎯 Profitability Optimized</p>
          <p className="text-xs mt-1">This bot trades only BTC and ETH pairs to maintain proven profitability from our successful trading strategies.</p>
        </div>
      )}

      {/* API Keys Required Notice */}
      {hasConnectedExchanges && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500 text-purple-700 dark:text-purple-200 px-4 py-3 rounded">
          <p className="text-sm font-medium">🔑 Connected Exchanges</p>
          <p className="text-xs mt-1">
            {connectedExchanges.map(ex => ex.exchange.toUpperCase()).join(', ')} connected
          </p>
        </div>
      )}

      {/* Exchange Selection */}
      {hasConnectedExchanges && (
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Exchange</label>
          <select
            name="exchange"
            value={formData.exchange}
            onChange={handleChange}
            disabled={isLoading || exchangesLoading}
            className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          >
            {connectedExchanges.map(exchange => (
              <option key={exchange.id} value={exchange.exchange}>
                {exchange.exchange.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Trading Mode Selection */}
      {hasConnectedExchanges && (
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">Trading Mode</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <input
                type="radio"
                name="tradingMode"
                value="paper"
                checked={formData.tradingMode === 'paper'}
                onChange={handleChange}
                disabled={isLoading}
                className="w-4 h-4 cursor-pointer"
              />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">📄 Paper Trading (Recommended)</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Test your bot with simulated trades. No real money is used.</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-3 border border-red-200 dark:border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
              <input
                type="radio"
                name="tradingMode"
                value="live"
                checked={formData.tradingMode === 'live'}
                onChange={handleChange}
                disabled={isLoading}
                className="w-4 h-4 cursor-pointer"
              />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">🔴 Live Trading</p>
                <p className="text-xs text-red-600 dark:text-red-400">⚠️ Trades with REAL funds. Only use after testing in Paper mode.</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Trading Pairs */}
      {hasConnectedExchanges && (
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-4">Trading Pairs</label>
          <div className="space-y-2">
            {supportedPairs.map(pair => (
              <label key={pair} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabledPairs.includes(pair)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData(prev => ({
                        ...prev,
                        enabledPairs: [...prev.enabledPairs, pair],
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        enabledPairs: prev.enabledPairs.filter(p => p !== pair),
                      }));
                    }
                  }}
                  disabled={isLoading}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-slate-700 dark:text-slate-300">{pair}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Initial Capital */}
      {hasConnectedExchanges && (
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Initial Capital ($)</label>
          <input
            type="number"
            name="initialCapital"
            value={formData.initialCapital}
            onChange={handleChange}
            min="100"
            step="100"
            disabled={isLoading}
            className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Minimum: $100</p>
        </div>
      )}

      {/* Submit Button */}
      {hasConnectedExchanges && (
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isLoading || exchangesLoading || formData.enabledPairs.length === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-medium py-2 rounded transition"
          >
            {isLoading ? 'Creating...' : 'Create Bot'}
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            disabled={isLoading}
            className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium py-2 rounded transition"
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}
