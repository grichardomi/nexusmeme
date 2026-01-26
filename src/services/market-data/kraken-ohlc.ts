/**
 * Kraken OHLC Data Fetcher
 * Shared utility for fetching real OHLC data from Kraken API
 * Used by both analyzer and orchestrator
 */

import { logger } from '@/lib/logger';
import type { OHLCCandle } from '@/types/ai';

/**
 * Fetch real OHLC data from Kraken public API
 * Falls back to database if Kraken unavailable
 */
export async function fetchKrakenOHLC(
  pair: string,
  limit: number = 100,
  timeframe: string = '15m'
): Promise<OHLCCandle[]> {
  try {
    logger.debug('Fetching OHLC data from Kraken API', { pair, limit, timeframe });

    const krakenPair = mapPairToKraken(pair);
    const url = new URL(`https://api.kraken.com/0/public/OHLC`);
    url.searchParams.append('pair', krakenPair);

    // Map timeframe to Kraken interval (in minutes)
    const intervalMap: Record<string, string> = {
      '15m': '15',
      '1h': '60',
      '4h': '240',
      '1d': '1440',
    };
    const interval = intervalMap[timeframe] || '60'; // Default to 1h
    url.searchParams.append('interval', interval);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Kraken API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken error: ${data.error[0]}`);
    }

    // Kraken returns candles under the pair key
    let candles: any[] = [];
    for (const key of Object.keys(data.result)) {
      if (Array.isArray(data.result[key])) {
        candles = data.result[key];
        break;
      }
    }

    if (candles.length === 0) {
      throw new Error('No candle data returned from Kraken');
    }

    // Convert Kraken format to OHLCCandle (remove incomplete candle at end)
    const ohlcCandles = candles
      .slice(0, -1) // Remove incomplete candle
      .slice(-limit) // Take last N candles
      .map((candle) => ({
        time: new Date(Number(candle[0]) * 1000),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[6]),
      }));

    logger.debug('Kraken OHLC data fetched successfully', {
      pair,
      candleCount: ohlcCandles.length,
      lastClose: ohlcCandles[ohlcCandles.length - 1]?.close,
    });

    return ohlcCandles;
  } catch (krakenError) {
    logger.debug('Failed to fetch from Kraken API', {
      pair,
      error: krakenError instanceof Error ? krakenError.message : String(krakenError),
    });

    // If Kraken fails, throw error - don't use stale/missing data
    throw krakenError instanceof Error ? krakenError : new Error(String(krakenError));
  }
}

/**
 * Map trading pair format from /nexusmeme (BTC/USD) to Kraken format (XXBTZUSD)
 */
function mapPairToKraken(pair: string): string {
  const mapping: Record<string, string> = {
    'BTC/USD': 'XXBTZUSD',
    'ETH/USD': 'XETHZUSD',
    'BTC/USDT': 'XBTUSDT',
    'ETH/USDT': 'ETHUSDT',
  };

  return mapping[pair] || pair.replace('/', '');
}
