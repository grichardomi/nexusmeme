import { marketDataConfig, getEnvironmentConfig } from '@/config/environment';
import { logger, logApiCall } from '@/lib/logger';
import type { MarketData } from '@/types/market';
import { getCachedMultiple, setCached } from '@/lib/redis';
import { getPricesFromRedis } from './redis-price-distribution';

/**
 * Maximum age for WebSocket-sourced prices before falling back to REST.
 * Binance 24hrTicker streams fire every ~250ms on change, so 2s gives
 * 8× margin before we consider the price stale.
 */
const WS_MAX_PRICE_AGE_MS = 2000;

interface CachedMarketData {
  data: Map<string, MarketData>;
  fetchedAt: number;
}

/**
 * Map pair to Binance symbol format
 * BTC/USDT → BTCUSDT, ETH/USDT → ETHUSDT
 */
function mapToBinanceSymbol(pair: string): string {
  const [base, quote] = pair.split('/');
  const binanceQuote = quote === 'USD' ? 'USDT' : quote;
  return `${base}${binanceQuote}`;
}

/**
 * Market Data Aggregator - SINGLE CACHE AUTHORITY
 *
 * Exchange-aware: routes ticker and OHLC requests to the correct exchange.
 * Cache is keyed by exchange+pair.
 *
 * Caching layers:
 * 1. In-process memory cache (10s TTL) — serves most requests locally
 * 2. Redis distributed cache (15s TTL) — shared across server instances
 * 3. Exchange public API — only fetched when both caches are cold
 */
class MarketDataAggregator {
  // Per-exchange in-process cache
  private caches: Map<string, CachedMarketData> = new Map();
  private isFetching: Map<string, boolean> = new Map();

  /**
   * Read prices published by the Binance WebSocket leader from Redis.
   * Returns only entries fresh enough for trading decisions (< WS_MAX_PRICE_AGE_MS).
   * Only Binance has a WebSocket feeder — returns empty map for other exchanges.
   */
  private async getFromWebSocketCache(pairs: string[]): Promise<Map<string, MarketData>> {
    const result = new Map<string, MarketData>();
    try {
      const wsPrices = await getPricesFromRedis(pairs);
      const now = Date.now();
      for (const [pair, update] of wsPrices) {
        if (now - update.timestamp <= WS_MAX_PRICE_AGE_MS) {
          result.set(pair, {
            pair,
            price: update.price,
            bid: update.bid,
            ask: update.ask,
            volume: update.volume24h,
            timestamp: new Date(update.timestamp),
            change24h: update.changePercent24h,
            high24h: update.high24h,
            low24h: update.low24h,
          });
        }
      }
    } catch {
      // Non-fatal — fall through to REST
    }
    return result;
  }

  /**
   * Get market data for pairs from the given exchange (default: binance).
   *
   * Resolution order (fastest → slowest):
   *   1. In-process cache (10s TTL) — zero I/O
   *   2. WebSocket Redis cache (< 2s age, Binance only) — one Redis round-trip, real-time price
   *   3. REST polling + Redis/in-process cache — full fetch, used on cold start or WS outage
   */
  async getMarketData(
    pairs: string[],
    exchange: string = 'binance'
  ): Promise<Map<string, MarketData>> {
    const ex = exchange.toLowerCase();
    const now = Date.now();
    const cacheTtl = marketDataConfig.cacheTtlMs;
    const cache = this.caches.get(ex);

    // Layer 1: in-process cache (10s TTL) — only use if ALL requested pairs are covered
    if (cache && now - cache.fetchedAt < cacheTtl) {
      const cached = new Map(
        Array.from(cache.data.entries()).filter(([pair]) => pairs.includes(pair))
      );
      if (cached.size === pairs.length) {
        return cached;
      }
      // Some pairs missing from cache — fall through to WS/REST for those pairs
    }

    // Layer 2: WebSocket Redis cache (Binance only, < 2s age)
    // One Redis round-trip serves ALL pairs — zero REST weight consumed.
    // Scales to thousands of pairs without hitting Binance rate limits.
    if (ex === 'binance') {
      const wsData = await this.getFromWebSocketCache(pairs);
      if (wsData.size === pairs.length) {
        // Full coverage from WebSocket — update in-process cache and return immediately
        const merged = new Map([...(cache?.data ?? new Map()), ...wsData]);
        this.caches.set(ex, { data: merged, fetchedAt: now });
        return wsData;
      }
      // Partial/no WS coverage: fall through to REST for the missing pairs.
      // This handles cold start (WS just connected) and WS outage gracefully.
      if (wsData.size > 0) {
        logger.debug('WS cache partial hit — falling back to REST for missing pairs', {
          wsCovered: wsData.size,
          total: pairs.length,
          missing: pairs.filter(p => !wsData.has(p)),
        });
      }
    }

    // Layer 3: REST polling + Redis/in-process cache
    if (this.isFetching.get(ex)) {
      await this.waitForFetch(ex);
      return this.getMarketData(pairs, exchange);
    }

    return this.fetchAndCache(pairs, ex);
  }

