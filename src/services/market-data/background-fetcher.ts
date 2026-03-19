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
import { query } from '@/lib/db';
import { marketDataAggregator } from './aggregator';
import { getBinanceWebSocketClient } from './websocket-client';
import { WebSocketState } from '@/types/market-data';

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
  /**
   * Get per-exchange pair lists for running bots.
   * Returns a Map of exchange → unique pairs.
   */
  private async getActiveBotPairsByExchange(): Promise<Map<string, string[]>> {
    try {
      const result = await query<{ exchange: string; enabled_pairs: string[] }>(
        `SELECT exchange, enabled_pairs FROM bot_instances WHERE status = 'running'`
      );

      const byExchange = new Map<string, Set<string>>();
      for (const row of result) {
        const ex = (row.exchange || 'binance').toLowerCase();
        if (!byExchange.has(ex)) byExchange.set(ex, new Set());
        if (Array.isArray(row.enabled_pairs)) {
          for (const pair of row.enabled_pairs) byExchange.get(ex)!.add(pair);
        }
      }

      return new Map(Array.from(byExchange.entries()).map(([ex, pairs]) => [ex, Array.from(pairs)]));
    } catch (error) {
      logger.debug('Failed to get active bot pairs by exchange', {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }

  /**
   * Fetch prices for pairs actively traded by running bots (dynamic)
   * Always fetches fresh data from exchange (bypasses aggregator cache)
   * Background fetcher should always refresh to keep cache warm
   * Logging is rate-limited to reduce spam (only logs every N successful fetches)
   */
  private async fetchPrices(): Promise<void> {
    const startTime = Date.now();
    this.stats.fetchAttempts++;
    this.stats.nextScheduledFetch = startTime + 4000; // Approximate next fetch

    try {
      // Get pairs per exchange from active bots
      const pairsByExchange = await this.getActiveBotPairsByExchange();

      if (pairsByExchange.size === 0) {
        // No active bots - skip silently (not an error)
        return;
      }

      // Keep Binance WebSocket in sync with active pairs.
      // The WS leader publishes real-time prices to Redis; aggregator reads them
      // as a fast-path before falling back to REST.  This replaces REST polling
      // at scale: one persistent connection → zero per-pair request weight.
      const binancePairs = pairsByExchange.get('binance') ?? [];
      if (binancePairs.length > 0) {
        const wsClient = getBinanceWebSocketClient();
        const wsState = wsClient.getState();
        if (wsState !== WebSocketState.CONNECTED && wsState !== WebSocketState.CONNECTING) {
          wsClient.connect(binancePairs).catch(err => {
            logger.warn('WebSocket connect failed — REST fallback active', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        } else {
          // Add any new pairs that appeared since last connect
          wsClient.addPairs(binancePairs).catch(() => { /* non-fatal */ });
        }
      }

      // REST fetch as fallback: keeps Redis warm for Kraken (no WS) and during WS cold-start
      let totalPairs = 0;
      let totalRetrieved = 0;
      for (const [exchange, pairs] of pairsByExchange.entries()) {
        // Skip Binance REST fetch when WebSocket is connected and serving prices
        if (exchange === 'binance') {
          const wsClient = getBinanceWebSocketClient();
          if (wsClient.getState() === WebSocketState.CONNECTED) {
            totalPairs += pairs.length;
            totalRetrieved += pairs.length; // WS serves all pairs live
            continue;
          }
        }
        const data = await marketDataAggregator.fetchFresh(pairs, exchange);
        totalPairs += pairs.length;
        totalRetrieved += data.size;
      }

      const duration = Date.now() - startTime;
      this.stats.lastFetchTime = startTime;
      this.stats.lastFetchDurationMs = duration;
      this.stats.fetchSuccesses++;
      this.stats.lastError = null;

      // Rate-limited logging: only log every N successful fetches to reduce spam
      if (this.stats.fetchSuccesses % this.LOG_EVERY_N_FETCHES === 0) {
        logger.info('Background fetcher: cache refreshed', {
          exchanges: Array.from(pairsByExchange.keys()),
          pairs: totalPairs,
          retrieved: totalRetrieved,
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
