/**
 * Position Tracker - Erosion Cap Management
 * Tracks positions, peak profits, and applies erosion caps per regime
 * (ported from /nexus)
 *
 * CRITICAL: Peak profits are persisted to database (peak_profit_percent column)
 * to survive process restarts. In-memory cache is loaded from database on startup.
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { riskManager } from './risk-manager';

export interface PositionData {
  tradeId: string;
  pair: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  entryTime: Date;
  pyramidLevels: number;
  regime: string;
}

export interface ErosionCheckResult {
  shouldExit: boolean;
  reason?: string;
  currentProfit: number;
  currentProfitPct: number;
  peakProfit: number;
  peakProfitPct: number;
  erosionUsed: number;
  erosionCap: number;
  erosionUsedPct: number;
}

export interface UnderwaterCheckResult {
  shouldExit: boolean;
  reason?: string;
  currentProfitPct: number;
  ageMinutes: number;
  peakProfitPct: number;
  thresholdPct: number;
  minTimeMinutes: number;
}

class PositionTracker {
  // In-memory tracking of peak profits by trade ID
  // Backed by database (peak_profit_percent column) for persistence across restarts
  private peakProfits = new Map<string, { peak: number; peakPct: number; entryTime?: number }>();
  private isInitialized = false;

  /**
   * Initialize position tracker from open trades in database
   * Loads peak_profit_percent for all open trades
   */
  async initializeFromDatabase(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const openTrades = await query<{ id: string; peak_profit_percent: number | null; entry_time: string }>(
        `SELECT id, peak_profit_percent, entry_time FROM trades WHERE status = 'open'`
      );

      for (const trade of openTrades) {
        if (trade.peak_profit_percent !== null && trade.peak_profit_percent !== undefined) {
          // Parse as number (database may return string)
          const peakPct = typeof trade.peak_profit_percent === 'string'
            ? parseFloat(trade.peak_profit_percent)
            : trade.peak_profit_percent;
          this.peakProfits.set(trade.id, {
            peak: peakPct,
            peakPct: peakPct,
            entryTime: new Date(trade.entry_time).getTime(),
          });
        }
      }

      this.isInitialized = true;
      logger.info('Position tracker initialized from database', { loadedTrades: openTrades.length });
    } catch (error) {
      logger.error('Failed to initialize position tracker from database', error instanceof Error ? error : null);
      this.isInitialized = true; // Set to true even on error to avoid infinite retries
    }
  }

  /**
   * Record peak profit for a new position
   * Matches /nexus logic: peak starts at max(0, currentProfit)
   * For underwater trades, peak = 0 (never went positive)
   * For profitable trades, peak = currentProfit
   */
  async recordPeak(tradeId: string, profitPct: number, entryTime?: number): Promise<void> {
    // Use max(0, profit) to match /nexus: peak stays 0 for losing trades
    const peakPct = Math.max(0, profitPct);

    this.peakProfits.set(tradeId, {
      peak: peakPct,
      peakPct: peakPct,
      entryTime: entryTime || Date.now(),
    });

    // Persist to database
    try {
      await query(
        `UPDATE trades SET peak_profit_percent = $1, peak_profit_recorded_at = NOW() WHERE id = $2`,
        [peakPct, tradeId]
      );
    } catch (error) {
      logger.warn('Failed to persist peak profit to database', {
        tradeId,
        peakProfitPct: peakPct,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug('Position: peak profit recorded', {
      tradeId,
      currentProfitPct: profitPct.toFixed(2),
      recordedPeakPct: peakPct.toFixed(2),
    });
  }

  /**
   * Update peak profit if current profit exceeds previous peak
   * Matches /nexus logic: only update if new profit is positive
   */
  async updatePeakIfHigher(tradeId: string, currentProfitPct: number): Promise<void> {
    const existing = this.peakProfits.get(tradeId);
    if (!existing) {
      await this.recordPeak(tradeId, currentProfitPct);
      return;
    }

    // Only update peak if profit improved AND is positive (matches /nexus logic)
    if (currentProfitPct > existing.peakPct && currentProfitPct > 0) {
      existing.peakPct = currentProfitPct;

      // Persist to database
      try {
        await query(
          `UPDATE trades SET peak_profit_percent = $1, peak_profit_recorded_at = NOW() WHERE id = $2`,
          [currentProfitPct, tradeId]
        );
      } catch (error) {
        logger.warn('Failed to update peak profit in database', {
          tradeId,
          newPeakPct: currentProfitPct,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.debug('Position: peak profit updated', {
        tradeId,
        newPeakPct: currentProfitPct.toFixed(2),
      });
    }
  }

  /**
   * Check if position has exceeded erosion cap
   * Uses PERCENTAGE-OF-PEAK approach to scale with trade size
   * Example: 50% tolerance means trade can erode to 50% of peak before exiting
   * - Trade peaks at +2% → can drop to +1% before exiting
   * - Trade peaks at +0.08% → can drop to +0.04% before exiting
   * CRITICAL: Only exits if trade has eroded beyond threshold AND is still green
   */
  checkErosionCap(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    regime: string
  ): ErosionCheckResult {
    const existing = this.peakProfits.get(tradeId);

    // Default result (no exit)
    const result: ErosionCheckResult = {
      shouldExit: false,
      currentProfit: currentProfitPct,
      currentProfitPct: currentProfitPct,
      peakProfit: existing?.peak || 0,
      peakProfitPct: existing?.peakPct || 0,
      erosionUsed: 0,
      erosionCap: 0,
      erosionUsedPct: 0,
    };

    // If no peak recorded yet, no erosion check possible
    if (!existing) {
      return result;
    }

    // Only apply erosion cap to profitable positions
    if (existing.peakPct <= 0) {
      return result;
    }

    // Don't apply erosion cap to trivial peaks below fee level
    // A peak of 0.08% is noise, not profit worth protecting (Kraken fees ~0.52% round-trip)
    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();
    const erosionMinPeakPct = (env.EROSION_MIN_PEAK_PCT || 0.003) * 100; // Convert decimal to percent form
    if (existing.peakPct < erosionMinPeakPct) {
      logger.debug('Erosion check: peak below minimum threshold - skipping erosion cap', {
        tradeId,
        pair,
        peakProfitPct: existing.peakPct.toFixed(4),
        erosionMinPeakPct: erosionMinPeakPct.toFixed(2),
      });
      return result;
    }

    // PROTECT GREEN TRADES: Don't exit if still profitable
    // Underwater timeout will handle negative positions
    if (currentProfitPct <= 0) {
      logger.debug('Erosion check: trade is underwater - skip erosion cap (handled by underwater timeout)', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
        peakProfitPct: existing.peakPct.toFixed(4),
      });
      return result;
    }

    // Calculate erosion as percentage of peak (scales with trade size)
    const erosionAbsolute = existing.peakPct - currentProfitPct;
    const erosionPct = erosionAbsolute / existing.peakPct; // As % of peak profit

    // Get regime AND SIZE-BASED erosion cap as percentage
    // Scales tolerance based on peak profit to protect small trades while letting winners run
    const erosionCapPercent = riskManager.getErosionCap(regime, existing.peakPct);

    result.erosionUsed = erosionAbsolute;
    result.erosionCap = erosionCapPercent;
    result.erosionUsedPct = erosionPct;

    // Check if erosion exceeded cap (as percentage of peak)
    if (erosionPct > erosionCapPercent) {
      logger.info('Erosion cap exceeded - position should exit', {
        tradeId,
        pair,
        regime,
        peakProfitPct: existing.peakPct.toFixed(4),
        currentProfitPct: currentProfitPct.toFixed(4),
        erosionAbsolute: erosionAbsolute.toFixed(4),
        erosionPercent: (erosionPct * 100).toFixed(2),
        erosionCapPercent: (erosionCapPercent * 100).toFixed(2),
        greenTradeProtection: 'enabled - will not exit into loss',
      });

      result.shouldExit = true;
      result.reason = `Erosion Cap Exceeded (eroded ${(erosionPct * 100).toFixed(2)}% from peak > ${(erosionCapPercent * 100).toFixed(2)}% threshold)`;
    }

    return result;
  }

  /**
   * Check if position is underwater and should be closed
   * Handles TWO scenarios:
   * 1. Trades that never went positive: close if loss > threshold (original /nexus behavior)
   * 2. Trades that WERE profitable but collapsed: close if loss > (peak + buffer)
   *    Prevents profitable trades from turning into big losses
   */
  checkUnderwaterTimeout(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    entryTime: Date | number,
    underwaterThresholdPct: number = -0.008, // -0.8% default for never-profitable
    minTimeMinutes: number = 15 // 15 minutes default
  ): UnderwaterCheckResult {
    const existing = this.peakProfits.get(tradeId);

    // Default result (no exit)
    const result: UnderwaterCheckResult = {
      shouldExit: false,
      currentProfitPct,
      ageMinutes: 0,
      peakProfitPct: existing?.peakPct || 0,
      thresholdPct: underwaterThresholdPct * 100, // Convert to percentage for consistency
      minTimeMinutes,
    };

    // Must be currently underwater
    if (currentProfitPct >= 0) {
      logger.debug('Underwater check: trade is not underwater - skipping', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
      });
      return result;
    }

    // Ensure peakPct is numeric (database may return string)
    const peakPctNumeric = existing ? (typeof existing.peakPct === 'number'
      ? existing.peakPct
      : parseFloat(String(existing.peakPct))) : 0;

    // Check time threshold (avoid premature exits from entry slippage)
    const entryTimeMs = typeof entryTime === 'number' ? entryTime : entryTime.getTime();
    const ageMinutes = (Date.now() - entryTimeMs) / (1000 * 60);
    result.ageMinutes = ageMinutes;

    // Immediate protection: if the trade was MEANINGFULLY profitable and slips below breakeven, exit
    // BUT only if peak profit exceeds minimum threshold (avoids exiting on trivial momentary peaks from noise)
    // Default threshold: 0.5% peak profit before collapse protection kicks in
    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();
    const minPeakForCollapseProtectionDecimal = env.PROFIT_COLLAPSE_MIN_PEAK_PCT || 0.005; // 0.5% default (decimal form)
    // Convert to percent form to match peakPctNumeric (which is in percent, e.g., 0.5 = 0.5%)
    const minPeakForCollapseProtection = minPeakForCollapseProtectionDecimal * 100;

    if (existing && peakPctNumeric >= minPeakForCollapseProtection && currentProfitPct < 0) {
      logger.info('Underwater check: meaningful profitable trade breached breakeven - exiting', {
        tradeId,
        pair,
        peakProfitPct: peakPctNumeric.toFixed(4),
        minPeakThreshold: minPeakForCollapseProtection.toFixed(2) + '%',
        currentProfitPct: currentProfitPct.toFixed(2),
        ageMinutes: ageMinutes.toFixed(1),
      });

      result.shouldExit = true;
      result.reason = `Profitable trade breached breakeven (peak +${peakPctNumeric.toFixed(2)}% >= ${minPeakForCollapseProtection.toFixed(2)}% min, current ${currentProfitPct.toFixed(2)}%)`;
      return result;
    }

    // SAFEGUARD: If age is negative (entry time in future), treat as data error
    // Log warning and allow exit rather than blocking forever
    if (ageMinutes < 0) {
      logger.warn('Underwater check: entry_time is in the future (data error)', {
        tradeId,
        pair,
        entryTimeMs,
        now: Date.now(),
        ageMinutes: ageMinutes.toFixed(1),
      });
      // Continue with exit check (don't skip due to min time)
    } else if (ageMinutes < minTimeMinutes) {
      logger.debug('Underwater check: trade too young to exit', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
        ageMinutes: ageMinutes.toFixed(1),
        requiredMinutes: minTimeMinutes,
        timeRemaining: (minTimeMinutes - ageMinutes).toFixed(1),
      });
      return result;
    }

    // Determine threshold based on whether trade was MEANINGFULLY profitable
    // Trades with trivial peaks (< 0.5%) are treated as "never profitable" (normal market noise)
    let effectiveThresholdPct: number;
    let thresholdReason: string;

    if (existing && peakPctNumeric >= minPeakForCollapseProtection) {
      // MEANINGFULLY PROFITABLE TRADES THAT COLLAPSED: Return to breakeven (0%)
      // Only applies if peak >= 0.5% (actual profit, not noise)
      // Exit if trade returns to breakeven or goes negative (protects winners from becoming losers)
      effectiveThresholdPct = 0; // Return to breakeven (as decimal form: 0 = 0%)
      thresholdReason = `profitable_collapse (peaked +${peakPctNumeric.toFixed(2)}% >= ${minPeakForCollapseProtection.toFixed(2)}% min, exit at breakeven)`;
    } else {
      // NEVER-PROFITABLE or TRIVIALLY-PROFITABLE TRADES: Use absolute threshold
      // Trades with peaks < 0.5% are treated as normal market noise
      // Exit if loss exceeds the configured threshold
      effectiveThresholdPct = underwaterThresholdPct;
      thresholdReason = `never_profitable (absolute threshold ${(underwaterThresholdPct * 100).toFixed(2)}%)`;
    }

    // Check loss threshold - exit if loss is WORSE than threshold
    // currentProfitPct is in percentage form (e.g., -1.27 = -1.27%)
    // effectiveThresholdPct is in decimal form (e.g., -0.008 = -0.8%, or -0.0018 = -0.18%)
    // So we compare: (currentProfitPct / 100) < effectiveThresholdPct
    const profitAsDecimal = currentProfitPct / 100;

    if (profitAsDecimal < effectiveThresholdPct) {
      logger.info('Underwater timeout triggered - position should exit', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
        peakProfitPct: existing?.peakPct || 0,
        thresholdType: thresholdReason,
        effectiveThresholdPercent: `${(effectiveThresholdPct * 100).toFixed(2)}%`,
        ageMinutes: ageMinutes.toFixed(1),
        minTimeMinutes,
      });

      result.shouldExit = true;
      result.reason = `Underwater Timeout (loss ${currentProfitPct.toFixed(2)}% < ${thresholdReason} ${(effectiveThresholdPct * 100).toFixed(2)}%, age ${ageMinutes.toFixed(1)}min >= ${minTimeMinutes}min)`;
    }

    return result;
  }

  /**
   * Clear peak profit tracking when trade closes
   */
  clearPosition(tradeId: string): void {
    this.peakProfits.delete(tradeId);
    logger.debug('Position: tracking cleared', { tradeId });
  }

  /**
   * Get all currently tracked positions
   */
  getTrackedPositions(): string[] {
    return Array.from(this.peakProfits.keys());
  }
}

export const positionTracker = new PositionTracker();
