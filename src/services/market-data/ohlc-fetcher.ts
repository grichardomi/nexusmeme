/**
 * OHLC Data Fetcher (Binance Public API)
 * Shared utility for fetching real OHLC data
 * Used by analyzer, orchestrator, and trade-worker
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import type { OHLCCandle } from '@/types/ai';

/**
 * Map trading pair to Binance symbol format
 * BTC/USD → BTCUSDT, ETH/USD → ETHUSDT, BTC/USDT → BTCUSDT
 */
function mapPairToBinance(pair: string): string {
  const [base, quote] = pair.split('/');
  // Binance only has USDT pairs — map USD → USDT
  const binanceQuote = quote === 'USD' ? 'USDT' : quote;
  return `${base}${binanceQuote}`;
}

/**
 * Fetch real OHLC data from Binance public API
 * @param pair Trading pair (e.g., BTC/USD, ETH/USDT)
 * @param limit Number of candles to return (max 1000)
 * @param timeframe Candle interval (15m, 1h, 4h, 1d)
 */
export async function fetchOHLC(
  pair: string,
  limit: number = 100,
  timeframe: string = '15m'
): Promise<OHLCCandle[]> {
  try {
    logger.debug('Fetching OHLC data from Binance API', { pair, limit, timeframe });

    const symbol = mapPairToBinance(pair);
    const baseUrl = getEnvironmentConfig().BINANCE_API_BASE_URL;

    // Binance uses same timeframe format as ours (15m, 1h, 4h, 1d)
    // Request limit+1 to drop incomplete current candle
    const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit + 1}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`);
    }

    const candles: any[] = await response.json();

    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error('No candle data returned from Binance');
    }

    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    // Drop the last candle (incomplete/current)
    const ohlcCandles: OHLCCandle[] = candles
      .slice(0, -1) // Remove incomplete current candle
      .slice(-limit) // Take last N candles
      .map((candle) => ({
        time: new Date(candle[0]), // openTime is already in ms
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

    logger.debug('Binance OHLC data fetched successfully', {
      pair,
      symbol,
      candleCount: ohlcCandles.length,
      lastClose: ohlcCandles[ohlcCandles.length - 1]?.close,
    });

    return ohlcCandles;
  } catch (error) {
    logger.debug('Failed to fetch from Binance API', {
      pair,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error instanceof Error ? error : new Error(String(error));
  }
}
