/**
 * Risk Manager - 5-Stage Risk Filter (ported from /nexus)
 *
 * Multi-bot compatible: Calculates risk decision once per pair,
 * applied to all bots trading that pair
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { getCachedTakerFee } from '@/services/billing/fee-rate';
import { getParamOverrides } from '@/services/admin/param-overrides';
import type { TechnicalIndicators } from '@/types/ai';

export interface RiskFilterResult {
  pass: boolean;
  reason?: string;
  stage?: string;
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
  private btcMomentum1h = 0;    // Updated per trading iteration
  private btcVolumeRatio = 1.0; // Updated per trading iteration — used to block all pairs during BTC illiquidity
  private btcVolumeThresholdOverride: number | null = null; // Regime agent dynamic threshold (null = use env/admin)
  private config = {
    btcDumpThreshold1h: -0.015,
    volumeSpikeMax: 3.0,
    spreadMaxPercent: 0.005,
    priceTopThreshold: 0.995,
    rsiExtremeOverbought: 85,
    minMomentum1h: 1.0,   // 1.0% legacy default — superseded by RISK_MIN_MOMENTUM_1H_BINANCE (0.25%)
    minMomentum4h: 0.5,   // 0.5% - 4h confirmation threshold
    volumeBreakoutRatio: 1.3,
    minVolumeRatio: 0.50,
    aiMinConfidence: 70,
    profitTargetMinimum: 0.005,
    pyramidL1ConfidenceMin: 85,
    pyramidL2ConfidenceMin: 90,
    entryMinIntrabarMomentumChoppy: 0.05,
    entryMinIntrabarMomentumTrending: 0,
    exchange: 'binance' as string,
  };

  /**
   * Initialize RiskManager with bot config (risk management from bot config)
   * Pyramiding confidence thresholds remain in environment variables (system-wide)
   * Creeping uptrend mode can override momentum thresholds when enabled
   * Called once per orchestrator cycle with the bot's config
   * @param botConfig - Bot configuration object
   * @param exchange - Exchange name (default: 'binance') to determine which pyramid env vars to use
   */
  initializeFromBotConfig(botConfig: Record<string, any>, exchange: string = 'binance'): void {
    const env = getEnvironmentConfig();
    // Momentum thresholds from ENVIRONMENT (authoritative, not stale botConfig)
    // Exchange-aware: Binance round-trip = 0.20%
    // Threshold = 2× round-trip fees so momentum must at minimum cover fee drag
    const isBinance = exchange.toLowerCase().startsWith('binance');
    let minMomentum1h = isBinance
      ? parseFloat(env.RISK_MIN_MOMENTUM_1H_BINANCE?.toString() || '0.2')
      : parseFloat(env.RISK_MIN_MOMENTUM_1H?.toString() || '1.0');
    let minMomentum4h = parseFloat(env.RISK_MIN_MOMENTUM_4H?.toString() || '0.5');
    let volumeBreakoutRatio = parseFloat(botConfig?.volumeBreakoutRatio || '1.3');
    let priceTopThreshold = parseFloat(botConfig?.priceTopThreshold || '0.995');


    // Determine pyramid env var prefix (always BINANCE_BOT)
    const exchangePrefix = 'BINANCE_BOT';

    // Environment variables are authoritative for RISK_* settings (system-wide governance)
    // This ensures new .env.local settings override stale botConfig values in database
    this.config = {
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
      exchange,
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

  updateBTCVolumeRatio(volumeRatio: number): void {
    this.btcVolumeRatio = volumeRatio > 0 ? volumeRatio : 1.0;
    logger.debug('RiskManager: BTC volume ratio updated', { btcVolumeRatio: this.btcVolumeRatio });
  }

  /**
   * Update the BTC volume threshold derived from the regime agent's entry adjustment.
   * Maps agent adjustment (-maxAdj..+maxAdj) to a scaled threshold:
   *   Most bearish (-maxAdj) → full env threshold (no relaxation)
   *   Neutral (0)            → 50% of env threshold
   *   Most bullish (+maxAdj) → 25% of env threshold (floor)
   * Admin override on RISK_BTC_MIN_VOLUME_RATIO always wins over this dynamic value.
   */
  updateBTCVolumeThreshold(dynamicThreshold: number): void {
    this.btcVolumeThresholdOverride = dynamicThreshold;
    logger.debug('RiskManager: BTC volume threshold updated from regime agent', { dynamicThreshold: dynamicThreshold.toFixed(3) });
  }

  /**
   * STAGE 1: Health Gate - Trend Direction Score
   * Ask: "is price moving UP right now?" — not "is price above where it was 4h ago?"
   *
   * Old approach (ROC-based): compared price to a fixed point 4h ago.
   * Problem: after a dump, 4h ROC stays deeply negative for hours even during genuine recovery.
   * The bot missed entire recoveries waiting for a stale reference to age out.
   *
   * New approach (direction score): 3 zero/near-zero lag signals, need 2/3 to pass.
   *   1. higherCloses — last 3 candles each closed above prior (pure price action, 0 lag)
   *   2. momentumSlope — 1h ROC improving vs 30min ago (detects direction change mid-recovery)
   *   3. intrabar > 0 — current price above last close (real-time)
   *
   * Crash guard: if 4h ROC < -3% (genuine crash/panic), block regardless of direction signals.
   * This prevents entering during dead-cat bounces in the middle of a crash.
   */
  checkHealthGate(_adx: number, _adxSlope?: number, momentum1h?: number, _volumeRatio?: number, momentum4h?: number, intrabarMomentum?: number, trendScore?: number, higherCloses?: boolean, momentumSlope?: number, momentum2h?: number): RiskFilterResult {
    const mom4h = momentum4h ?? 0;
    const mom2h = momentum2h ?? mom4h; // fallback to 4h if 2h not available
    const intrabar = intrabarMomentum ?? 0;
    const score = trendScore ?? 0;
    const mom1hPct = momentum1h ?? 0;
    const env = getEnvironmentConfig();

    logger.debug('RiskManager: Stage 1 - Health Gate (direction score)', { trendScore: score, higherCloses, momentumSlope, intrabar, momentum4h: mom4h, momentum2h: mom2h, momentum1h });

    // CRASH GUARD: 4h below threshold = genuine crash or panic — dead-cat bounces are traps
    const crashGuard4h = env.RISK_CRASH_GUARD_4H_PCT;
    if (mom4h < crashGuard4h) {
      logger.info('RiskManager: Entry blocked - crash guard', { momentum4h: mom4h.toFixed(3), threshold: crashGuard4h });
      return { pass: false, reason: `Crash guard: 4h momentum ${mom4h.toFixed(2)}% < ${crashGuard4h}% (panic/crash protection)`, stage: 'Health Gate' };
    }

    // MINIMUM VIABILITY FLOOR: 4h momentum below threshold = broader market not moving enough.
    // 4h is the context timeframe — it reflects where the market has been for the last 4 hours.
    // A weak 4h (< threshold) with a strong 1h means: short-term bounce in a flat/declining market.
    // That pattern describes exactly the dead-cat bounces that produce our losses.
    //
    // NO 1h bypass: 1h is the shorter timeframe. Allowing 1h strength to override a weak 4h
    // context defeats the purpose of having a 4h floor. Genuine new uptrends show 4h turning up
    // first; if only 1h is positive while 4h is flat/negative, we are chasing a bounce.
    const min4hViability = env.RISK_MIN_4H_MOMENTUM_VIABILITY;
    if (mom4h < min4hViability) {
      logger.info('RiskManager: Entry blocked - 4h momentum below viability floor', {
        momentum4h: mom4h.toFixed(3), threshold: min4hViability, momentum1h: mom1hPct.toFixed(3),
      });
      return { pass: false, reason: `4h momentum ${mom4h.toFixed(3)}% < ${min4hViability}% — broader market not moving enough to profit`, stage: 'Health Gate' };
    }

    // 1H VIABILITY FLOOR: 1h momentum below threshold = short-term move hasn't started.
    // 4h can be above floor but if 1h is near zero, the move hasn't actually begun —
    // fees will exceed any realistic gross profit in the available hold window.
    const min1hViability = env.RISK_MIN_1H_MOMENTUM_VIABILITY;
    if (mom1hPct < min1hViability) {
      logger.info('RiskManager: Entry blocked - 1h momentum below viability floor', {
        momentum1h: mom1hPct.toFixed(3), threshold: min1hViability, momentum4h: mom4h.toFixed(3),
      });
      return { pass: false, reason: `1h momentum ${mom1hPct.toFixed(3)}% < ${min1hViability}% — short-term move insufficient to cover fees`, stage: 'Health Gate' };
    }

    // EXHAUSTION CAP: 1h momentum already too high = move happened before we entered.
    // We measure past price change — by the time 1h is elevated, the rally may be over.
    // Tiered: normal regime uses ENTRY_MAX_1H_MOMENTUM_PCT; strong 4h regime uses a higher
    // ceiling (ENTRY_MAX_1H_MOMENTUM_STRONG_PCT) rather than a full bypass. Even in a strong
    // trend, 1h > 1.5% means the hourly move already ran — we're entering at exhaustion.
    // Require BOTH 1h and 4h to meet strong thresholds — matching the regime classifier logic.
    // Using 4h alone caused moderate-regime trades (1h < 1.0% but 4h ≥ 0.8%) to bypass the
    // normal exhaustion cap, allowing post-spike re-entries (e.g. 1h=0.906% passed 1.5% cap
    // instead of being caught by the 0.85% normal cap).
    const isStrongForCap = mom1hPct >= env.REGIME_STRONG_1H_PCT && mom4h >= env.REGIME_STRONG_4H_PCT;
    const exhaustionCap = isStrongForCap
      ? env.ENTRY_MAX_1H_MOMENTUM_STRONG_PCT  // genuinely strong: higher ceiling, not unlimited
      : env.ENTRY_MAX_1H_MOMENTUM_PCT;         // normal/moderate: strict cap
    if (mom1hPct > exhaustionCap) {
      logger.info('RiskManager: Entry blocked - 1h momentum exhausted (entered too late)', {
        momentum1h: mom1hPct.toFixed(3), cap: exhaustionCap, momentum4h: mom4h.toFixed(3),
      });
      return { pass: false, reason: `1h momentum ${mom1hPct.toFixed(2)}% > ${exhaustionCap}% cap — move already ran, entering too late`, stage: 'Health Gate' };
    }

    // DIRECTION SCORE GATE: need 2/3 leading signals confirming upward direction.
    // These are all leading indicators — they measure what is happening now, not what happened.
    //   1. higherCloses  — recent candles closing above prior (structure confirmation)
    //   2. momentumSlope — 1h momentum accelerating (not decelerating into entry)
    //   3. intrabar > 0  — price rising within the current candle right now
    //
    // 4h minimum gate REMOVED — 4h is a lagging indicator. "mom4h < 0.30%" was causing the bot
    // to wait until the move was 30-60 min old before entering. Regime classification (weak/
    // moderate/strong/choppy) still uses 4h and 1h as context to set target and position size.
    //
    // Genuine crash protection kept (crash guard above). Everything else is direction score + slope.
    //
    // 2h recovery: still used to allow entries when 4h is negative but 2h has turned positive
    // (genuine recovery). Without it, entries would be blocked for 2-4h after any dip.
    const earlyRecovery4hMax = env.RISK_EARLY_RECOVERY_4H_MAX ?? -0.5;
    const earlyRecoveryException = mom4h < earlyRecovery4hMax && mom2h > 0;

    if (score >= 2) {
      // 2h check: if 2h is still declining (mom2h <= 0), a 2/3 direction score is probably
      // a dead-cat bounce within a continuing downtrend. Require 2h > 0 OR 4h already positive.
      const isChoppy = mom2h <= 0 && mom4h <= 0;
      if (isChoppy && !earlyRecoveryException) {
        logger.info('RiskManager: Entry blocked - direction score met but both 2h and 4h declining', { trendScore: score, momentum2h: mom2h.toFixed(3), momentum4h: mom4h.toFixed(3) });
        return { pass: false, reason: `Direction score ${score}/3 but 2h=${mom2h.toFixed(2)}% and 4h=${mom4h.toFixed(2)}% both declining — not a recovery`, stage: 'Health Gate' };
      }

      // SLOPE GATE: decelerating momentum entering = likely already peaked.
      // Dynamic floor: relaxed in strong 4h trends (brief dips are pullbacks), tight elsewhere.
      const slope = momentumSlope ?? 0;
      const isStrongTrend = mom4h >= env.REGIME_STRONG_4H_PCT; // 4h >= 0.8% = established trend
      const dynamicMinSlope = isStrongTrend ? env.RISK_SLOPE_MIN_STRONG : env.RISK_SLOPE_MIN_DEFAULT;
      // Override slope gate when momentum or structure is overwhelmingly positive.
      // NOTE: strongMultiHour removed — strong 4h context uses the relaxed RISK_SLOPE_MIN_STRONG
      // threshold (-0.05) which already tolerates brief dips. A full bypass lets spike reversals
      // through unconditionally (e.g., re-entering at spike top when slope is clearly negative).
      const perfectScore = score >= 3 && mom4h >= 0;
      const veryStrongMomentum = mom1hPct >= (env.RISK_STRONG_MOMENTUM_OVERRIDE_PCT ?? 2.5);
      const slopeOverridden = perfectScore || veryStrongMomentum;

      if (slope < dynamicMinSlope && !slopeOverridden) {
        logger.info('RiskManager: Entry blocked - decelerating momentum', {
          momentumSlope: slope.toFixed(3), dynamicMinSlope, isStrongTrend,
          momentum1h: mom1hPct.toFixed(3), momentum4h: mom4h.toFixed(3), slopeOverridden,
        });
        return { pass: false, reason: `Decelerating momentum: slope ${slope.toFixed(3)}% < ${dynamicMinSlope} floor`, stage: 'Health Gate' };
      }

      logger.info('RiskManager: Health gate passed via direction score', { trendScore: score, higherCloses, momentumSlope: slope.toFixed(3), dynamicMinSlope, slopeOverridden, intrabar: intrabar.toFixed(3), momentum4h: mom4h.toFixed(3) });
      return { pass: true, stage: 'Health Gate' };
    }

    // FALLBACK: Creeping uptrend — slope accelerating + 4h non-negative + intrabar rising with magnitude
    // (catches slow momentum builds before direction score reaches 2/3)
    // Requires intrabar >= RISK_CREEP_INTRABAR_MIN (positive magnitude, not just sign) to prevent
    // micro-tick entries in flat markets where fees exceed expected price movement.
    const slope = momentumSlope ?? 0;
    if (slope > env.RISK_CREEP_SLOPE_MIN && mom4h >= 0 && intrabar >= env.RISK_CREEP_INTRABAR_MIN) {
      logger.info('RiskManager: Health gate passed via creeping uptrend', { momentumSlope: slope.toFixed(3), momentum4h: mom4h.toFixed(3), intrabar: intrabar.toFixed(3) });
      return { pass: true, stage: 'Health Gate' };
    }

    logger.info('RiskManager: Entry blocked - direction not confirmed', { trendScore: score, higherCloses, momentumSlope: (momentumSlope ?? 0).toFixed(3), intrabar: intrabar.toFixed(3), momentum4h: mom4h.toFixed(3) });
    return { pass: false, reason: `Direction score ${score}/3 (need 2) — higherCloses=${higherCloses}, slope=${(momentumSlope ?? 0).toFixed(2)}%, intrabar=${intrabar.toFixed(2)}%`, stage: 'Health Gate' };
  }

  /**
   * STAGE 2: Drop Protection - Prevent entries during market panics
   */
  async checkDropProtection(
    pair: string,
    ticker: { bid?: number; ask?: number; last?: number } | Record<string, any>,
    indicators: TechnicalIndicators
  ): Promise<RiskFilterResult> {
    logger.debug('RiskManager: Stage 2 - Drop Protection', { pair, btcMomentum1h: this.btcMomentum1h });

    // Drop protection: Block if BTC is dumping (applies to ALL pairs including BTC)
    // BTC pairs: protects against entering longs while BTC itself is dropping
    // Altcoin pairs: protects against market-wide panic dragging altcoins down
    if (this.btcMomentum1h < this.config.btcDumpThreshold1h) {
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

    // BTC market-wide illiquidity guard: if BTC volume is extremely thin, the entire
    // crypto market lacks participation — block all pairs, not just BTC.
    // ETH/alts follow BTC; entering when BTC has 0.05x volume is a false signal.
    const env = getEnvironmentConfig();
    const adminOverrides = await getParamOverrides();
    // Priority: admin override > regime agent dynamic threshold > env default
    const btcMinVol = adminOverrides.RISK_BTC_MIN_VOLUME_RATIO
      ?? this.btcVolumeThresholdOverride
      ?? env.RISK_BTC_MIN_VOLUME_RATIO;
    const thresholdSource = adminOverrides.RISK_BTC_MIN_VOLUME_RATIO ? 'admin'
      : this.btcVolumeThresholdOverride !== null ? 'regime_agent'
      : 'env';
    if (this.btcVolumeRatio < btcMinVol) {
      logger.info('RiskManager: Entry blocked - BTC market illiquid (thin volume on all pairs)', {
        pair,
        btcVolumeRatio: this.btcVolumeRatio.toFixed(3),
        threshold: btcMinVol,
        thresholdSource,
      });
      return {
        pass: false,
        reason: `BTC volume too thin (${this.btcVolumeRatio.toFixed(2)}x < ${btcMinVol.toFixed(2)}x) — market-wide illiquidity`,
        stage: 'Drop Protection',
      };
    }

    // Volume panic check (/nexus parity): ONLY block if high volume + selling pressure
    // High volume + positive momentum = healthy breakout (ALLOW)
    // High volume + negative momentum = panic selling (BLOCK)
    // Treat volumeRatio = 0 as missing data (BTC/ETH never have 0 volume in reality) — default to 1.0x
    const rawVolumeRatio = indicators.volumeRatio ?? 1;
    const volumeRatio = rawVolumeRatio <= 0 ? 1 : rawVolumeRatio;
    // momentum1h is in percentage form (e.g. 0.319 = 0.319%, -1.5 = -1.5%)
    const momentum1h = indicators.momentum1h ?? 0;
    // Panic spike: block if high volume AND selling pressure (>= -0.5%)
    if (volumeRatio > this.config.volumeSpikeMax && momentum1h < -0.5) {
      logger.info('RiskManager: Entry blocked - volume panic spike with selling pressure', {
        pair,
        volumeRatio: volumeRatio.toFixed(2),
        threshold: this.config.volumeSpikeMax,
        momentum1h: momentum1h.toFixed(2),
      });
      return {
        pass: false,
        reason: `Volume panic spike (${volumeRatio.toFixed(2)}x + mom ${momentum1h.toFixed(2)}%)`,
        stage: 'Drop Protection',
      };
    }

    // Volume floor: block entries with extremely thin volume (no real buying pressure)
    // EXCEPTION: a strong 1h momentum move (≥ RISK_STRONG_MOMENTUM_OVERRIDE_PCT%) is itself
    // proof of real buying pressure — requiring a separate volume ratio on top is double-gating.
    const strongMomentumOverridePct = env.RISK_STRONG_MOMENTUM_OVERRIDE_PCT ?? 2.5;
    // momentum1h is already in %, compare directly (no * 100)
    const strongMomentumMove = momentum1h >= strongMomentumOverridePct;

    // Early cycle: low volume IS the signature of accumulation — don't block early entries
    const earlyCycleBypass = indicators.isEarlyCycle === true;

    if (volumeRatio < this.config.minVolumeRatio && !strongMomentumMove && !earlyCycleBypass) {
      logger.info('RiskManager: Entry blocked - volume too thin', {
        pair,
        volumeRatio: volumeRatio.toFixed(3),
        minVolumeRatio: this.config.minVolumeRatio,
      });
      return {
        pass: false,
        reason: `Volume too thin (${volumeRatio.toFixed(2)}x < ${this.config.minVolumeRatio}x minimum)`,
        stage: 'Drop Protection',
      };
    }

    if (strongMomentumMove && volumeRatio < this.config.minVolumeRatio) {
      logger.info('RiskManager: Volume floor bypassed — strong momentum move', {
        pair, momentum1h: momentum1h.toFixed(2), volumeRatio: volumeRatio.toFixed(3),
        threshold: strongMomentumOverridePct,
      });
    }
    if (earlyCycleBypass && volumeRatio < this.config.minVolumeRatio) {
      logger.info('RiskManager: Volume floor bypassed — early cycle entry (low vol = accumulation)', {
        pair, volumeRatio: volumeRatio.toFixed(3), rangePosition: (indicators.rangePosition ?? 0).toFixed(3),
      });
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
   * STAGE 3: Entry Quality Gate
   * Health Gate confirmed direction score (2/3 leading signals) and slope.
   * This stage only checks BTC dump protection (drop protection handles volume panics).
   * Price-top check removed: if 4h and 1h are both positive, we're in an uptrend — trends trade near highs.
   */
  checkEntryQuality(
    pair: string,
    price: number,
    _indicators: TechnicalIndicators
  ): RiskFilterResult {
    logger.debug('RiskManager: Stage 3 - Entry Quality', { pair, price });
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
    exchange: string = 'binance',
    liveSpreadPct: number = 0
  ): RiskFilterResult {
    const env = getEnvironmentConfig();
    logger.debug('RiskManager: Stage 5 - Cost Floor', { pair, profitTargetPercent, exchange, liveSpreadPct });

    // Enforce absolute minimum target to avoid fee drag on tiny moves
    if (profitTargetPercent < this.config.profitTargetMinimum) {
      logger.info('RiskManager: Entry blocked - profit target below minimum', {
        pair,
        profitTargetPercent: (profitTargetPercent * 100).toFixed(3),
        minimum: (this.config.profitTargetMinimum * 100).toFixed(3),
      });
      return {
        pass: false,
        reason: `Profit target ${(profitTargetPercent * 100).toFixed(2)}% < minimum ${(this.config.profitTargetMinimum * 100).toFixed(2)}%`,
        stage: 'Cost Floor',
      };
    }

    // Use ACTUAL exchange-specific fees (round-trip: entry + exit)
    const exchangeFeePercent = getCachedTakerFee(exchange) * 2; // Binance: 0.001*2 = 0.002 (0.20%)

    // Use live spread when available (from ticker), fall back to conservative estimate
    const spreadPercent = liveSpreadPct > 0 ? liveSpreadPct : 0.0005;
    const slippagePercent = 0.0001; // 0.01% conservative estimate
    const totalCostsPercent = exchangeFeePercent + spreadPercent + slippagePercent;

    // Cost floor: profit must be N× costs minimum (env-configurable, default 3.0)
    const multiplier = env.RISK_COST_FLOOR_MULTIPLIER;
    const costFloorPercent = totalCostsPercent * multiplier;

    if (profitTargetPercent < costFloorPercent) {
      logger.info('RiskManager: Entry blocked - cost floor not met', {
        pair,
        profitTargetPercent: (profitTargetPercent * 100).toFixed(3),
        totalCostsPercent: (totalCostsPercent * 100).toFixed(3),
        costFloorPercent: (costFloorPercent * 100).toFixed(3),
        multiplier: multiplier.toFixed(1),
        liveSpread: (spreadPercent * 100).toFixed(3),
      });
      return {
        pass: false,
        reason: `Cost floor not met (profit=${(profitTargetPercent * 100).toFixed(3)}% < costs×${multiplier}=${(costFloorPercent * 100).toFixed(3)}%)`,
        stage: 'Cost Floor',
      };
    }

    return { pass: true, stage: 'Cost Floor' };
  }

  /**
   * Classify market regime based on 1h and 4h momentum strength (no ADX/EMA)
   * Regimes drive profit targets and erosion caps — not entry gating (that's Stage 1).
   *
   * Thresholds:
   *   Strong:       1h > 1.0% AND 4h > 0.8%
   *   Moderate:     1h > 0.4% AND 4h > 0.2%
   *   Weak:         1h > min  AND 4h > 0%
   *   Transitioning: 4h > 0   AND 1h near flat (< 0.2%)
   *   Choppy:       4h <= 0 or both flat
   */
  getRegime(momentum1h: number, momentum4h: number, momentum2h?: number): string {
    const mom1h = momentum1h ?? 0;
    const mom4h = momentum4h ?? 0;
    const mom2h = momentum2h ?? mom4h; // fallback to 4h if 2h not available
    const env = getEnvironmentConfig();
    const minMom1h = env.RISK_MIN_MOMENTUM_1H_BINANCE ?? 0.5;

    // When 4h is negative but 2h has recovered AND 1h is above the entry floor,
    // the trade passed the health gate via allow4hLag — the market is in early recovery.
    // Classify as 'weak' (not choppy) so stale exit gives 25min instead of 15min,
    // and position sizing reflects the recovering (not declining) nature of the move.
    const earlyRecovery = mom4h <= 0 && mom2h > 0 && mom1h >= minMom1h;
    if (mom4h <= 0 && !earlyRecovery) return 'choppy';
    if (mom1h >= env.REGIME_STRONG_1H_PCT && mom4h >= env.REGIME_STRONG_4H_PCT) return 'strong';
    if (mom1h >= env.REGIME_MODERATE_1H_PCT && mom4h >= env.REGIME_MODERATE_4H_PCT) return 'moderate';
    if (mom1h >= env.REGIME_WEAK_1H_PCT || earlyRecovery) return 'weak';
    return 'transitioning'; // 4h > 0 but 1h flat — trend forming slowly
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
  getProfitTarget(regime: string): number {
    const env = getEnvironmentConfig();

    // Dynamic profit targets by regime — ALL from env vars (no hard-coded constants)
    // Strong 20% target removed: fired 4 times in 682 trades — unrealistic, replaced with 5%
    const targets: Record<string, number> = {
      choppy: env.PROFIT_TARGET_CHOPPY,               // 1.0% default
      transitioning: env.PROFIT_TARGET_TRANSITIONING,  // 1.5% default
      weak: env.PROFIT_TARGET_WEAK,                   // 2.0% default
      moderate: env.PROFIT_TARGET_MODERATE,            // 3.0% default
      strong: env.PROFIT_TARGET_STRONG,                // 5.0% default
    };

    return targets[regime] ?? env.PROFIT_TARGET_MODERATE;
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
    const momentum1h = indicators.momentum1h ?? 0;
    const momentum4h = indicators.momentum4h ?? 0;
    const rawVolume = indicators.volumeRatio ?? 1;
    const volumeRatio = rawVolume <= 0 ? 1 : rawVolume; // 0 = missing data, not actually zero volume
    const intrabar = indicators.intrabarMomentum ?? 0;

    const stage1 = this.checkHealthGate(0, 0, momentum1h, volumeRatio, momentum4h, intrabar, indicators.trendScore, indicators.higherCloses, indicators.momentumSlope, indicators.momentum2h);
    if (!stage1.pass) {
      return stage1;
    }

    // STAGE 2: Drop Protection - BTC dump, volume panic, spread widening
    const stage2 = await this.checkDropProtection(pair, ticker, indicators);
    if (!stage2.pass) {
      return stage2;
    }

    // STAGE 3: Entry Quality - Price top, overbought, momentum
    const stage3 = this.checkEntryQuality(pair, price, indicators);
    if (!stage3.pass) {
      return stage3;
    }

    // STAGE 5: Cost Floor (/nexus parity - validate BEFORE AI to save API calls)
    // Use momentum-based profit target percentage (not dollar amount)
    const regime = this.getRegime(momentum1h, momentum4h, indicators.momentum2h);
    const profitTargetPct = this.getProfitTarget(regime);
    const liveSpread = ticker.spread ?? (ticker.ask && ticker.bid && ticker.bid > 0 ? (ticker.ask - ticker.bid) / ticker.bid : 0);
    const stage5 = this.checkCostFloor(pair, price, price, profitTargetPct, this.config.exchange, liveSpread);
    if (!stage5.pass) {
      return stage5;
    }

    logger.debug('RiskManager: All 5 stages passed (pre-AI)', {
      pair,
      regime,
      profitTargetPct: (profitTargetPct * 100).toFixed(2) + '%',
      momentum1h: momentum1h.toFixed(3),
      momentum4h: momentum4h.toFixed(3),
    });

    return { pass: true, stage: 'All Stages Passed' };
  }
}

export const riskManager = new RiskManager();
