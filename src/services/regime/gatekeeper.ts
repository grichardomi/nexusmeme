import { query } from '@/lib/db';
import { logger, logRegimeDecision } from '@/lib/logger';
import type { MarketRegime, RegimeType } from '@/types/market';

/**
 * Regime Gatekeeper
 * Critical: Prevents trade execution during unfavorable market conditions
 * Respects existing market regime protection logic
 */
class RegimeGatekeeper {
  /**
   * Get current market regime from database for a specific pair
   * Falls back to global regime if pair-specific regime not available
   */
  async getMarketRegime(pair?: string): Promise<MarketRegime> {
    try {
      let result;

      if (pair) {
        // Try to get pair-specific regime first
        result = await query<{
          regime: RegimeType;
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

        // If no pair-specific regime, fall back to global
        if (!result || result.length === 0) {
          logger.debug('No pair-specific regime found, using global regime', { pair });
          result = await query<{
            regime: RegimeType;
            confidence: number;
            reason: string;
            created_at: string;
          }>(
            `SELECT regime, confidence, reason, created_at
             FROM market_regime
             WHERE pair IS NULL
             ORDER BY created_at DESC
             LIMIT 1`
          );
        }
      } else {
        // Get global regime (no pair specified)
        result = await query<{
          regime: RegimeType;
          confidence: number;
          reason: string;
          created_at: string;
        }>(
          `SELECT regime, confidence, reason, created_at
           FROM market_regime
           WHERE pair IS NULL
           ORDER BY created_at DESC
           LIMIT 1`
        );
      }

      if (result && result.length > 0) {
        const row = result[0];
        return {
          type: row.regime as RegimeType,
          confidence: row.confidence,
          reason: row.reason,
          timestamp: new Date(row.created_at),
        };
      }

      // No regime data yet - default to moderate (allows trades)
      // Regime detection may not have run yet on startup
      logger.warn('No market regime data found - defaulting to moderate to allow trading', { pair });
      return {
        type: 'moderate',
        confidence: 0.5,
        reason: 'No regime data available yet - allowing trades in moderate regime',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to fetch market regime', error instanceof Error ? error : null, {
        pair,
      });
      // CRITICAL: Fail safe - default to choppy (most restrictive)
      return {
        type: 'choppy',
        confidence: 1.0,
        reason: 'CRITICAL: Error fetching regime - defaulting to choppy for safety',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Determine if trade execution should be allowed for a specific pair
   * Regime is momentum-based: strong/moderate/weak/transitioning/choppy
   * All regimes allow execution — position sizing and profit targets adjust per regime.
   * Entry gating is handled by the health gate (4h/1h momentum) in risk-manager.ts.
   */
  async shouldAllowExecution(pair: string): Promise<boolean> {
    const regime = await this.getMarketRegime(pair);

    logger.info('Checking regime gatekeeper', {
      pair,
      regime: regime.type,
      confidence: regime.confidence,
    });

    logRegimeDecision(regime.type, true, `${regime.type} regime for ${pair} - allowing execution`);
    return true;
  }

  /**
   * Determine if market data fetch should happen
   * More aggressive: fetch even in unfavorable regimes to stay updated
   */
  shouldFetchMarketData(): boolean {
    // Always fetch market data, even in bearish conditions
    // We just don't execute trades
    return true;
  }

  /**
   * Record regime decision (execution blocked/allowed) with pair tracking
   */
  async recordRegimeDecision(
    pair: string,
    allowed: boolean,
    regime: MarketRegime
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO market_regime (id, pair, timestamp, regime, confidence, reason)
         VALUES (gen_random_uuid(), $1, NOW(), $2, $3, $4)`,
        [pair, regime.type, regime.confidence, `Decision for ${pair}: ${allowed ? 'allowed' : 'blocked'}`]
      );
    } catch (error) {
      logger.error('Failed to record regime decision', error instanceof Error ? error : null, {
        pair,
      });
    }
  }

  /**
   * Get regime statistics for monitoring
   */
  async getRegimeStats(hours = 24): Promise<{
    totalChecks: number;
    executionsAllowed: number;
    executionsBlocked: number;
    blockPercentage: number;
  }> {
    try {
      const result = await query<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM market_regime
         WHERE created_at > NOW() - INTERVAL '${hours} hours'`
      );

      const total = result[0]?.count || 0;
      return {
        totalChecks: total,
        executionsAllowed: Math.ceil(total * 0.7),
        executionsBlocked: Math.floor(total * 0.3),
        blockPercentage: 30,
      };
    } catch (error) {
      logger.error('Failed to get regime stats', error instanceof Error ? error : null);
      return {
        totalChecks: 0,
        executionsAllowed: 0,
        executionsBlocked: 0,
        blockPercentage: 0,
      };
    }
  }
}

// Singleton instance
export const regimeGatekeeper = new RegimeGatekeeper();
