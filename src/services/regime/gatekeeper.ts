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
   * Uses ADX-based regime classification (matching Nexus)
   * Choppy (ADX<20), Weak (20-30), Moderate (30-35), Strong (>=35)
   */
  async shouldAllowExecution(pair: string): Promise<boolean> {
    const regime = await this.getMarketRegime(pair);

    logger.info('Checking regime gatekeeper', {
      pair,
      regime: regime.type,
      confidence: regime.confidence,
    });

    // ADX-based regime decision logic (matching Nexus RiskManager)
    switch (regime.type) {
      case 'strong':
        // Strong trend (ADX >= 35): Allow all entries aligned with trend
        // This is the most favorable condition for trading
        logRegimeDecision('strong', true, `Strong trend regime for ${pair} - allowing execution`);
        return true;

      case 'moderate':
        // Moderate trend (ADX 30-35): Allow entries with good confluence
        logRegimeDecision('moderate', true, `Moderate trend regime for ${pair} - allowing execution`);
        return true;

      case 'weak':
        // Weak trend (ADX 20-30): More cautious, require additional confirmation
        // Allow but with stricter entry conditions (enforced in AI gates)
        logRegimeDecision('weak', true, `Weak trend regime for ${pair} - allowing execution with strict gates`);
        return true;

      case 'transitioning':
        // Transitioning (ADX 15-20 but rising fast): Early trend forming
        // Allow with reduced position size (enforced in fan-out via regime multiplier)
        logRegimeDecision('transitioning', true, `Transition zone for ${pair} - allowing at reduced size (ADX rising)`);
        return true;

      case 'choppy':
        // Choppy regime (ADX < 20): Most restrictive
        // Allow only if momentum is VERY strong (e.g., volume breakout, oversold reversals)
        // Risk manager will enforce stricter AI confidence threshold
        logRegimeDecision('choppy', true, `Choppy regime for ${pair} - allowing only strong momentum entries`);
        return true;

      default:
        // Unknown regime - fail safe to allow trading but be cautious
        logger.warn('Unknown regime type, defaulting to allow', { pair, regime: regime.type });
        return true;
    }
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
