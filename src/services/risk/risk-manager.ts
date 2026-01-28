/**
 * Risk Manager - 5-Stage Risk Filter (ported from /nexus)
 *
 * Multi-bot compatible: Calculates risk decision once per pair,
 * applied to all bots trading that pair
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import type { TechnicalIndicators } from '@/types/ai';

export interface RiskFilterResult {
  pass: boolean;
  reason?: string;
  stage?: string;
  adx?: number;
  btcMomentum1h?: number;
}

export interface MarketData {
  pair: string;
  price: number;
  ticker?: {
    bid?: number;
    ask?: number;
    last?: number;
  };
}

class RiskManager {
  private btcMomentum1h = 0; // Updated per trading iteration
  private hasCreepingUptrend = false; // Skip price top check in uptrends
  private config = {
    minADXForEntry: 20,
    btcDumpThreshold1h: -0.015,
    volumeSpikeMax: 3.0,
    spreadMaxPercent: 0.005,
    priceTopThreshold: 0.995,
    rsiExtremeOverbought: 85,
    minMomentum1h: 0.005,
    minMomentum4h: 0.005,
    volumeBreakoutRatio: 1.3,
    aiMinConfidence: 70,
    profitTargetMinimum: 0.005,
    pyramidL1ConfidenceMin: 85,
    pyramidL2ConfidenceMin: 90,
  };

  /**
   * Initialize RiskManager with bot config (risk management from bot config)
   * Pyramiding confidence thresholds remain in environment variables (system-wide)
   * Creeping uptrend mode can override momentum thresholds when enabled
   * Called once per orchestrator cycle with the bot's config
   * @param botConfig - Bot configuration object
   * @param exchange - Exchange name (kraken or binance) to determine which pyramid env vars to use
   */
  initializeFromBotConfig(botConfig: Record<string, any>, exchange: string = 'kraken'): void {
    const env = getEnvironmentConfig();
    let minMomentum1h = parseFloat(botConfig?.minMomentum1h || '0.005');
    let minMomentum4h = parseFloat(botConfig?.minMomentum4h || '0.005');
    let volumeBreakoutRatio = parseFloat(botConfig?.volumeBreakoutRatio || '1.3');
    let priceTopThreshold = parseFloat(botConfig?.priceTopThreshold || '0.995');

    // Apply creeping uptrend mode if enabled
    if (env.CREEPING_UPTREND_ENABLED) {
      this.hasCreepingUptrend = true;
      minMomentum1h = Math.min(minMomentum1h, env.CREEPING_UPTREND_MIN_MOMENTUM);
      minMomentum4h = Math.min(minMomentum4h, env.CREEPING_UPTREND_MIN_MOMENTUM);
      volumeBreakoutRatio = Math.max(env.CREEPING_UPTREND_VOLUME_RATIO_MIN, 0.1); // Floor at 0.1
      priceTopThreshold = env.CREEPING_UPTREND_PRICE_TOP_THRESHOLD; // Allow 1% from high
      logger.info('RiskManager: Creeping uptrend mode ENABLED', {
        minMomentum1h,
        minMomentum4h,
        volumeBreakoutRatio,
        priceTopThreshold,
        skipPriceTopCheck: true,
      });
    } else {
      this.hasCreepingUptrend = false;
    }

    // Determine pyramid env var prefix based on exchange (kraken vs binance)
    const exchangePrefix = exchange.toLowerCase() === 'binance' ? 'BINANCE_BOT' : 'KRAKEN_BOT';

    // Environment variables are authoritative for RISK_* settings (system-wide governance)
    // This ensures new .env.local settings override stale botConfig values in database
    this.config = {
      minADXForEntry: parseFloat(env.RISK_MIN_ADX_FOR_ENTRY.toString()),
      btcDumpThreshold1h: parseFloat(env.RISK_BTC_DUMP_THRESHOLD.toString()),
      volumeSpikeMax: parseFloat(env.RISK_VOLUME_SPIKE_MAX.toString()),
      spreadMaxPercent: parseFloat(env.RISK_SPREAD_MAX_PERCENT.toString()),
      priceTopThreshold,
      rsiExtremeOverbought: parseFloat(env.RISK_RSI_EXTREME_OVERBOUGHT.toString()),
      minMomentum1h,
      minMomentum4h,
      volumeBreakoutRatio,
      aiMinConfidence: parseFloat(env.AI_MIN_CONFIDENCE_THRESHOLD.toString()),
      profitTargetMinimum: parseFloat(env.RISK_PROFIT_TARGET_MINIMUM.toString()),
      // Pyramid confidence minimums from environment (system-wide, not per-bot)
      // Routes to correct pyramid env vars based on exchange type
      pyramidL1ConfidenceMin: parseFloat(process.env[`${exchangePrefix}_PYRAMID_L1_CONFIDENCE_MIN`] || '85'),
      pyramidL2ConfidenceMin: parseFloat(process.env[`${exchangePrefix}_PYRAMID_L2_CONFIDENCE_MIN`] || '90'),
    };
    logger.debug('RiskManager initialized from bot config + environment', {
      exchange,
      exchangePrefix,
      config: this.config,
    });
  }

  /**
   * Update BTC momentum for drop protection checks
   * Called once per trading iteration for all pairs
   */
  updateBTCMomentum(momentum: number): void {
    this.btcMomentum1h = momentum;
    logger.debug('RiskManager: BTC momentum updated', { btcMomentum1h: this.btcMomentum1h });
  }

  /**
   * STAGE 1: Health Gate - Check AI rate limits and choppy market detection
   * Only checks ADX if available (matches /nexus behavior)
   */
  checkHealthGate(adx: number): RiskFilterResult {
    logger.debug('RiskManager: Stage 1 - Health Gate', { adx });

    // Check for choppy market (ADX < 20) - but ONLY if ADX is actually calculated
    // If ADX is 0 or undefined, it means market data is missing, so skip this check
    if (adx > 0 && adx < this.config.minADXForEntry) {
      logger.info('RiskManager: Entry blocked - choppy market detected', {
        adx,
        threshold: this.config.minADXForEntry,
      });
      return {
        pass: false,
        reason: `Choppy market (ADX=${adx.toFixed(2)} < ${this.config.minADXForEntry})`,
        stage: 'Health Gate',
        adx,
      };
    }

    return { pass: true, stage: 'Health Gate', adx };
  }

  /**
   * STAGE 2: Drop Protection - Prevent entries during market panics
   */
  checkDropProtection(
    pair: string,
    ticker: { bid?: number; ask?: number; last?: number } | Record<string, any>,
    indicators: TechnicalIndicators
  ): RiskFilterResult {
    logger.debug('RiskManager: Stage 2 - Drop Protection', { pair, btcMomentum1h: this.btcMomentum1h });

    // Altcoin protection: Block if BTC is dumping (skip for BTC pairs themselves)
    const isBtcPair = pair.startsWith('BTC/');
    if (!isBtcPair && this.btcMomentum1h < this.config.btcDumpThreshold1h) {
      logger.info('RiskManager: Entry blocked - BTC dumping', {
        pair,
        btcMomentum1h: this.btcMomentum1h.toFixed(4),
        threshold: this.config.btcDumpThreshold1h,
      });
      return {
        pass: false,
        reason: `BTC dumping (${(this.btcMomentum1h * 100).toFixed(2)}% < ${(this.config.btcDumpThreshold1h * 100).toFixed(1)}%)`,
        stage: 'Drop Protection',
        btcMomentum1h: this.btcMomentum1h,
      };
    }

    // Volume panic check: 3x volume = panic selling
    const volumeRatio = indicators.volumeRatio ?? 1;
    if (volumeRatio > this.config.volumeSpikeMax) {
      logger.info('RiskManager: Entry blocked - volume panic spike', {
        pair,
        volumeRatio: volumeRatio.toFixed(2),
        threshold: this.config.volumeSpikeMax,
      });
      return {
        pass: false,
        reason: `Volume panic spike (${volumeRatio.toFixed(2)}x > ${this.config.volumeSpikeMax}x)`,
        stage: 'Drop Protection',
      };
    }

    // Spread widening check (liquidity drying up)
    if (ticker.bid && ticker.ask) {
      const spread = (ticker.ask - ticker.bid) / ticker.bid;
      if (spread > this.config.spreadMaxPercent) {
        logger.info('RiskManager: Entry blocked - spread widening', {
          pair,
          spread: (spread * 100).toFixed(3),
          threshold: (this.config.spreadMaxPercent * 100).toFixed(2),
        });
        return {
          pass: false,
          reason: `Spread widening (${(spread * 100).toFixed(3)}% > ${(this.config.spreadMaxPercent * 100).toFixed(2)}%)`,
          stage: 'Drop Protection',
        };
      }
    }

    return { pass: true, stage: 'Drop Protection' };
  }

  /**
   * STAGE 3: Entry Quality Gate - Avoid poor entry conditions
   */
  checkEntryQuality(
    pair: string,
    price: number,
    indicators: TechnicalIndicators
  ): RiskFilterResult {
    logger.debug('RiskManager: Stage 3 - Entry Quality', { pair, price });

    const recentHigh = indicators.recentHigh ?? price;
    const momentum1h = indicators.momentum1h ?? 0;
    const momentum4h = indicators.momentum4h ?? 0;
    const volumeRatio = indicators.volumeRatio ?? 1;

    // Price top check: different logic for creeping uptrend vs normal mode
    if (this.hasCreepingUptrend) {
      // CREEPING UPTREND MODE: Catch uptrends by allowing near-highs
      // BUT block if price has pulled back too much from high (configurable via env)
      const env = getEnvironmentConfig();
      const pullbackThreshold = env.CREEPING_UPTREND_PULLBACK_THRESHOLD; // From environment (default 0.95 = 5% pullback)
      if (price < recentHigh * pullbackThreshold) {
        const pullbackPercent = (1 - price / recentHigh) * 100;
        const pullbackThresholdPercent = (1 - pullbackThreshold) * 100;
        logger.info('RiskManager: Entry blocked - price too far from high (creeping uptrend)', {
          pair,
          price: price.toFixed(2),
          recentHigh: recentHigh.toFixed(2),
          pullbackPercent: pullbackPercent.toFixed(2),
          pullbackThresholdPercent: pullbackThresholdPercent.toFixed(1),
          pullbackThreshold: pullbackThreshold.toFixed(4),
          creepingUptrendMode: true,
        });
        return {
          pass: false,
          reason: `Price pulled back too far from high (${pullbackPercent.toFixed(2)}% > ${pullbackThresholdPercent.toFixed(1)}% threshold)`,
          stage: 'Entry Quality',
        };
      }
    } else {
      // NORMAL MODE: Avoid buying at local tops
      // Block if price is within 0.5% of recent high
      const topThreshold = this.config.priceTopThreshold; // 0.995
      if (price > recentHigh * topThreshold) {
        logger.info('RiskManager: Entry blocked - price at local top', {
          pair,
          price: price.toFixed(2),
          recentHigh: recentHigh.toFixed(2),
          topThreshold: (topThreshold * 100).toFixed(2),
          creepingUptrendMode: false,
        });
        return {
          pass: false,
          reason: `Price at local top (${(price / recentHigh * 100 - 100).toFixed(2)}% from high)`,
          stage: 'Entry Quality',
        };
      }
    }

    // Avoid extreme overbought (RSI > 85)
    if (indicators.rsi > this.config.rsiExtremeOverbought) {
      logger.info('RiskManager: Entry blocked - extreme overbought', {
        pair,
        rsi: indicators.rsi.toFixed(2),
        threshold: this.config.rsiExtremeOverbought,
      });
      return {
        pass: false,
        reason: `Extreme overbought (RSI=${indicators.rsi.toFixed(2)} > ${this.config.rsiExtremeOverbought})`,
        stage: 'Entry Quality',
      };
    }

    // Require minimum momentum - multiple entry paths (matches /nexus)
    const has1hMomentum = momentum1h > this.config.minMomentum1h;
    const hasBothPositive =
      momentum1h > this.config.minMomentum1h &&
      momentum4h > this.config.minMomentum4h;
    const hasVolumeBreakout =
      volumeRatio > this.config.volumeBreakoutRatio &&
      momentum1h > 0;

    // Creeping uptrend mode: also allow low-volume positive momentum
    const env = getEnvironmentConfig();
    const hasCreepingUptrend =
      env.CREEPING_UPTREND_ENABLED &&
      momentum1h > 0 &&
      volumeRatio >= env.CREEPING_UPTREND_VOLUME_RATIO_MIN;

    const passesEntryGate = has1hMomentum || hasBothPositive || hasVolumeBreakout || hasCreepingUptrend;

    if (!passesEntryGate) {
      logger.info('RiskManager: Entry blocked - weak momentum', {
        pair,
        momentum1h: (momentum1h * 100).toFixed(2),
        momentum4h: (momentum4h * 100).toFixed(2),
        volumeRatio: volumeRatio.toFixed(2),
        has1hMomentum,
        hasBothPositive,
        hasVolumeBreakout,
        hasCreepingUptrend,
      });
      return {
        pass: false,
        reason: `Weak momentum (1h=${(momentum1h * 100).toFixed(2)}%, 4h=${(momentum4h * 100).toFixed(2)}%, vol=${volumeRatio.toFixed(2)}x)`,
        stage: 'Entry Quality',
      };
    }

    return { pass: true, stage: 'Entry Quality' };
  }

  /**
   * STAGE 4: AI Validation Gate
   * Validates AI confidence threshold
   * CRITICAL: Uses simple base threshold matching Nexus behavior
   * Nexus trades successfully with 70% confidence across all regimes
   * Regime-dependent adjustment was causing inverted logic:
   *  - AI generates lower confidence (62%) in weak regimes
   *  - RiskManager was requiring HIGHER threshold (75%) in weak regimes
   *  - This is backwards: weak trends should have easier entry
   * Solution: Use simple base threshold (70%) like Nexus does
   */
  getAIConfidenceThreshold(): number {
    // Simple base threshold matching Nexus behavior
    // All regimes use same threshold: 70%
    // The AI prompt already adjusts confidence generation by regime
    // No need to double-adjust with regime-dependent thresholds
    return this.config.aiMinConfidence; // Base 70% for all regimes
  }

  checkAIValidation(aiConfidence: number, thresholdOverride?: number): RiskFilterResult {
    const threshold = thresholdOverride ?? this.config.aiMinConfidence;
    logger.debug('RiskManager: Stage 4 - AI Validation', { aiConfidence, threshold });

    if (aiConfidence < threshold) {
      logger.info('RiskManager: Entry blocked - low AI confidence', {
        aiConfidence,
        threshold,
        gap: threshold - aiConfidence,
      });
      return {
        pass: false,
        reason: `Low AI confidence (${aiConfidence}% < ${threshold}%)`,
        stage: 'AI Validation',
      };
    }

    return { pass: true, stage: 'AI Validation' };
  }

  /**
   * STAGE 5: Cost Floor Validation Gate
   * Ensures profit target covers costs with margin
   */
  checkCostFloor(
    pair: string,
    _entryPrice: number,
    _exitPrice: number,
    profitTargetPercent: number,
    exchangeFeePercent: number = 0.003 // Kraken: 0.16-0.26% = ~0.3% round trip
  ): RiskFilterResult {
    logger.debug('RiskManager: Stage 5 - Cost Floor', { pair, profitTargetPercent });

    // Calculate total costs
    const spreadPercent = 0.00003; // 0.003% for liquid pairs
    const slippagePercent = 0.0001; // 0.01% conservative estimate
    const totalCostsPercent = exchangeFeePercent + spreadPercent + slippagePercent;

    // Cost floor: profit must be 3× costs minimum (3.0 multiplier)
    const costFloorPercent = totalCostsPercent * 3.0;

    if (profitTargetPercent < costFloorPercent) {
      logger.info('RiskManager: Entry blocked - cost floor not met', {
        pair,
        profitTargetPercent: (profitTargetPercent * 100).toFixed(3),
        totalCostsPercent: (totalCostsPercent * 100).toFixed(3),
        costFloorPercent: (costFloorPercent * 100).toFixed(3),
        multiplier: (profitTargetPercent / totalCostsPercent).toFixed(2),
      });
      return {
        pass: false,
        reason: `Cost floor not met (profit=${(profitTargetPercent * 100).toFixed(3)}% < costs×3=${(costFloorPercent * 100).toFixed(3)}%)`,
        stage: 'Cost Floor',
      };
    }

    // Also check risk/reward ratio
    const riskRewardRatio = profitTargetPercent / totalCostsPercent;
    if (riskRewardRatio < 2.0) {
      logger.info('RiskManager: Entry blocked - poor risk/reward ratio', {
        pair,
        riskRewardRatio: riskRewardRatio.toFixed(2),
        minimumRatio: 2.0,
      });
      return {
        pass: false,
        reason: `Poor risk/reward ratio (${riskRewardRatio.toFixed(2)}:1 < 2:1)`,
        stage: 'Cost Floor',
      };
    }

    return { pass: true, stage: 'Cost Floor' };
  }

  /**
   * Classify market regime based on ADX
   */
  getRegime(adx: number): string {
    if (adx < 20) return 'choppy';
    if (adx < 30) return 'weak';
    if (adx < 35) return 'moderate';
    return 'strong';
  }

  /**
   * Get erosion cap based on regime AND trade size
   * CHANGED: Now scales tolerance based on peak profit percentage
   * Philosophy: "Never let profit slip away" - protect gains aggressively
   *
   * Dynamic scaling by trade size:
   * - Tiny profits (<0.5%): 25% tolerance → erode max 0.125% from 0.5% peak
   * - Small profits (0.5-1%): 35% tolerance → more room but still protected
   * - Medium profits (1-2%): 45% tolerance → balanced protection
   * - Large profits (>2%): 50% tolerance → lock in half of big winners
   *
   * Example: Peak +5% → Exit at +2.5% (protected 50% of gains)
   *
   * CRITICAL: Trade must still be green (positive) to exit via erosion cap
   * Losses are handled by underwater timeout, not erosion cap
   */
  getErosionCap(regime: string, _peakProfitPct?: number): number {
    // Erosion cap by regime - fully configurable via env
    // Philosophy: Lock profits, re-enter if conditions warrant
    const env = getEnvironmentConfig();
    const toleranceByRegime: Record<string, number> = {
      choppy: env.EROSION_CAP_CHOPPY,     // tight for scalping
      weak: env.EROSION_CAP_WEAK,         // tight for weak trends
      moderate: env.EROSION_CAP_MODERATE, // balanced
      strong: env.EROSION_CAP_STRONG,     // let trends run
    };

    return toleranceByRegime[regime] || env.EROSION_CAP_MODERATE || 0.30;
  }

  /**
   * Get profit target based on regime (adaptive strategy)
   */
  getProfitTarget(regime: string): number {
    // Dynamic profit targets by regime (from /nexus design)
    const targets: Record<string, number> = {
      choppy: 0.02,    // 2% in choppy markets
      weak: 0.045,     // 4.5% in weak trends
      moderate: 0.065, // 6.5% in moderate trends
      strong: 0.12,    // 12% in strong trends
    };
    return targets[regime] || 0.10;
  }

  /**
   * Check if pyramid level meets minimum confidence requirement (from /nexus)
   * L1: Requires 85% AI confidence
   * L2: Requires 90% AI confidence
   */
  canAddPyramidLevel(level: 1 | 2, aiConfidence: number): { pass: boolean; reason?: string } {
    const minRequired = level === 1 ? this.config.pyramidL1ConfidenceMin : this.config.pyramidL2ConfidenceMin;

    if (aiConfidence < minRequired) {
      return {
        pass: false,
        reason: `L${level} requires ${minRequired}% confidence (got ${aiConfidence}%) - pyramid rejected`,
      };
    }

    return { pass: true };
  }

  /**
   * Run full 5-stage risk filter (stages 1-3 for pre-AI entry validation)
   * Stages 4-5 (AI Validation, Cost Floor) run separately after AI signal
   *
   * @param pair - Trading pair (e.g., "BTC/USD")
   * @param price - Current price
   * @param indicators - Technical indicators (ADX, momentum, RSI, etc.)
   * @param ticker - Ticker data with bid/ask for spread calculation
   * @param profitTarget - Expected profit target price (for cost floor check)
   * @returns RiskFilterResult with pass/fail and reason
   */
  async runFullRiskFilter(
    pair: string,
    price: number,
    indicators: TechnicalIndicators,
    ticker: { bid?: number; ask?: number; last?: number; spread?: number },
    profitTarget: number
  ): Promise<RiskFilterResult> {
    const adx = indicators.adx ?? 0;

    // STAGE 1: Health Gate - Check ADX for choppy markets
    const stage1 = this.checkHealthGate(adx);
    if (!stage1.pass) {
      return stage1;
    }

    // STAGE 2: Drop Protection - BTC dump, volume panic, spread widening
    const stage2 = this.checkDropProtection(pair, ticker, indicators);
    if (!stage2.pass) {
      return stage2;
    }

    // STAGE 3: Entry Quality - Price top, overbought, momentum
    const stage3 = this.checkEntryQuality(pair, price, indicators);
    if (!stage3.pass) {
      return stage3;
    }

    // Stages 1-3 passed - ready for AI analysis
    // Stages 4 (AI Validation) and 5 (Cost Floor) run after AI signal
    logger.debug('RiskManager: Pre-AI stages (1-3) passed', {
      pair,
      adx: adx.toFixed(1),
      momentum1h: (indicators.momentum1h ?? 0).toFixed(3),
      profitTarget,
    });

    return {
      pass: true,
      stage: 'Pre-AI Filter Complete',
      adx,
    };
  }
}

export const riskManager = new RiskManager();