  /**
   * Fetch ticker from Binance public API (no auth required).
   */
  private async fetchTickerBinance(pair: string): Promise<any> {
    const symbol = mapToBinanceSymbol(pair);
    const baseUrl = getEnvironmentConfig().BINANCE_MARKET_DATA_URL;
    const url = `${baseUrl}/api/v3/ticker/24hr?symbol=${symbol}`;

    const fetchWithTimeout = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    let response: Response;
    try {
      response = await fetchWithTimeout();
    } catch {
      // Single retry on transient network error
      await new Promise(r => setTimeout(r, 500));
      response = await fetchWithTimeout();
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      pair,
      last: parseFloat(data.lastPrice),
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      volume: parseFloat(data.volume),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
      openPrice: parseFloat(data.openPrice),
      priceChangePercent: parseFloat(data.priceChangePercent),
      timestamp: Date.now(),
    };
  }

  private async fetchTicker(pair: string, exchange: string): Promise<any> {
    try {
      return await this.fetchTickerBinance(pair);
    } catch (error) {
      logger.error(`Failed to fetch ticker from ${exchange}`, error instanceof Error ? error : null, {
        pair,
        exchange,
      });
      throw error;
    }
  }

  private async fetchAndCache(pairs: string[], exchange: string): Promise<Map<string, MarketData>> {
    this.isFetching.set(exchange, true);
    const startTime = Date.now();

    try {
      const data = new Map<string, MarketData>();
      const BATCH_SIZE = 10;
      const MAX_CONCURRENT_BATCHES = 3;

      const batches: string[][] = [];
      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        batches.push(pairs.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += MAX_CONCURRENT_BATCHES) {
        const concurrentBatches = batches.slice(batchIndex, batchIndex + MAX_CONCURRENT_BATCHES);

        await Promise.all(concurrentBatches.map(async (batch) => {
          const cacheKeys = batch.map(pair => `market_data:${exchange}:${pair}`);
          const cachedBatch = await getCachedMultiple<MarketData>(cacheKeys);
          const cachedByPair = new Map<string, MarketData | null>();
          cachedBatch.forEach((cached, index) => cachedByPair.set(batch[index], cached));

          for (const pair of batch) {
            try {
              const cached = cachedByPair.get(pair);
              if (cached) {
                data.set(pair, cached);
                continue;
              }

              const ticker = await this.fetchTicker(pair, exchange);
              const marketData: MarketData = {
                pair,
                price: ticker.last,
                volume: ticker.volume,
                timestamp: ticker.timestamp,
                change24h: ticker.priceChangePercent ?? 0,
                high24h: ticker.highPrice ?? ticker.last,
                low24h: ticker.lowPrice ?? ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
              };

              const ttlSeconds = Math.ceil(marketDataConfig.cacheTtlMs / 1000);
              await setCached(`market_data:${exchange}:${pair}`, marketData, ttlSeconds);
              data.set(pair, marketData);
            } catch (pairError) {
              logger.error('Failed to fetch market data for pair', pairError instanceof Error ? pairError : null, {
                pair,
                exchange,
              });
            }
          }
        }));
      }

      const duration = Date.now() - startTime;
      logApiCall('aggregator', 'fetch_market_data', 'GET', duration, 200);

      this.caches.set(exchange, { data, fetchedAt: Date.now() });
      return data;
    } catch (error) {
      logger.error('Failed to fetch market data', error instanceof Error ? error : null, { pairs: pairs.length, exchange });
      throw error;
    } finally {
      this.isFetching.set(exchange, false);
    }
  }

  private async waitForFetch(exchange: string, maxWaitMs = 5000): Promise<void> {
    const startTime = Date.now();
    while (this.isFetching.get(exchange) && Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  clearCache(): void {
    this.caches.clear();
  }

  getCacheAgeMs(exchange: string = 'binance'): number {
    const cache = this.caches.get(exchange.toLowerCase());
    if (!cache) return -1;
    return Date.now() - cache.fetchedAt;
  }

  isCacheStale(exchange: string = 'binance'): boolean {
    return this.getCacheAgeMs(exchange) > marketDataConfig.staleTtlMs;
  }

  /**
   * Always fetch fresh data bypassing ALL caches.
   * Used by background fetcher to keep prices warm.
   */
  async fetchFresh(pairs: string[], exchange: string = 'binance'): Promise<Map<string, MarketData>> {
    const ex = exchange.toLowerCase();
    const data = new Map<string, MarketData>();

    for (const pair of pairs) {
      try {
        const ticker = await this.fetchTicker(pair, ex);
        const marketData: MarketData = {
          pair,
          price: ticker.last,
          volume: ticker.volume,
          timestamp: ticker.timestamp,
          change24h: ticker.priceChangePercent ?? 0,
          high24h: ticker.highPrice ?? ticker.last,
          low24h: ticker.lowPrice ?? ticker.last,
          bid: ticker.bid,
          ask: ticker.ask,
        };

        const ttlSeconds = Math.ceil(marketDataConfig.cacheTtlMs / 1000);
        await setCached(`market_data:${ex}:${pair}`, marketData, ttlSeconds);
        data.set(pair, marketData);
      } catch (pairError) {
        logger.error('fetchFresh: failed for pair', pairError instanceof Error ? pairError : null, { pair, exchange: ex });
      }
    }

    if (data.size > 0) {
      this.caches.set(ex, { data, fetchedAt: Date.now() });
    }

    return data;
  }
}

// Singleton instance
export const marketDataAggregator = new MarketDataAggregator();
