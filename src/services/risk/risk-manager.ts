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
  checkHealthGate(_adx: number, _adxSlope?: number, momentum1h?: number, _volumeRatio?: number, momentum4h?: number, intrabarMomentum?: number, trendScore?: number, higherCloses?: boolean, momentumSlope?: number): RiskFilterResult {
    const mom4h = momentum4h ?? 0;
    const intrabar = intrabarMomentum ?? 0;
    const score = trendScore ?? 0;
    const mom1hPct = momentum1h ?? 0;
    const env = getEnvironmentConfig();

    console.log(`\n🏥 HEALTH GATE: trendScore=${score}/3 | higherCloses=${higherCloses} | slope=${(momentumSlope ?? 0).toFixed(3)}% | intrabar=${intrabar.toFixed(2)}% | 4h=${mom4h.toFixed(2)}%`);
    logger.debug('RiskManager: Stage 1 - Health Gate (direction score)', { trendScore: score, higherCloses, momentumSlope, intrabar, momentum4h: mom4h, momentum1h });

    // CRASH GUARD: 4h < -3% = genuine crash or panic — dead-cat bounces are traps
    if (mom4h < -3.0) {
      console.log(`\n🚫 CRASH GUARD: 4h=${mom4h.toFixed(2)}% — too deep to enter safely`);
      logger.info('RiskManager: Entry blocked - crash guard (4h < -3%)', { momentum4h: mom4h.toFixed(3) });
      return { pass: false, reason: `Crash guard: 4h momentum ${mom4h.toFixed(2)}% < -3% (panic/crash protection)`, stage: 'Health Gate' };
    }

    // DIRECTION SCORE GATE: need 2/3 signals confirming upward direction
    // Catches recoveries 1-3 candles after they start, regardless of how deep the prior dump was.
    // 4h floor >= -0.5%: slope+intrabar alone can score 2/3 on a single candle bounce while 4h is
    // still deeply negative (e.g. -1.4%), causing immediate thesis invalidation after entry.
    if (score >= 2) {
      // 4h data lags the current candle by up to 4 hours. When 1h momentum is already
      // above the minimum entry threshold (0.5%), the move is directionally confirmed by
      // recent price action — blocking on a lagging 4h negative is double-counting.
      // We still block on genuine crash (mom4h < -3%) regardless of 1h strength.
      // EXCEPTION: choppy regime (mom4h <= 0) — 4h lag NOT allowed. In choppy markets
      // the negative 4h IS the signal, not a lag artifact. Allowing it causes counter-trend
      // entries on noise 1h spikes that immediately reverse.
      const env4h = getEnvironmentConfig();
      const minMom1h = env4h.RISK_MIN_MOMENTUM_1H_BINANCE ?? 0.5;
      const isChoppy = mom4h <= 0;
      const allow4hLag = !isChoppy && mom1hPct >= minMom1h && mom4h >= -3.0;

      if (mom4h >= -0.5 || allow4hLag) {
        // SUSTAINED RALLY GATE (smart, regime-aware)
        // Problem: a negative slope means the 1h rally peaked before entry — one-tick bounce.
        // Example: 14:00 ETH slope=-0.017% with score=2/3 → entered fading move, closed -0.12%
        //
        // But a blunt "slope >= 0" blocks valid entries in strong trends where brief dips are noise.
        // Solution: dynamic slope floor that tightens in weak/choppy (high fake-rally risk)
        // and relaxes in strong regime (confirmed trend, brief dips are pullbacks not reversals).
        //
        // Self-healing overrides:
        //  1. Perfect score (3/3): all three direction signals confirm → slope irrelevant
        //  2. Very strong 1h momentum (>= RISK_STRONG_MOMENTUM_OVERRIDE_PCT): move is self-proving
        //  3. Strong 4h (>= 0.8%): multi-hour trend is real, short-term slope dip is noise
        const slope = momentumSlope ?? 0;
        const strongMomOverride = env.RISK_STRONG_MOMENTUM_OVERRIDE_PCT ?? 2.5;

        // Regime classification for slope tolerance
        const isStrongRegime = mom1hPct >= 1.0 && mom4h >= 0.8;
        const isModerateRegime = mom1hPct >= 0.4 && mom4h >= 0.2;
        // Dynamic slope floor by regime: tight in weak/moderate/choppy, relaxed only in confirmed strong trends
        // Moderate is NOT relaxed — the 14:00 ETH case was moderate regime with slope=-0.017%
        // and still a fake rally. Relaxation only earned in genuinely strong trends (1h>1%, 4h>0.8%).
        let dynamicMinSlope: number;
        if (isStrongRegime) {
          dynamicMinSlope = -0.05; // Strong trend: tolerate brief dips (normal pullback in confirmed uptrend)
        } else {
          dynamicMinSlope = 0.0;  // Moderate/weak/choppy: must be accelerating — negative slope = fake rally
        }

        // Self-healing overrides: strong independent evidence beats slope concern
        const perfectScore = score >= 3;
        const veryStrongMomentum = mom1hPct >= strongMomOverride;
        const strongMultiHour = mom4h >= 0.8;
        const slopeOverridden = perfectScore || veryStrongMomentum || strongMultiHour;

        if (slope < dynamicMinSlope && !slopeOverridden) {
          const overrideNote = `perfectScore=${perfectScore} | veryStrongMom=${veryStrongMomentum}(${mom1hPct.toFixed(2)}%>=${strongMomOverride}%) | strongMultiHour=${strongMultiHour}(4h=${mom4h.toFixed(2)}%)`;
          console.log(`\n🚫 SLOPE GATE [${isStrongRegime ? 'strong' : isModerateRegime ? 'moderate' : 'weak/choppy'} regime]: slope=${slope.toFixed(3)}% < floor=${dynamicMinSlope} — rally fading | overrides: ${overrideNote}`);
          logger.info('RiskManager: Entry blocked - decelerating momentum (adaptive slope gate)', {
            momentumSlope: slope.toFixed(3),
            dynamicMinSlope,
            regime: isStrongRegime ? 'strong' : isModerateRegime ? 'moderate' : 'weak/choppy',
            trendScore: score,
            momentum1h: mom1hPct.toFixed(3),
            momentum4h: mom4h.toFixed(3),
            perfectScore,
            veryStrongMomentum,
            strongMultiHour,
          });
          return {
            pass: false,
            reason: `Decelerating rally [${isStrongRegime ? 'strong' : isModerateRegime ? 'moderate' : 'weak/choppy'} regime]: slope ${slope.toFixed(3)}% < floor ${dynamicMinSlope} (no self-heal override)`,
            stage: 'Health Gate',
          };
        }

        const slopeNote = slopeOverridden && slope < dynamicMinSlope
          ? ` [slope overridden: ${perfectScore ? '3/3 score' : veryStrongMomentum ? `1h=${mom1hPct.toFixed(2)}%>=${strongMomOverride}%` : `4h=${mom4h.toFixed(2)}%>=0.8%`}]`
          : '';
        const via = allow4hLag && mom4h < -0.5 ? ` [4h lag allowed: 1h=${mom1hPct.toFixed(2)}%]` : '';
        console.log(`\n✅ HEALTH GATE PASSED (direction score ${score}/3): higherCloses=${higherCloses} | slope=${slope.toFixed(3)}% | intrabar=${intrabar.toFixed(2)}% | 4h=${mom4h.toFixed(2)}%${via}${slopeNote}`);
        logger.info('RiskManager: Health gate passed via direction score', { trendScore: score, higherCloses, momentumSlope: slope.toFixed(3), dynamicMinSlope, slopeOverridden, intrabar: intrabar.toFixed(3), momentum4h: mom4h.toFixed(3), allow4hLag });
        return { pass: true, stage: 'Health Gate' };
      }

      const blockReason = isChoppy
        ? `Direction score ${score}/3 met but 4h=${mom4h.toFixed(2)}% ≤ 0 (choppy — 4h lag not allowed)`
        : `Direction score ${score}/3 met but 4h=${mom4h.toFixed(2)}% < -0.5% and 1h momentum too weak to override`;
      console.log(`\n🚫 HEALTH GATE BLOCKED (4h downtrend): score=${score}/3 but 4h=${mom4h.toFixed(2)}% < -0.5% and 1h=${mom1hPct.toFixed(2)}%${isChoppy ? ' [choppy — no 4h lag]' : ''}`);
      logger.info('RiskManager: Entry blocked - direction score met but 4h downtrend', { trendScore: score, momentum4h: mom4h.toFixed(3), momentum1h: mom1hPct.toFixed(3), isChoppy });
      return { pass: false, reason: blockReason, stage: 'Health Gate' };
    }

    // FALLBACK A: 4h stable with any confirmation (intrabar positive OR 1h recovering near zero)
    const mom1h = momentum1h ?? 0;
    if (mom4h >= -0.1 && (intrabar > 0 || mom1h >= -0.1)) {
      console.log(`\n✅ HEALTH GATE PASSED (4h stable): 4h=${mom4h.toFixed(2)}% | intrabar=${intrabar.toFixed(2)}% | 1h=${mom1h.toFixed(2)}%`);
      return { pass: true, stage: 'Health Gate' };
    }

    // FALLBACK B: Creeping uptrend — two variants:
    // B1: Slope accelerating + 4h near-neutral (original — catches momentum building)
    // B2: Steady grind — 1h positive + higherCloses + 4h near-neutral (catches slow climbs
    //     where momentum plateaus but price is still making higher candle closes)
    //     Quick scalp opportunity: low target, fast in-and-out, must not be in 4h downtrend.
    const slope = momentumSlope ?? 0;
    const steadyGrind = mom1hPct >= env.RISK_MIN_MOMENTUM_1H_BINANCE && higherCloses && mom4h >= -0.5 && intrabar >= -0.15;
    if ((slope > 0.03 && mom4h >= -0.5 && intrabar >= -0.1) || steadyGrind) {
      const via = steadyGrind && slope <= 0.03 ? 'steady grind' : 'creeping uptrend';
      console.log(`\n✅ HEALTH GATE PASSED (${via}): 1h=${mom1hPct.toFixed(3)}% | slope=${slope.toFixed(3)}% | 4h=${mom4h.toFixed(2)}% | higherCloses=${higherCloses} | intrabar=${intrabar.toFixed(2)}%`);
      logger.info(`RiskManager: Health gate passed via ${via}`, { momentum1h: mom1hPct.toFixed(3), momentumSlope: slope.toFixed(3), momentum4h: mom4h.toFixed(3), higherCloses, intrabar: intrabar.toFixed(3) });
      return { pass: true, stage: 'Health Gate' };
    }

    console.log(`\n🚫 HEALTH GATE BLOCKED: score=${score}/3 | 4h=${mom4h.toFixed(2)}% — no upward direction confirmed`);
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
    const btcMinVol = adminOverrides.RISK_BTC_MIN_VOLUME_RATIO ?? env.RISK_BTC_MIN_VOLUME_RATIO;
    if (this.btcVolumeRatio < btcMinVol) {
      logger.info('RiskManager: Entry blocked - BTC market illiquid (thin volume on all pairs)', {
        pair,
        btcVolumeRatio: this.btcVolumeRatio.toFixed(3),
        threshold: btcMinVol,
      });
      return {
        pass: false,
        reason: `BTC volume too thin (${this.btcVolumeRatio.toFixed(2)}x < ${btcMinVol}x) — market-wide illiquidity`,
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

    if (volumeRatio < this.config.minVolumeRatio && !strongMomentumMove) {
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
   * Health Gate already confirmed 4h > 0 and 1h > min.
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
  getRegime(momentum1h: number, momentum4h: number): string {
    const mom1h = momentum1h ?? 0;
    const mom4h = momentum4h ?? 0;

    if (mom4h <= 0) return 'choppy';
    if (mom1h >= 1.0 && mom4h >= 0.8) return 'strong';
    if (mom1h >= 0.4 && mom4h >= 0.2) return 'moderate';
    if (mom1h >= 0.2) return 'weak';
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

    const stage1 = this.checkHealthGate(0, 0, momentum1h, volumeRatio, momentum4h, intrabar, indicators.trendScore, indicators.higherCloses, indicators.momentumSlope);
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
    const regime = this.getRegime(momentum1h, momentum4h);
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
