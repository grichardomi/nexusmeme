'use client';

import { useEffect, useState } from 'react';

interface Trade {
  id: string;
  botId: string;
  pair: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string;
  exitTime: string | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  status: string;
}

interface BotTradesListProps {
  botId: string;
}

export function BotTradesList({ botId }: BotTradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrades() {
      try {
        const response = await fetch(`/api/trades?botId=${botId}&limit=20`);
        if (!response.ok) {
          throw new Error('Failed to fetch trades');
        }
        const data = await response.json();
        setTrades(data.trades);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchTrades();
  }, [botId]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse bg-slate-100 dark:bg-slate-700 rounded-lg h-20" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded">
        <p className="text-sm">ℹ️ Trade history not yet available. Start the bot to begin recording trades.</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-slate-600 dark:text-slate-400">
        <p>No trades yet. Start the bot to begin trading.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards — shown below md */}
      <div className="space-y-2 md:hidden">
        {trades.map(trade => {
          const isOpen = trade.status !== 'closed';
          const pnlPositive = trade.profitLoss !== null && trade.profitLoss >= 0;
          return (
            <div
              key={trade.id}
              className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border-l-4"
              style={{ borderLeftColor: isOpen ? '#3b82f6' : pnlPositive ? '#10b981' : '#ef4444' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{trade.pair}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {new Date(trade.entryTime).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  isOpen
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                }`}>
                  {isOpen ? '◔ Open' : '✓ Closed'}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <span>{trade.entryPrice.toFixed(2)} USDT</span>
                  {trade.exitPrice && <span> → {trade.exitPrice.toFixed(2)} USDT</span>}
                </div>
                {trade.profitLoss !== null ? (
                  <div className="text-right">
                    <p className={`text-sm font-bold ${pnlPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pnlPositive ? '+' : ''}{trade.profitLoss.toFixed(2)} USDT
                    </p>
                    {trade.profitLossPercent !== null && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {trade.profitLossPercent >= 0 ? '+' : ''}{trade.profitLossPercent.toFixed(2)}%
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">Open</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table — shown at md+ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Pair</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Entry</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Exit</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Qty</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">P&L</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">%</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {trades.map(trade => (
              <tr key={trade.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">{trade.pair}</td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                  {trade.entryPrice.toFixed(2)} USDT
                </td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                  {trade.exitPrice ? `${trade.exitPrice.toFixed(2)} USDT` : '—'}
                </td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                  {trade.quantity.toFixed(4)}
                </td>
                <td className={`py-3 px-4 text-right font-medium text-sm ${
                  trade.profitLoss !== null && trade.profitLoss >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.profitLoss !== null
                    ? `${trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)} USDT`
                    : '—'}
                </td>
                <td className={`py-3 px-4 text-right font-medium text-sm ${
                  trade.profitLossPercent !== null && trade.profitLossPercent >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.profitLossPercent !== null
                    ? `${trade.profitLossPercent >= 0 ? '+' : ''}${trade.profitLossPercent.toFixed(2)}%`
                    : '—'}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    trade.status === 'closed'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  }`}>
                    {trade.status === 'closed' ? '✓ Closed' : '◔ Open'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
