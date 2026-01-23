/**
 * Background Market Data Fetcher
 * Periodically fetches prices from aggregator and pushes to Redis cache
 *
 * Architecture:
 * - Runs on a timer (every 3-5 seconds)
 * - Fetches configured trading pairs
 * - Aggregator handles batching + rate limiting
 * - Prices automatically cached in Redis by aggregator
 * - All clients read from Redis (no per-user API calls)
 *
 * This ensures:
 * 1. Single source of rate-limit control
 * 2. Consistent prices across all users
 * 3. No direct client→exchange calls
 * 4. Graceful degradation (stale data with indicator)
 */

import { logger } from '@/lib/logger';
import { marketDataAggregator } from './aggregator';
import { tradingConfig } from '@/config/environment';

interface BackgroundFetcherStats {
  lastFetchTime: number | null;
  lastFetchDurationMs: number | null;
  fetchAttempts: number;
  fetchSuccesses: number;
  fetchErrors: number;
  lastError: Error | null;
  nextScheduledFetch: number | null;
}

class BackgroundMarketDataFetcher {
  private fetchInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stats: BackgroundFetcherStats = {
    lastFetchTime: null,
    lastFetchDurationMs: null,
    fetchAttempts: 0,
    fetchSuccesses: 0,
    fetchErrors: 0,
    lastError: null,
    nextScheduledFetch: null,
  };

  // Log rate limiting - only log every N fetches to reduce spam
  private readonly LOG_EVERY_N_FETCHES = 10; // Log every 10 successful fetches (~40 seconds)

  /**
   * Start background fetching on a timer
   * @param intervalMs How often to fetch (default: 4 seconds, range: 2-10s)
   */
  start(intervalMs: number = 4000): void {
    if (this.isRunning) {
      logger.warn('Background fetcher already running');
      return;
    }

    // Validate interval is reasonable
    if (intervalMs < 2000 || intervalMs > 10000) {
      logger.warn('Background fetcher interval out of range, clamping', {
        requested: intervalMs,
        min: 2000,
        max: 10000,
      });
      intervalMs = Math.max(2000, Math.min(10000, intervalMs));
    }

    this.isRunning = true;

    logger.info('Starting background market data fetcher', { intervalMs });

    // Do initial fetch immediately
    this.fetchPrices();

    // Set up recurring fetches
    this.fetchInterval = setInterval(() => {
      this.fetchPrices();
    }, intervalMs);
  }

  /**
   * Stop background fetching
   */
  stop(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }

    this.isRunning = false;
    logger.info('Stopped background market data fetcher');
  }

  /**
   * Fetch prices for all configured trading pairs
   * Always fetches fresh data from exchange (bypasses aggregator cache)
   * Background fetcher should always refresh to keep cache warm
   * Logging is rate-limited to reduce spam (only logs every N successful fetches)
   */
  private async fetchPrices(): Promise<void> {
    const startTime = Date.now();
    this.stats.fetchAttempts++;
    this.stats.nextScheduledFetch = startTime + 4000; // Approximate next fetch

    try {
      // Get pairs to fetch (from config)
      const pairs = tradingConfig.allowedPairs;

      if (pairs.length === 0) {
        logger.warn('No trading pairs configured for background fetch');
        return;
      }

      // Always fetch fresh data (bypass aggregator cache for background fetcher)
      // This ensures Redis is updated every 4 seconds with latest prices
      const data = await marketDataAggregator.fetchFresh(pairs);

      const duration = Date.now() - startTime;
      this.stats.lastFetchTime = startTime;
      this.stats.lastFetchDurationMs = duration;
      this.stats.fetchSuccesses++;
      this.stats.lastError = null;

      // Rate-limited logging: only log every N successful fetches to reduce spam
      if (this.stats.fetchSuccesses % this.LOG_EVERY_N_FETCHES === 0) {
        logger.info('Background fetcher: cache refreshed', {
          pairs: pairs.length,
          retrieved: data.size,
          durationMs: duration,
          successCount: this.stats.fetchSuccesses,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.lastFetchDurationMs = duration;
      this.stats.fetchErrors++;
      this.stats.lastError = error instanceof Error ? error : new Error(String(error));

      // Only log errors (not every successful fetch)
      logger.error(
        'Background fetcher: fetch failed',
        this.stats.lastError,
        {
          attempts: this.stats.fetchAttempts,
          successes: this.stats.fetchSuccesses,
          errors: this.stats.fetchErrors,
          durationMs: duration,
        }
      );

      // Don't throw - let it retry on next interval
    }
  }

  /**
   * Get current fetcher statistics
   */
  getStats(): BackgroundFetcherStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      lastFetchTime: null,
      lastFetchDurationMs: null,
      fetchAttempts: 0,
      fetchSuccesses: 0,
      fetchErrors: 0,
      lastError: null,
      nextScheduledFetch: null,
    };
  }

  /**
   * Check if fetcher is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get cache health metrics
   */
  getCacheHealth(): {
    isRunning: boolean;
    cacheAge: number;
    isCacheStale: boolean;
    fetchSuccessRate: number;
    lastErrorMessage: string | null;
  } {
    const successRate =
      this.stats.fetchAttempts > 0 ? this.stats.fetchSuccesses / this.stats.fetchAttempts : 0;

    return {
      isRunning: this.isRunning,
      cacheAge: this.stats.lastFetchTime ? Date.now() - this.stats.lastFetchTime : -1,
      isCacheStale: marketDataAggregator.isCacheStale(),
      fetchSuccessRate: Math.round(successRate * 100) / 100,
      lastErrorMessage: this.stats.lastError?.message ?? null,
    };
  }
}

// Singleton instance
let instance: BackgroundMarketDataFetcher | null = null;

export function getBackgroundMarketDataFetcher(): BackgroundMarketDataFetcher {
  if (!instance) {
    instance = new BackgroundMarketDataFetcher();
  }
  return instance;
}

/**
 * Initialize background fetcher for server startup
 * This should be called once when the app starts (in a Next.js route or API handler)
 */
export async function initializeBackgroundFetcher(): Promise<void> {
  try {
    const fetcher = getBackgroundMarketDataFetcher();

    if (fetcher.isActive()) {
      logger.debug('Background fetcher already running');
      return;
    }

    // Fetch interval: 4 seconds (refreshes every 4s, Redis TTL is 15s, so margin of 11s)
    const intervalMs = 4000;
    fetcher.start(intervalMs);

    logger.info('Background market data fetcher initialized', { intervalMs });
  } catch (error) {
    logger.error(
      'Failed to initialize background fetcher',
      error instanceof Error ? error : null
    );
    // Don't throw - let app continue with cold cache, users will see "temporarily unavailable"
  }
}

/**
 * Shutdown background fetcher (for graceful shutdown)
 */
export function shutdownBackgroundFetcher(): void {
  const fetcher = getBackgroundMarketDataFetcher();
  fetcher.stop();
}
