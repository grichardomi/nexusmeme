'use client';

import { useState } from 'react';

interface BotConfigProps {
  exchange: string;
  enabledPairs: string[];
  tradingMode: 'paper' | 'live';
  config: Record<string, any>;
}

export function BotConfiguration({
  exchange,
  enabledPairs,
  tradingMode,
  config,
}: BotConfigProps) {
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyJSON = () => {
    const jsonStr = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          📋 Configuration
        </h3>
        <button
          onClick={() => setShowRawJSON(!showRawJSON)}
          className="text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-3 py-1 rounded transition"
        >
          {showRawJSON ? 'Hide' : 'View'} Raw JSON
        </button>
      </div>

      {/* Raw JSON View */}
      {showRawJSON && (
        <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-4 overflow-x-auto">
          <div className="flex items-start justify-between mb-3">
            <code className="text-xs text-slate-300 font-mono whitespace-pre">
              {JSON.stringify(config, null, 2)}
            </code>
            <button
              onClick={handleCopyJSON}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded ml-4 flex-shrink-0"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Trading Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
          Trading Settings
        </h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-600 dark:text-slate-400">Mode</p>
            <p className="font-medium text-slate-900 dark:text-white mt-1">
              {tradingMode === 'live' ? (
                <span className="text-red-600 dark:text-red-400">🔴 LIVE</span>
              ) : (
                <span className="text-blue-600 dark:text-blue-400">📄 PAPER</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400">Exchange</p>
            <p className="font-medium text-slate-900 dark:text-white mt-1">
              {exchange.toUpperCase()}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-600 dark:text-slate-400">Trading Pairs</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {enabledPairs.map(pair => (
                <span
                  key={pair}
                  className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded text-xs font-medium"
                >
                  {pair}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
          Strategy Settings
        </h4>
        <div className="space-y-3 text-sm">
          {config?.initialCapital && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Initial Capital</span>
              <span className="font-medium text-slate-900 dark:text-white">
                ${config.initialCapital.toLocaleString()}
              </span>
            </div>
          )}

          {config?.createdAt && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Created</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {new Date(config.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {config?.totalTrades !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Total Trades</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {config.totalTrades}
              </span>
            </div>
          )}

          {config?.tradingMode && (
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Trading Mode</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {config.tradingMode}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* AI Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
          AI Validation
        </h4>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Status</span>
            <span className="text-green-600 dark:text-green-400 font-medium">✅ Enabled</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Model</span>
            <span className="font-medium text-slate-900 dark:text-white">gpt-4o-mini</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Min Confidence</span>
            <span className="font-medium text-slate-900 dark:text-white">70%</span>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-200">
          💡 <strong>Configuration Guide:</strong> These settings determine how your bot enters/exits positions, manages risk, and validates trade opportunities. All settings are applied consistently to ensure profitable trading.
        </p>
      </div>
    </div>
  );
}
