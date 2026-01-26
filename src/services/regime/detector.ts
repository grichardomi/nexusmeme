import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { calculateTechnicalIndicators, detectMarketRegime } from '@/services/ai/market-analysis';
import type { MarketRegime, RegimeType } from '@/types/market';
import type { OHLCCandle } from '@/types/ai';

/**
 * Market Regime Detector
 * Fetches market data, calculates indicators, detects regime, and stores in database
 * No mock data - all real API calls
 */
class RegimeDetector {
  /**
   * Detect and store market regime for a pair
   * @param pair Trading pair (e.g., BTC/USD)
   * @param exchange Exchange to use for market data (e.g., 'kraken', 'binance')
   */
  async detectAndStoreRegime(pair: string, exchange: string = 'binance'): Promise<{ type: RegimeType; confidence: number; reason: string; timestamp: Date } | null> {
    try {
      logger.debug('Detecting market regime for pair', { pair, exchange });

      const adapter = getExchangeAdapter(exchange);

      // Fetch 1h OHLCV data (100 candles = ~4 days of data)
      const ohlcv = await adapter.getOHLCV(pair, '1h', 100);

      if (!ohlcv || ohlcv.length < 26) {
        logger.warn('Insufficient OHLCV data for regime detection', {
          pair,
          candles: ohlcv?.length || 0,
        });
        return null;
      }

      // CRITICAL: Use only the most recent candles for regime detection
      // Kraken may return more than requested (e.g., 721 instead of 100)
      // Using all of them would make regime detection look at 30+ days of history
      // instead of recent 4 days, causing stale bearish signals when price is rising
      const recentCandles = ohlcv.slice(-100); // Use last 100 candles max
      logger.debug('Regime detection candle selection', {
        pair,
        totalFetched: ohlcv.length,
        used: recentCandles.length,
      });

      // Convert to OHLCCandle format expected by analysis functions
      const candles: OHLCCandle[] = recentCandles.map((candle: any) => ({
        time: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }));

      // Calculate technical indicators
      const indicators = calculateTechnicalIndicators(candles);

      // Detect regime
      const analysis = detectMarketRegime(candles, indicators);

      logger.debug('Market regime detected', {
        pair,
        regime: analysis.regime,
        confidence: analysis.confidence,
      });

      // No mapping needed - analysis.regime is already ADX-based (choppy/weak/moderate/strong)
      // This matches Nexus regime classification system
      const regimeForDb: RegimeType = analysis.regime as RegimeType;

      // Store in database with pair for per-pair tracking
      await query(
        `INSERT INTO market_regime (id, pair, timestamp, regime, confidence, reason)
         VALUES (gen_random_uuid(), $1, NOW(), $2, $3, $4)`,
        [pair, regimeForDb, analysis.confidence, analysis.analysis]
      );

      return {
        type: regimeForDb,
        confidence: analysis.confidence,
        reason: analysis.analysis,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to detect market regime', error instanceof Error ? error : null, {
        pair,
      });
      return null;
    }
  }

  /**
   * Detect regime for multiple pairs (e.g., all trading pairs)
   * @param pairs Trading pairs (e.g., ['BTC/USD', 'ETH/USD'])
   * @param exchange Exchange to use for market data (e.g., 'kraken', 'binance')
   */
  async detectRegimeForAllPairs(pairs: string[], exchange: string = 'binance'): Promise<Map<string, { type: RegimeType; confidence: number; reason: string; timestamp: Date } | null>> {
    const results = new Map<string, MarketRegime | null>();

    for (const pair of pairs) {
      const regime = await this.detectAndStoreRegime(pair, exchange);
      results.set(pair, regime);
    }

    logger.debug('Regime detection complete for all pairs', {
      pairCount: pairs.length,
      successCount: Array.from(results.values()).filter(r => r !== null).length,
    });

    return results;
  }

  /**
   * Get latest regime for a pair (from database, not cached)
   * Uses per-pair regime tracking via pair column
   */
  async getLatestRegime(pair: string): Promise<{ type: RegimeType; confidence: number; reason: string; timestamp: Date } | null> {
    try {
      const result = await query<{
        regime: string;
        confidence: number;
        reason: string;
        created_at: string;
      }>(
        `SELECT regime, confidence, reason, created_at
         FROM market_regime
         WHERE pair = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [pair]
      );

      if (result && result.length > 0) {
        const row = result[0];
        return {
          type: row.regime as RegimeType,
          confidence: Number(row.confidence),
          reason: row.reason,
          timestamp: new Date(row.created_at),
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get latest regime', error instanceof Error ? error : null, {
        pair,
      });
      return null;
    }
  }
}

// Singleton instance
export const regimeDetector = new RegimeDetector();
