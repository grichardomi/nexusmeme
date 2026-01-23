'use client';

import type { MarketData } from '@/types/market';

interface PriceCardProps {
  pair: string;
  priceData?: MarketData;
  isStale: boolean;
}

export function PriceCard({ pair, priceData, isStale }: PriceCardProps) {
  const change24h = priceData?.change24h ?? 0;
  const isPositive = change24h >= 0;

  return (
    <div
      className={`p-4 sm:p-5 rounded-lg border-2 transition-all duration-300 ${
        isStale
          ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700'
          : 'bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-900/20 border-blue-200 dark:border-blue-600'
      } shadow-sm hover:shadow-md`}
    >
      {/* Pair Name & Stale Badge */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{pair}</p>
        {isStale && (
          <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded">
            Stale
          </span>
        )}
      </div>

      {/* Price Data */}
      {priceData ? (
        <div>
        
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
            ${priceData.price.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>

      
          <div className="flex items-center gap-2">
            <span
              className={`text-lg sm:text-xl font-bold px-3 py-1.5 rounded-full ${
                isPositive
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
            >
              {isPositive ? '↑' : '↓'} {Math.abs(change24h).toFixed(2)}%
            </span>
            {isPositive ? (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Bullish</span>
            ) : (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">Bearish</span>
            )}
          </div>

          
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-0.5">24h High</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                ${priceData.high24h?.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-0.5">24h Low</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                ${priceData.low24h?.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? 'N/A'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin mb-2"></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading price...</p>
          </div>
        </div>
      )}
    </div>
  );
}
