/**
 * Risk Manager - 5-Stage Risk Filter (ported from /nexus)
 *
 * Multi-bot compatible: Calculates risk decision once per pair,
 * applied to all bots trading that pair
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig, getExchangeTakerFee } from '@/config/environment';
import type { TechnicalIndicators } from '@/types/ai';

export interface RiskFilterResult {
  pass: boolean;
  reason?: string;
  stage?: string;
  adx?: number;
  adxSlope?: number;
  btcMomentum1h?: number;
  isTransitioning?: boolean; // ADX 15-20 but slope rising fast — use reduced position size
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
    minMomentum1h: 1.0,   // 1.0% - must exceed Kraken's 0.52% fee drag (2× fees)
    minMomentum4h: 0.5,   // 0.5% - 4h confirmation threshold
    volumeBreakoutRatio: 1.3,
    minVolumeRatio: 0.50,
    aiMinConfidence: 70,
    profitTargetMinimum: 0.005,
    pyramidL1ConfidenceMin: 85,
    pyramidL2ConfidenceMin: 90,
    entryMinIntrabarMomentumChoppy: 0.05,
    entryMinIntrabarMomentumTrending: 0,
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
    // Momentum thresholds from ENVIRONMENT (authoritative, not stale botConfig)
    // RISK_MIN_MOMENTUM_1H is in percent form: 1.0 = 1.0%
    // Kraken needs higher threshold (0.52% round-trip fees) to ensure trades can overcome fee drag
    let minMomentum1h = parseFloat(env.RISK_MIN_MOMENTUM_1H?.toString() || '1.0');
    let minMomentum4h = parseFloat(env.RISK_MIN_MOMENTUM_4H?.toString() || '0.5');
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
      minVolumeRatio: parseFloat(env.RISK_MIN_VOLUME_RATIO.toString()),
      aiMinConfidence: parseFloat(env.AI_MIN_CONFIDENCE_THRESHOLD.toString()),
      profitTargetMinimum: parseFloat(env.RISK_PROFIT_TARGET_MINIMUM.toString()),
      entryMinIntrabarMomentumChoppy: parseFloat(env.ENTRY_MIN_INTRABAR_MOMENTUM_CHOPPY.toString()),
      entryMinIntrabarMomentumTrending: parseFloat(env.ENTRY_MIN_INTRABAR_MOMENTUM_TRENDING.toString()),
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
   * CRITICAL: Block entries when ADX < 20 (choppy market) - matches /nexus behavior
   * ADX slope enables transition zone detection: ADX 15-20 + rising fast → allow at 50% size
   */
  checkHealthGate(adx: number, adxSlope?: number, momentum1h?: number): RiskFilterResult {
    const slope = adxSlope ?? 0;
    const mom1h = momentum1h ?? 0;
    const env = getEnvironmentConfig();
    const transitionZoneMin = env.ADX_TRANSITION_ZONE_MIN; // 12 (lowered for momentum override)
    const slopeRisingThreshold = env.ADX_SLOPE_RISING_THRESHOLD; // +2.0/candle
    const momentumOverrideMin = env.MOMENTUM_OVERRIDE_MIN_1H; // 1.5% (clear directional move)

    // PROMINENT LOG: Always show ADX value + slope for debugging
    console.log(`\n🏥 HEALTH GATE: ADX = ${adx?.toFixed(1) || 'N/A'} (threshold: ${this.config.minADXForEntry}) | slope: ${slope.toFixed(2)}/candle`);
    logger.debug('RiskManager: Stage 1 - Health Gate', { adx, adxSlope: slope });

    // Block if ADX is missing/invalid (0 or undefined) - be conservative
    if (!adx || adx <= 0) {
      console.log(`\n🚫 BLOCKED: ADX unavailable/invalid (${adx}) - no entry allowed`);
      logger.info('RiskManager: Entry blocked - ADX unavailable (conservative block)', {
        adx,
        threshold: this.config.minADXForEntry,
      });
      return {
        pass: false,
        reason: `ADX unavailable or invalid (${adx}) - blocking entry`,
        stage: 'Health Gate',
        adx,
      };
    }

    // TRANSITION ZONE: ADX 15-20 but slope rising fast → trend is forming
    // Allow entry at reduced position size instead of hard block
    if (adx >= transitionZoneMin && adx < this.config.minADXForEntry && slope >= slopeRisingThreshold) {
      console.log(`\n🔄 TRANSITION ZONE: ADX=${adx.toFixed(1)} (${transitionZoneMin}-${this.config.minADXForEntry}) + slope=${slope.toFixed(2)} >= ${slopeRisingThreshold} → ALLOW at reduced size`);
      logger.info('RiskManager: Transition zone detected - allowing entry at reduced size', {
        adx,
        adxSlope: slope,
        slopeThreshold: slopeRisingThreshold,
        transitionZoneMin,
      });
      return {
        pass: true,
        stage: 'Health Gate',
        adx,
        adxSlope: slope,
        isTransitioning: true,
      };
    }

    // MOMENTUM OVERRIDE: ADX is low but price is clearly moving (strong 1h momentum)
    // ADX is a lagging indicator — when price breaks out, ADX takes several candles to catch up.
    // CRITICAL: Require BOTH slope + momentum to prevent false breakouts
    // - Slope confirms trend is FORMING (not just price spike)
    // - Momentum confirms price is MOVING directionally
    // - Together = strong signal that ADX will catch up
    if (adx >= transitionZoneMin && adx < this.config.minADXForEntry &&
        slope >= slopeRisingThreshold &&
        mom1h >= momentumOverrideMin) {
      console.log(`\n🚀 MOMENTUM OVERRIDE: ADX=${adx.toFixed(1)} (${transitionZoneMin}-${this.config.minADXForEntry}) + slope=${slope.toFixed(2)} >= ${slopeRisingThreshold} + momentum1h=${mom1h.toFixed(2)}% >= ${momentumOverrideMin}% → ALLOW at reduced size`);
      logger.info('RiskManager: Momentum override - slope + momentum confirm trend forming', {
        adx,
        adxSlope: slope,
        slopeThreshold: slopeRisingThreshold,
        momentum1h: mom1h,
        momentumOverrideThreshold: momentumOverrideMin,
        transitionZoneMin,
        note: 'BOTH slope + momentum required to prevent false breakouts',
      });
      return {
        pass: true,
        stage: 'Health Gate',
        adx,
        adxSlope: slope,
        isTransitioning: true,
      };
    }

    // Log when momentum override is blocked due to missing slope confirmation
    if (adx >= transitionZoneMin && adx < this.config.minADXForEntry && mom1h >= momentumOverrideMin && slope < slopeRisingThreshold) {
      console.log(`\n⚠️ MOMENTUM BLOCKED: Strong momentum (${mom1h.toFixed(2)}%) but slope too weak (${slope.toFixed(2)} < ${slopeRisingThreshold}) - prevents false breakouts`);
      logger.info('RiskManager: Momentum override blocked - slope confirmation missing', {
        adx,
        adxSlope: slope,
        slopeThreshold: slopeRisingThreshold,
        momentum1h: mom1h,
        reason: 'Prevents false breakouts - momentum alone insufficient without rising ADX slope',
      });
    }

    // /nexus parity: BLOCK entries in choppy markets (ADX < threshold)
    // Choppy markets have no clear direction → entries go immediately underwater
    if (adx < this.config.minADXForEntry) {
      console.log(`\n🚫 CHOPPY MARKET BLOCKED: ADX=${adx.toFixed(1)} < ${this.config.minADXForEntry} - no entry allowed`);
      logger.info('RiskManager: Entry blocked - choppy market (/nexus parity)', {
        adx,
        threshold: this.config.minADXForEntry,
      });
      return {
        pass: false,
        reason: `Choppy market (ADX ${adx.toFixed(1)} < ${this.config.minADXForEntry})`,
        stage: 'Health Gate',
        adx,
      };
    }

    console.log(`\n✅ TRENDING MARKET: ADX=${adx.toFixed(1)} >= ${this.config.minADXForEntry} | slope: ${slope.toFixed(2)}`);
    return { pass: true, stage: 'Health Gate', adx, adxSlope: slope };
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

    // Volume panic check (/nexus parity): ONLY block if high volume + selling pressure
    // High volume + positive momentum = healthy breakout (ALLOW)
    // High volume + negative momentum = panic selling (BLOCK)
    const volumeRatio = indicators.volumeRatio ?? 1;
    const momentum1h = indicators.momentum1h ?? 0;
    if (volumeRatio > this.config.volumeSpikeMax && momentum1h < -0.005) {
      logger.info('RiskManager: Entry blocked - volume panic spike with selling pressure', {
        pair,
        volumeRatio: volumeRatio.toFixed(2),
        threshold: this.config.volumeSpikeMax,
        momentum1h: momentum1h.toFixed(4),
      });
      return {
        pass: false,
        reason: `Volume panic spike (${volumeRatio.toFixed(2)}x + mom ${(momentum1h * 100).toFixed(2)}%)`,
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

    const env = getEnvironmentConfig();
    const recentHigh = indicators.recentHigh ?? price;
    const momentum1h = indicators.momentum1h ?? 0;
    const momentum4h = indicators.momentum4h ?? 0;
    const volumeRatio = indicators.volumeRatio ?? 1;
    const adx = indicators.adx ?? 0;

    // DYNAMIC REGIME-AWARE price top check:
    // In trending markets (ADX >= minADXForEntry), price near highs is NORMAL - that's where trends trade
    // In choppy/weak markets (ADX < minADXForEntry), buying at local tops is dangerous (mean reversion)
    // This replaces the static CREEPING_UPTREND_ENABLED flag with real-time ADX detection
    // CRITICAL: Must use same threshold as health gate (20) to avoid blocking valid entries (ADX 20-24)
    const isTrending = adx >= this.config.minADXForEntry;

    if (this.hasCreepingUptrend || isTrending) {
      // TRENDING MODE: Allow entries near highs (trends make new highs!)
      // Only block if price has pulled back too far from high (broken trend signal)
      const pullbackThreshold = env.CREEPING_UPTREND_PULLBACK_THRESHOLD; // default 0.95 = 5% pullback
      if (price < recentHigh * pullbackThreshold) {
        const pullbackPercent = (1 - price / recentHigh) * 100;
        const pullbackThresholdPercent = (1 - pullbackThreshold) * 100;
        logger.info('RiskManager: Entry blocked - price pulled back too far from high (trending mode)', {
          pair,
          price: price.toFixed(2),
          recentHigh: recentHigh.toFixed(2),
          pullbackPercent: pullbackPercent.toFixed(2),
          pullbackThresholdPercent: pullbackThresholdPercent.toFixed(1),
          adx: adx.toFixed(1),
          trendingMode: true,
        });
        return {
          pass: false,
          reason: `Price pulled back too far from high (${pullbackPercent.toFixed(2)}% > ${pullbackThresholdPercent.toFixed(1)}% threshold)`,
          stage: 'Entry Quality',
        };
      }
      logger.debug('RiskManager: Trending mode - allowing entry near highs', {
        pair,
        price: price.toFixed(2),
        recentHigh: recentHigh.toFixed(2),
        distFromHigh: ((1 - price / recentHigh) * 100).toFixed(2) + '%',
        adx: adx.toFixed(1),
      });
    } else {
      // CHOPPY MODE: Avoid buying at local tops (mean reversion risk)
      // Block if price is within 0.5% of recent high
      const topThreshold = this.config.priceTopThreshold; // 0.995
      if (price > recentHigh * topThreshold) {
        logger.info('RiskManager: Entry blocked - price at local top (choppy market)', {
          pair,
          price: price.toFixed(2),
          recentHigh: recentHigh.toFixed(2),
          topThreshold: (topThreshold * 100).toFixed(2),
          adx: adx.toFixed(1),
          trendingMode: false,
        });
        return {
          pass: false,
          reason: `Price at local top (${(price / recentHigh * 100 - 100).toFixed(2)}% from high, ADX ${adx.toFixed(0)} = choppy)`,
          stage: 'Entry Quality',
        };
      }
    }

    // EMA200 DOWNTREND FILTER - Prevents entries in downtrends
    // CRITICAL: ADX measures trend STRENGTH, not DIRECTION
    // High ADX can mean strong downtrend! Price > EMA200 confirms UPTREND
    // CONFIGURABLE: Can be disabled to catch reversal entries when price bounces from below EMA200
    const ema200 = (indicators as any).ema200;
    if (env.RISK_EMA200_DOWNTREND_BLOCK_ENABLED && ema200 && price < ema200) {
      const distanceFromEMA = ((price / ema200 - 1) * 100);
      logger.info('RiskManager: Entry blocked - price below EMA200 (downtrend)', {
        pair,
        price: price.toFixed(2),
        ema200: ema200.toFixed(2),
        distanceFromEMA: distanceFromEMA.toFixed(2) + '%',
        note: 'EMA200 downtrend protection - prevents false "strong" signals in falling markets',
      });
      console.log(`\n🚫 DOWNTREND BLOCKED: Price $${price.toFixed(2)} < EMA200 $${ema200.toFixed(2)} (${distanceFromEMA.toFixed(2)}%)`);
      return {
        pass: false,
        reason: `Downtrend: Price ${distanceFromEMA.toFixed(2)}% below EMA200`,
        stage: 'Entry Quality',
      };
    } else if (!env.RISK_EMA200_DOWNTREND_BLOCK_ENABLED && ema200 && price < ema200) {
      // Log but allow entry - catching reversal opportunities
      const distanceFromEMA = ((price / ema200 - 1) * 100);
      logger.info('RiskManager: Price below EMA200 but entry allowed (reversal mode)', {
        pair,
        price: price.toFixed(2),
        ema200: ema200.toFixed(2),
        distanceFromEMA: distanceFromEMA.toFixed(2) + '%',
        note: 'RISK_EMA200_DOWNTREND_BLOCK_ENABLED=false - allowing reversal entries',
      });
      console.log(`\n⚠️ REVERSAL MODE: Price $${price.toFixed(2)} < EMA200 $${ema200.toFixed(2)} (${distanceFromEMA.toFixed(2)}%) - entry allowed`);
    }

    // Avoid extreme overbought (RSI > 85) - matches /nexus exactly
    // FLAT block, no exceptions. /nexus uses RSI > 85 regardless of ADX/regime
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

    // Require minimum momentum - 3 entry paths (matches /nexus exactly)
    // Path 1: Strong 1h momentum exceeds configured threshold
    const has1hMomentum = momentum1h > this.config.minMomentum1h;
    // Path 2: Both timeframes show meaningful momentum (> minMomentum threshold)
    const hasBothPositive =
      momentum1h > this.config.minMomentum1h &&
      momentum4h > this.config.minMomentum4h;
    // Path 3: Volume breakout (vol > 1.3x) with ANY positive 1h momentum
    // /nexus uses momentum1h > 0 here — NOT the main threshold
    const hasVolumeBreakout =
      volumeRatio > this.config.volumeBreakoutRatio &&
      momentum1h > 0;

    // /nexus EXACT entry gate: 3 paths ONLY
    // 1. Strong 1h momentum (> 0.5%)
    // 2. Both timeframes positive (1h > 0.5% AND 4h > 0.5%)
    // 3. Volume breakout (vol > 1.3x AND 1h > 0%)
    // NO other overrides - no intrabar, no creeping uptrend, no bullish sentiment, no strong trend override
    const passesEntryGate = has1hMomentum || hasBothPositive || hasVolumeBreakout;

    if (!passesEntryGate) {
      logger.info('RiskManager: Entry blocked - weak momentum (/nexus 3-path gate)', {
        pair,
        momentum1h: momentum1h.toFixed(2),
        momentum4h: momentum4h.toFixed(2),
        volumeRatio: volumeRatio.toFixed(2),
        has1hMomentum,
        hasBothPositive,
        hasVolumeBreakout,
      });
      return {
        pass: false,
        reason: `Weak momentum (1h=${momentum1h.toFixed(2)}%, 4h=${momentum4h.toFixed(2)}%, vol=${volumeRatio.toFixed(2)}x)`,
        stage: 'Entry Quality',
      };
    }

    // Log which path allowed entry
    if (hasVolumeBreakout && !has1hMomentum && !hasBothPositive) {
      logger.info('RiskManager: Volume breakout entry', {
        pair,
        momentum1h: momentum1h.toFixed(2),
        volumeRatio: volumeRatio.toFixed(2),
      });
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
    exchange: string = 'kraken'
  ): RiskFilterResult {
    logger.debug('RiskManager: Stage 5 - Cost Floor', { pair, profitTargetPercent, exchange });

    // Use ACTUAL exchange-specific fees (round-trip: entry + exit)
    const exchangeFeePercent = getExchangeTakerFee(exchange) * 2; // Kraken: 0.0026*2 = 0.0052 (0.52%)

    // Calculate total costs
    const spreadPercent = 0.0005; // 0.05% for liquid pairs (realistic Kraken spread)
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
   * Classify market regime based on ADX (with optional slope for transition detection)
   */
  getRegime(adx: number, adxSlope?: number): string {
    const slope = adxSlope ?? 0;
    const env = getEnvironmentConfig();
    const transitionZoneMin = env.ADX_TRANSITION_ZONE_MIN;
    const slopeRisingThreshold = env.ADX_SLOPE_RISING_THRESHOLD;

    if (adx < transitionZoneMin) return 'choppy'; // Deep chop, no rescue
    if (adx < 20 && slope >= slopeRisingThreshold) return 'transitioning'; // Trend forming
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
      choppy: env.EROSION_CAP_CHOPPY,           // tight for scalping
      transitioning: env.EROSION_CAP_WEAK,      // same as weak (early trend, protect gains)
      weak: env.EROSION_CAP_WEAK,               // tight for weak trends
      moderate: env.EROSION_CAP_MODERATE,       // balanced
      strong: env.EROSION_CAP_STRONG,           // let trends run
    };

    return toleranceByRegime[regime] || env.EROSION_CAP_MODERATE || 0.30;
  }

  /**
   * Get profit target based on regime (adaptive strategy)
   * OPTIMIZED: Lower targets for weak/choppy to book profits faster
   * CRITICAL: Strong regime at 20% to give L2 pyramid room to develop (enters at +8%)
   */
  getProfitTarget(regime: string, adxSlope?: number): number {
    const env = getEnvironmentConfig();
    const slope = adxSlope ?? 0;
    const slopeFallingThreshold = env.ADX_SLOPE_FALLING_THRESHOLD; // -2.0/candle

    // Dynamic profit targets by regime — ALL from env vars (no hard-coded constants)
    const targets: Record<string, number> = {
      choppy: env.PROFIT_TARGET_CHOPPY,             // 1.5% default
      transitioning: env.PROFIT_TARGET_TRANSITIONING, // 2.5% default
      weak: env.PROFIT_TARGET_WEAK,                 // 2.5% default
      moderate: env.PROFIT_TARGET_MODERATE,          // 5.0% default
      strong: env.PROFIT_TARGET_STRONG,              // 20% default
    };

    let target = targets[regime] || env.PROFIT_TARGET_MODERATE; // Fallback to moderate

    // ADX slope downgrade: if trend is exhausting (falling fast), use lower target
    // Strong + falling fast → use moderate target (5% instead of 20%)
    // This prevents holding for 20% while the trend is dying
    if (regime === 'strong' && slope <= slopeFallingThreshold) {
      target = targets['moderate'];
      console.log(`📉 PROFIT TARGET DOWNGRADE: strong → moderate (ADX slope ${slope.toFixed(2)} <= ${slopeFallingThreshold})`);
      logger.info('RiskManager: Profit target downgraded due to ADX exhaustion', {
        regime,
        adxSlope: slope,
        originalTarget: (targets['strong'] * 100).toFixed(1) + '%',
        newTarget: (target * 100).toFixed(1) + '%',
      });
    }

    return target;
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
    _profitTarget?: number
  ): Promise<RiskFilterResult> {
    const adx = indicators.adx ?? 0;
    const adxSlope = indicators.adxSlope ?? 0;

    // STAGE 1: Health Gate - Check ADX for choppy markets (with slope + momentum override)
    const momentum1h = indicators.momentum1h ?? 0;
    const stage1 = this.checkHealthGate(adx, adxSlope, momentum1h);
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

    // STAGE 5: Cost Floor (/nexus parity - validate BEFORE AI to save API calls)
    // Use ADX-based profit target percentage (not dollar amount)
    const regime = this.getRegime(adx, adxSlope);
    const profitTargetPct = this.getProfitTarget(regime, adxSlope);
    const stage5 = this.checkCostFloor(pair, price, price, profitTargetPct);
    if (!stage5.pass) {
      return stage5;
    }

    logger.debug('RiskManager: All 5 stages passed (pre-AI)', {
      pair,
      adx: adx.toFixed(1),
      adxSlope: adxSlope.toFixed(2),
      regime,
      profitTargetPct: (profitTargetPct * 100).toFixed(2) + '%',
      momentum1h: (indicators.momentum1h ?? 0).toFixed(3),
      isTransitioning: stage1.isTransitioning ?? false,
    });

    return {
      pass: true,
      stage: 'All Stages Passed',
      adx,
      adxSlope,
      isTransitioning: stage1.isTransitioning,
    };
  }
}

export const riskManager = new RiskManager();
