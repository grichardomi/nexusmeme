/**
 * Momentum Failure Exit Detector
 *
 * Three-gate detection system (inspired by /nexus profitable bot):
 * 1. Price Action Failure: Price near peak + 1h momentum negative
 * 2. Volume Exhaustion: Below-average volume while in profit
 * 3. HTF Breakdown: 4h momentum weakening OR price below EMA200
 *
 * Conservative: Requires 2 of 3 signals to trigger exit
 * Only activates when position is in profit >2%
 */

import { logger } from '@/lib/logger';
import { TechnicalIndicators } from '@/types/ai';

export interface MomentumFailureSignals {
  priceActionFailure: boolean;
  volumeExhaustion: boolean;
  htfBreakdown: boolean;
}

export interface MomentumFailureResult {
  shouldExit: boolean;
  signals: MomentumFailureSignals;
  signalCount: number;
  reasoning: string[];
}

export interface OpenPosition {
  pair: string;
  entryPrice: number;
  currentPrice: number;
  profitPct: number;
  pyramidLevelsActivated: number;
}

/**
 * Momentum Failure Detector
 * Provides zero-cost exit detection using only technical signals
 */
export class MomentumFailureDetector {
  // Configuration thresholds (from /nexus defaults)
  private readonly MOMENTUM_FAILURE_MIN_PROFIT_PCT = 2; // Only check if profit > 2%
  private readonly MOMENTUM_FAILURE_REQUIRED_SIGNALS = 2; // Require 2 of 3 signals

  // Momentum thresholds
  private readonly MOMENTUM_1H_FAILURE_THRESHOLD = -0.5; // Negative momentum
  private readonly MOMENTUM_4H_FAILURE_THRESHOLD = -0.3; // Weaker for HTF
  private readonly HTF_MOMENTUM_WEAKENING = -0.5;

  // Volume thresholds
  private readonly VOLUME_EXHAUSTION_THRESHOLD_1H = 0.8; // Below 80% of average
  private readonly VOLUME_EXHAUSTION_THRESHOLD_4H = 0.9; // Below 90% for longer holds

  // Price action thresholds
  private readonly PRICE_NEAR_PEAK_THRESHOLD = 0.985; // 98.5% of recent high

