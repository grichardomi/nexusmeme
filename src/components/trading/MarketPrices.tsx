'use client';

import { useLiveBots } from '@/hooks/useLiveBots';
import { usePriceCachePolling } from '@/hooks/usePriceCachePolling';
import { PriceCard } from './PriceCard';
import { PriceStatusIndicator } from './PriceStatusIndicator';

/**
 * Market Prices Component
 * Displays real-time trading pair prices from Redis cache
 * Designed as a reusable section within larger dashboards
 * Architecture: Prices updated every 4 seconds by background fetcher
 */
export function MarketPrices() {
  const bots = useLiveBots(10000);
  const activeBot = bots.find((b) => b.isActive);

  // Get real-time prices for active bot's trading pairs
  // Poll every 4s to match background fetcher cadence (was 10s = stale dashboard)
  const { prices, status: priceStatus, isStale, stalePairs } = usePriceCachePolling(
    activeBot?.enabledPairs ?? [],
    { pollIntervalMs: 4000, staleThresholdMs: 15000 }
  );

  // Hide component if no active bot
  if (!activeBot) {
    return null;
  }

  // Hide if no trading pairs configured
  if (!activeBot.enabledPairs?.length) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 dark:from-slate-700 to-slate-100 dark:to-slate-800 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-slate-600">
      {/* Header with Status Indicator */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trading Pairs</h3>
        <PriceStatusIndicator status={priceStatus} isStale={isStale} />
      </div>

      {/* Price Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeBot.enabledPairs.map((pair: string) => (
          <PriceCard
            key={pair}
            pair={pair}
            priceData={prices.get(pair)}
            isStale={stalePairs.includes(pair)}
          />
        ))}
      </div>
    </div>
  );
}
