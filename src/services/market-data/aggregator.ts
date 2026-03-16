import { marketDataConfig, getEnvironmentConfig } from '@/config/environment';
import { logger, logApiCall } from '@/lib/logger';
import type { MarketData } from '@/types/market';
import { getCachedMultiple, setCached } from '@/lib/redis';

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
 * Map pair to Kraken symbol format
 * BTC/USDT → XBTUSDT, ETH/USDT → ETHUSDT
 */
function mapToKrakenSymbol(pair: string): string {
  const [base, quote] = pair.split('/');
  // Kraken uses XBT for Bitcoin
  const krakenBase = base === 'BTC' ? 'XBT' : base;
  const krakenQuote = quote === 'USD' ? 'USDT' : quote;
  return `${krakenBase}${krakenQuote}`;
}

/**
 * Market Data Aggregator - SINGLE CACHE AUTHORITY
 *
 * Exchange-aware: routes ticker and OHLC requests to the correct exchange.
 * Cache is keyed by exchange+pair so Binance and Kraken prices are independent.
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
   * Get market data for pairs from the given exchange (default: binance).
   * Returns cached data if fresh, otherwise fetches and caches.
   */
  async getMarketData(
    pairs: string[],
    exchange: string = 'binance'
  ): Promise<Map<string, MarketData>> {
    const ex = exchange.toLowerCase();
    const now = Date.now();
    const cacheTtl = marketDataConfig.cacheTtlMs;
    const cache = this.caches.get(ex);

    if (cache && now - cache.fetchedAt < cacheTtl) {
      return new Map(
        Array.from(cache.data.entries()).filter(([pair]) => pairs.includes(pair))
      );
    }

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

    const response = await fetch(url);
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

  /**
   * Fetch ticker from Kraken public API (no auth required).
   * Kraken ticker: GET https://api.kraken.com/0/public/Ticker?pair=XBTUSDT
   * Response fields: c=last close [price, lot], b=best bid, a=best ask,
   *   v=volume [today, 24h], h=high [today, 24h], l=low [today, 24h], o=open today
   */
  private async fetchTickerKraken(pair: string): Promise<any> {
    const symbol = mapToKrakenSymbol(pair);
    const url = `https://api.kraken.com/0/public/Ticker?pair=${symbol}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.error?.length) {
      throw new Error(`Kraken API error: ${json.error.join(', ')}`);
    }

    // Kraken returns result keyed by their internal pair name (may differ from requested)
    const resultKey = Object.keys(json.result)[0];
    const d = json.result[resultKey];

    const last = parseFloat(d.c[0]);
    const open = parseFloat(d.o);
    const high = parseFloat(d.h[1]); // index 1 = last 24h
    const low = parseFloat(d.l[1]);
    const volume = parseFloat(d.v[1]);
    const priceChangePercent = open > 0 ? ((last - open) / open) * 100 : 0;

    return {
      pair,
      last,
      bid: parseFloat(d.b[0]),
      ask: parseFloat(d.a[0]),
      volume,
      highPrice: high,
      lowPrice: low,
      openPrice: open,
      priceChangePercent,
      timestamp: Date.now(),
    };
  }

  private async fetchTicker(pair: string, exchange: string): Promise<any> {
    try {
      if (exchange === 'kraken') {
        return await this.fetchTickerKraken(pair);
      }
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