  /**
   * Detect if position should exit due to momentum failure
   * Uses 3-gate system: requires 2 of 3 signals
   */
  detectMomentumFailure(
    position: OpenPosition,
    indicators: TechnicalIndicators
  ): MomentumFailureResult {
    const result: MomentumFailureResult = {
      shouldExit: false,
      signals: {
        priceActionFailure: false,
        volumeExhaustion: false,
        htfBreakdown: false,
      },
      signalCount: 0,
      reasoning: [],
    };

    // Gate 1: Only check if profit exceeds minimum (2%)
    if (position.profitPct < this.MOMENTUM_FAILURE_MIN_PROFIT_PCT) {
      logger.debug('Momentum failure check skipped - insufficient profit', {
        pair: position.pair,
        profitPct: position.profitPct,
        minRequired: this.MOMENTUM_FAILURE_MIN_PROFIT_PCT,
      });
      return result;
    }

    // Determine timeframe-adaptive thresholds
    // Use 4h thresholds if pyramid levels active (longer hold time), else 1h
    const use4hThresholds = position.pyramidLevelsActivated >= 1;

    const momentumThreshold = use4hThresholds
      ? this.MOMENTUM_4H_FAILURE_THRESHOLD
      : this.MOMENTUM_1H_FAILURE_THRESHOLD;

    const volumeThreshold = use4hThresholds
      ? this.VOLUME_EXHAUSTION_THRESHOLD_4H
      : this.VOLUME_EXHAUSTION_THRESHOLD_1H;

    // Get optional indicators with defaults
    const momentum1h = indicators.momentum1h ?? 0;
    const momentum4h = indicators.momentum4h ?? 0;
    const volumeRatio = indicators.volumeRatio ?? 1;
    const ema200 = indicators.ema200 ?? 0;

    // SIGNAL 1: Price Action Failure
    // Check if price is near recent high but momentum is declining
    const priceNearPeak =
      position.currentPrice / (indicators.recentHigh || position.currentPrice);
    const momentum1hNegative = momentum1h < momentumThreshold * 100;

    if (
      priceNearPeak >= this.PRICE_NEAR_PEAK_THRESHOLD &&
      momentum1hNegative
    ) {
      result.signals.priceActionFailure = true;
      result.signalCount++;
      result.reasoning.push(
        `Price action failure: ${(priceNearPeak * 100).toFixed(1)}% of peak, ` +
          `1h momentum ${momentum1h.toFixed(2)}% (threshold: ${(momentumThreshold * 100).toFixed(2)}%)`
      );
    } else if (momentum1h < momentumThreshold * 100) {
      // Alternative: Strong 1h reversal (even if not at peak)
      result.signals.priceActionFailure = true;
      result.signalCount++;
      result.reasoning.push(
        `Strong 1h reversal: momentum ${momentum1h.toFixed(2)}% ` +
          `(threshold: ${(momentumThreshold * 100).toFixed(2)}%)`
      );
    }

    // SIGNAL 2: Volume Exhaustion
    // Volume below threshold while in profit = buyers exhausted
    if (volumeRatio < volumeThreshold) {
      result.signals.volumeExhaustion = true;
      result.signalCount++;
      result.reasoning.push(
        `Volume exhaustion: ${volumeRatio.toFixed(2)}× ` +
          `(threshold: ${volumeThreshold.toFixed(2)}×)`
      );
    }

    // SIGNAL 3: HTF Breakdown
    // 4h momentum weakening OR price breaking below EMA200
    const htfMomentumWeak =
      momentum4h < this.HTF_MOMENTUM_WEAKENING * 100;
    const belowEMA200 = position.currentPrice < ema200 && ema200 > 0;

    if (htfMomentumWeak) {
      result.signals.htfBreakdown = true;
      result.signalCount++;
      result.reasoning.push(
        `4h momentum weakening: ${momentum4h.toFixed(2)}% ` +
          `(threshold: ${(this.HTF_MOMENTUM_WEAKENING * 100).toFixed(2)}%)`
      );
    } else if (belowEMA200) {
      result.signals.htfBreakdown = true;
      result.signalCount++;
      result.reasoning.push(
        `EMA200 breakdown: price $${position.currentPrice.toFixed(2)} < ` +
          `EMA200 $${ema200.toFixed(2)}`
      );
    }

    // Conservative decision: Require N signals (default 2 of 3)
    result.shouldExit =
      result.signalCount >= this.MOMENTUM_FAILURE_REQUIRED_SIGNALS;

    // Add summary reasoning
    if (result.shouldExit) {
      result.reasoning.push(
        `EXIT TRIGGERED: ${result.signalCount}/${this.MOMENTUM_FAILURE_REQUIRED_SIGNALS} signals met ` +
          `(profit: ${position.profitPct.toFixed(2)}%)`
      );

      logger.info('Momentum failure detected', {
        pair: position.pair,
        profitPct: position.profitPct,
        signalCount: result.signalCount,
        signals: result.signals,
        reasoning: result.reasoning,
      });
    } else if (result.signalCount > 0) {
      logger.debug('Momentum failure check - insufficient signals', {
        pair: position.pair,
        profitPct: position.profitPct,
        signalCount: result.signalCount,
        required: this.MOMENTUM_FAILURE_REQUIRED_SIGNALS,
        signals: result.signals,
      });
    }

    return result;
  }

  /**
   * Check if momentum failure is enabled (can be configured via env)
   */
  isEnabled(): boolean {
    // For now, always enabled. Can be made configurable via environment
    return true;
  }
}

// Export singleton instance
export const momentumFailureDetector = new MomentumFailureDetector();
