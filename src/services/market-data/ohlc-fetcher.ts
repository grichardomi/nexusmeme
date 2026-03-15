/**
 * OHLC Data Fetcher — exchange-aware (Binance + Kraken public APIs)
 * Shared utility for fetching real OHLC candle data.
 * Used by analyzer, orchestrator, regime detector, and trade-worker.
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import type { OHLCCandle } from '@/types/ai';

/** BTC/USDT → BTCUSDT */
function mapToBinanceSymbol(pair: string): string {
  const [base, quote] = pair.split('/');
  return `${base}${quote === 'USD' ? 'USDT' : quote}`;
}

/** BTC/USDT → XBTUSDT, ETH/USDT → ETHUSDT */
function mapToKrakenSymbol(pair: string): string {
  const [base, quote] = pair.split('/');
  const krakenBase = base === 'BTC' ? 'XBT' : base;
  return `${krakenBase}${quote === 'USD' ? 'USDT' : quote}`;
}

/** Convert standard timeframe string to Kraken interval (minutes). */
function toKrakenInterval(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[timeframe] ?? 60;
}

async function fetchOHLCBinance(pair: string, limit: number, timeframe: string): Promise<OHLCCandle[]> {
  const symbol = mapToBinanceSymbol(pair);
  const baseUrl = getEnvironmentConfig().BINANCE_API_BASE_URL;
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
}

async function fetchOHLCKraken(pair: string, limit: number, timeframe: string): Promise<OHLCCandle[]> {
  const symbol = mapToKrakenSymbol(pair);
  const interval = toKrakenInterval(timeframe);
  const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kraken OHLC API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error?.length) {
    throw new Error(`Kraken OHLC error: ${json.error.join(', ')}`);
  }

  // Kraken format: [time, open, high, low, close, vwap, volume, count]
  const resultKey = Object.keys(json.result).find(k => k !== 'last');
  if (!resultKey) throw new Error('No OHLC data in Kraken response');

  const candles: any[] = json.result[resultKey];
  return candles
    .slice(0, -1)   // drop incomplete current candle
    .slice(-limit)
    .map((c) => ({
      time: new Date(c[0] * 1000), // Kraken uses seconds
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[6]),
    }));
}

/**
 * Fetch OHLC candle data from the given exchange's public API.
 * @param pair    Trading pair (e.g., BTC/USDT)
 * @param limit   Number of closed candles to return
 * @param timeframe  Candle interval (1m, 5m, 15m, 1h, 4h, 1d)
 * @param exchange  'binance' (default) or 'kraken'
 */
export async function fetchOHLC(
  pair: string,
  limit: number = 100,
  timeframe: string = '15m',
  exchange: string = 'binance'
): Promise<OHLCCandle[]> {
  const ex = exchange.toLowerCase();
  try {
    logger.debug('Fetching OHLC data', { pair, limit, timeframe, exchange: ex });

    const candles = ex === 'kraken'
      ? await fetchOHLCKraken(pair, limit, timeframe)
      : await fetchOHLCBinance(pair, limit, timeframe);

    logger.debug('OHLC data fetched', {
      pair, exchange: ex, candleCount: candles.length,
      lastClose: candles[candles.length - 1]?.close,
    });

    return candles;
  } catch (error) {
    logger.debug(`Failed to fetch OHLC from ${ex}`, {
      pair,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}
