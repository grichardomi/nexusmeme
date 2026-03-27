/**
 * OHLC Data Fetcher — Binance public API
 * Shared utility for fetching real OHLC candle data.
 * Used by analyzer, orchestrator, regime detector, and trade-worker.
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import type { OHLCCandle } from '@/types/ai';

/** In-memory cache: last successful OHLC per pair+timeframe, max 5 min stale */
const ohlcCache = new Map<string, { candles: OHLCCandle[]; fetchedAt: number }>();
const OHLC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — 1h candles change slowly

/** BTC/USDT → BTCUSDT */
function mapToBinanceSymbol(pair: string): string {
  const [base, quote] = pair.split('/');
  return `${base}${quote === 'USD' ? 'USDT' : quote}`;
}

/** Fetch with up to 3 attempts, 1s/2s backoff on transient network errors */
async function fetchOHLCBinance(pair: string, limit: number, timeframe: string): Promise<OHLCCandle[]> {
  const symbol = mapToBinanceSymbol(pair);
  const baseUrl = getEnvironmentConfig().BINANCE_MARKET_DATA_URL;
  const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit + 1}`;

  const maxAttempts = 3;
  let lastError: Error = new Error('Unknown fetch error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Binance API error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`);
      }

      const candles: any[] = await response.json();
      if (!Array.isArray(candles) || candles.length === 0) {
        throw new Error('No candle data returned from Binance');
      }

      // Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
      return candles
        .slice(0, -1)   // drop incomplete current candle
        .slice(-limit)
        .map((c) => ({
          time: new Date(c[0]),
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
        }));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        logger.warn('OHLC fetch failed, retrying', { pair, timeframe, attempt, error: lastError.message });
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Fetch OHLC candle data from Binance public API.
 * @param pair    Trading pair (e.g., BTC/USDT)
 * @param limit   Number of closed candles to return
 * @param timeframe  Candle interval (1m, 5m, 15m, 1h, 4h, 1d)
 * @param exchange  Exchange name (only 'binance' supported)
 */
export async function fetchOHLC(
  pair: string,
  limit: number = 100,
  timeframe: string = '15m',
  exchange: string = 'binance'
): Promise<OHLCCandle[]> {
  const ex = exchange.toLowerCase();
  const cacheKey = `${pair}:${timeframe}`;

  try {
    logger.debug('Fetching OHLC data', { pair, limit, timeframe, exchange: ex });

    const candles = await fetchOHLCBinance(pair, limit, timeframe);
    ohlcCache.set(cacheKey, { candles, fetchedAt: Date.now() });

    logger.debug('OHLC data fetched', {
      pair, exchange: ex, candleCount: candles.length,
      lastClose: candles[candles.length - 1]?.close,
    });

    return candles;
  } catch (error) {
    // Serve last known candles if within TTL — regime detection runs on 1h candles,
    // 5-minute stale data is far better than crashing the entire analysis cycle.
    const cached = ohlcCache.get(cacheKey);
    const staleMs = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (cached && staleMs < OHLC_CACHE_TTL_MS) {
      logger.warn(`OHLC fetch failed — serving cached data (${Math.round(staleMs / 1000)}s stale)`, { pair, timeframe });
      return cached.candles;
    }

    logger.error(`Failed to fetch OHLC from ${ex} after retries: ${pair} - ${error instanceof Error ? error.message : String(error)}`);
    throw error instanceof Error ? error : new Error(String(error));
  }
}
