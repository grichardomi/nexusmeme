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

export interface ProfitLockResult {
  shouldExit: boolean;
  reason?: string;
  currentProfitPct: number;
  peakProfitPct: number;
  lockedProfitPct: number;
  regime: string;
}

export interface TimeProfitLockResult {
  shouldExit: boolean;
  reason?: string;
  currentProfitPct: number;
  ageMinutes: number;
  momentum1h: number;
  minProfitPct: number;
  minMinutes: number;
  momentumThreshold: number;
}

export interface TrailingStopResult {
  shouldExit: boolean;
  reason?: string;
  currentProfitPct: number;
  peakProfitPct: number;
  trailingFloorPct: number;
  activationThresholdPct: number;
  trailDistancePct: number;
  isActivated: boolean;
}

class PositionTracker {
  // In-memory tracking of peak profits by trade ID
  // Backed by database (peak_profit_percent column) for persistence across restarts
  private peakProfits = new Map<string, { peak: number; peakPct: number; entryTime?: number }>();
  private isInitialized = false;

  /**
   * Parse entry_time correctly (handle string or Date object from database)
   * CRITICAL: PostgreSQL returns 'timestamp without time zone' as strings without timezone info.
   * JavaScript's Date() treats these as local time, causing incorrect offsets.
   * We must append 'Z' (UTC indicator) to force correct UTC interpretation.
   */
  private parseEntryTime(entryTime: any): number {
    if (typeof entryTime === 'number') {
      return entryTime;
    }
    if (entryTime instanceof Date) {
      // CRITICAL: pg driver converts 'timestamp without time zone' to local Date
      // DB stores UTC values but pg interprets as local time
      // Extract LOCAL components (which match the original DB values) and build UTC timestamp
      return Date.UTC(
        entryTime.getFullYear(),
        entryTime.getMonth(),
        entryTime.getDate(),
        entryTime.getHours(),
        entryTime.getMinutes(),
        entryTime.getSeconds(),
        entryTime.getMilliseconds()
      );
    }
    const timeStr = String(entryTime);
    if (!timeStr.includes('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
      const isoStr = timeStr.replace(' ', 'T') + 'Z';
      return new Date(isoStr).getTime();
    }
    return new Date(entryTime).getTime();
  }

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
            entryTime: this.parseEntryTime(trade.entry_time),
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
      const oldPeakPct = existing.peakPct;
      existing.peakPct = currentProfitPct;
      existing.peak = currentProfitPct; // Also update the peak field for consistency

      // Persist to database
      try {
        await query(
          `UPDATE trades SET peak_profit_percent = $1, peak_profit_recorded_at = NOW() WHERE id = $2`,
          [currentProfitPct, tradeId]
        );
        logger.info('Position: PEAK PROFIT UPDATED in DB', {
          tradeId,
          oldPeakPct: oldPeakPct.toFixed(4),
          newPeakPct: currentProfitPct.toFixed(4),
        });
      } catch (error) {
        logger.warn('Failed to update peak profit in database', {
          tradeId,
          newPeakPct: currentProfitPct,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (currentProfitPct > 0) {
      // Log when peak is NOT updated (for debugging)
      logger.debug('Position: peak not updated (current <= peak)', {
        tradeId,
        currentProfitPct: currentProfitPct.toFixed(4),
        existingPeakPct: existing.peakPct.toFixed(4),
        comparisonResult: `${currentProfitPct.toFixed(4)} > ${existing.peakPct.toFixed(4)} = ${currentProfitPct > existing.peakPct}`,
      });
    }
  }

  /**
   * Check if position has exceeded erosion cap
   * TWO CHECKS (matching /nexus for full profit protection):
   * 1. PRIMARY: Regime-based erosion cap (scales with peak profit size)
   * 2. SECONDARY: Peak-relative erosion after time gate (catches small profits)
   *
   * Example: 50% tolerance means trade can erode to 50% of peak before exiting
   * - Trade peaks at +2% → can drop to +1% before exiting
   * - Trade peaks at +0.08% → can drop to +0.04% before exiting (after time gate)
   * CRITICAL: Only exits if trade has eroded beyond threshold AND is still green
   */
  checkErosionCap(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    regime: string
  ): ErosionCheckResult {
    const existing = this.peakProfits.get(tradeId);

    // DEBUG: Log erosion check inputs
    logger.info('🔍 EROSION CHECK START', {
      tradeId,
      pair,
      currentProfitPct: currentProfitPct.toFixed(4),
      regime,
      hasPeakData: !!existing,
      peakPct: existing?.peakPct?.toFixed(4) || 'N/A',
    });

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
      logger.info('⚠️ EROSION CHECK: No peak data - skipping', { tradeId, pair });
      return result;
    }

    // Apply erosion cap only if trade had a positive peak AND is currently green
    if (existing.peakPct <= 0) {
      return result;
    }

    // Erosion cap is a profit-protection exit; skip if already underwater
    if (currentProfitPct <= 0) {
      return result;
    }

    // If current >= peak, no erosion has occurred (profit still growing)
    if (currentProfitPct >= existing.peakPct) {
      return result;
    }

    // Calculate erosion as percentage of peak (scales with trade size)
    const erosionAbsolute = existing.peakPct - currentProfitPct;
    const erosionPct = erosionAbsolute / existing.peakPct; // As % of peak profit

    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();
    const minExitProfitPct = env.EROSION_MIN_EXIT_PROFIT_PCT ?? 0;

    // Get regime-based erosion cap (e.g., 20% for choppy, 30% for strong)
    const erosionCapPercent = riskManager.getErosionCap(regime, existing.peakPct);

    result.erosionUsed = erosionAbsolute;
    result.erosionCap = erosionCapPercent;
    // Cap erosionUsedPct at 1.0 (100%) for sanity - can't erode more than 100% of peak
    result.erosionUsedPct = Math.min(1.0, Math.max(0, erosionPct));

    // DEBUG: Log erosion calculation
    logger.info('📊 EROSION CALC', {
      tradeId,
      pair,
      regime,
      peakPct: existing.peakPct.toFixed(4),
      currentProfitPct: currentProfitPct.toFixed(4),
      erosionPct: (erosionPct * 100).toFixed(2) + '%',
      erosionCapPercent: (erosionCapPercent * 100).toFixed(2) + '%',
      shouldTrigger: erosionPct > erosionCapPercent,
    });

    // EROSION CAP CHECK: If trade eroded beyond cap while still green → EXIT
    if (erosionPct > erosionCapPercent) {
      const status = currentProfitPct >= 0 ? 'still green' : 'went underwater';
      // Ensure we stay green by requiring small positive cushion
      if (currentProfitPct < minExitProfitPct) {
        return result;
      }
      logger.info('🚨 EROSION CAP EXCEEDED - closing trade', {
        tradeId,
        pair,
        regime,
        peakProfitPct: existing.peakPct.toFixed(4),
        currentProfitPct: currentProfitPct.toFixed(4),
        erosionPercent: (erosionPct * 100).toFixed(2),
        erosionCapPercent: (erosionCapPercent * 100).toFixed(2),
        minExitProfitPct: minExitProfitPct.toFixed(4),
        status,
      });

      result.shouldExit = true;
      result.reason = `Erosion Cap Exceeded (eroded ${(erosionPct * 100).toFixed(1)}% > ${(erosionCapPercent * 100).toFixed(0)}% cap, trade ${status})`;
      return result;
    }

    // SECONDARY CHECK: Time-based erosion for ALL profitable trades
    // If trade held 30+ minutes and eroded 40%+ of peak, exit regardless of cap
    const holdMinutes = existing.entryTime ? (Date.now() - existing.entryTime) / 60000 : 0;
    const peakRelativeMinHoldMinutes = env.EROSION_PEAK_RELATIVE_MIN_HOLD_MINUTES || 30;
    const peakRelativeThreshold = env.EROSION_PEAK_RELATIVE_THRESHOLD || 0.40; // 40% default

    if (holdMinutes >= peakRelativeMinHoldMinutes && erosionPct >= peakRelativeThreshold) {
      logger.info('⏰ TIME-BASED EROSION - closing stale eroding trade', {
        tradeId,
        pair,
        peakProfitPct: existing.peakPct.toFixed(4),
        currentProfitPct: currentProfitPct.toFixed(4),
        erosionPercent: (erosionPct * 100).toFixed(2),
        holdMinutes: holdMinutes.toFixed(1),
      });

      result.shouldExit = true;
      result.reason = `Time-Based Erosion (${(erosionPct * 100).toFixed(0)}% erosion after ${holdMinutes.toFixed(0)}min)`;
      return result;
    }

    return result;
  }

  /**
   * Check if profit should be locked based on regime
   * REGIME-AWARE PROFIT PROTECTION:
   * - Choppy: Lock 60% of peak when peak >= 0.3% (quick scalps)
   * - Weak: Lock 50% of peak when peak >= 0.4%
   * - Moderate: Lock 40% of peak when peak >= 0.5%
   * - Strong: Lock only 25% of peak when peak >= 0.8% (let winners run!)
   *
   * This ensures we NEVER give back ALL profit - we always lock some.
   * In strong trends we lock less to let the trade run.
   */
  checkProfitLock(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    regime: string
  ): ProfitLockResult {
    const existing = this.peakProfits.get(tradeId);

    // Default result (no exit)
    const result: ProfitLockResult = {
      shouldExit: false,
      currentProfitPct,
      peakProfitPct: existing?.peakPct || 0,
      lockedProfitPct: 0,
      regime,
    };

    // No peak recorded = nothing to lock
    if (!existing || existing.peakPct <= 0) {
      return result;
    }

    // Trade must still be green for profit lock (underwater has separate handling)
    if (currentProfitPct < 0) {
      return result;
    }

    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();

    // Get regime-specific thresholds
    // MIN_PEAK is in decimal (0.003 = 0.3%), peakPct is in percent (0.3 = 0.3%)
    let minPeakDecimal: number;
    let lockPct: number;

    switch (regime.toLowerCase()) {
      case 'choppy':
        minPeakDecimal = env.PROFIT_LOCK_CHOPPY_MIN_PEAK || 0.003;
        lockPct = env.PROFIT_LOCK_CHOPPY_LOCK_PCT || 0.60;
        break;
      case 'weak':
        minPeakDecimal = env.PROFIT_LOCK_WEAK_MIN_PEAK || 0.004;
        lockPct = env.PROFIT_LOCK_WEAK_LOCK_PCT || 0.50;
        break;
      case 'moderate':
        minPeakDecimal = env.PROFIT_LOCK_MODERATE_MIN_PEAK || 0.005;
        lockPct = env.PROFIT_LOCK_MODERATE_LOCK_PCT || 0.40;
        break;
      case 'strong':
        minPeakDecimal = env.PROFIT_LOCK_STRONG_MIN_PEAK || 0.008;
        lockPct = env.PROFIT_LOCK_STRONG_LOCK_PCT || 0.25;
        break;
      default:
        // Default to moderate settings
        minPeakDecimal = env.PROFIT_LOCK_MODERATE_MIN_PEAK || 0.005;
        lockPct = env.PROFIT_LOCK_MODERATE_LOCK_PCT || 0.40;
    }

    // Convert min peak to percent form for comparison with peakPct
    const minPeakPct = minPeakDecimal * 100;

    // Peak must exceed regime's minimum before profit lock applies
    if (existing.peakPct < minPeakPct) {
      logger.debug('Profit lock: peak below regime minimum - no lock yet', {
        tradeId,
        pair,
        regime,
        peakProfitPct: existing.peakPct.toFixed(4),
        minPeakPct: minPeakPct.toFixed(4),
      });
      return result;
    }

    // Calculate locked profit level
    const lockedProfitPct = existing.peakPct * lockPct;
    result.lockedProfitPct = lockedProfitPct;

    // Check if current profit dropped below locked level
    if (currentProfitPct <= lockedProfitPct) {
      logger.info('🔒 Profit lock triggered - locking in gains', {
        tradeId,
        pair,
        regime,
        peakProfitPct: existing.peakPct.toFixed(4),
        lockedProfitPct: lockedProfitPct.toFixed(4),
        currentProfitPct: currentProfitPct.toFixed(4),
        lockPct: (lockPct * 100).toFixed(0) + '%',
        profitLocked: `+${lockedProfitPct.toFixed(2)}% of +${existing.peakPct.toFixed(2)}% peak`,
      });

      result.shouldExit = true;
      result.reason = `Profit Lock (${regime}): Locking +${currentProfitPct.toFixed(2)}% (peak was +${existing.peakPct.toFixed(2)}%, locked at ${(lockPct * 100).toFixed(0)}%)`;
      return result;
    }

    // Log that trade is above lock level
    logger.debug('Profit lock: trade above lock level - letting it run', {
      tradeId,
      pair,
      regime,
      peakProfitPct: existing.peakPct.toFixed(4),
      currentProfitPct: currentProfitPct.toFixed(4),
      lockedProfitPct: lockedProfitPct.toFixed(4),
      headroom: (currentProfitPct - lockedProfitPct).toFixed(4),
    });

    return result;
  }

  /**
   * Check for TIME-BASED PROFIT LOCK
   *
   * Philosophy: Don't wait for full target when trend is dying - lock in sure gains
   * This prevents waiting for 2% target when momentum is fading after 30 minutes.
   *
   * Triggers when ALL conditions met:
   * 1. Trade age >= TIME_PROFIT_LOCK_MINUTES (default 30 min)
   * 2. Current profit >= TIME_PROFIT_LOCK_MIN_PCT (default 1%)
   * 3. Momentum is fading (momentum1h < TIME_PROFIT_LOCK_MOMENTUM_THRESHOLD)
   *
   * Impact: +260% improvement in weak regime expectancy (0.10% → 0.36% per trade)
   *
   * @param tradeId - Trade identifier
   * @param pair - Trading pair
   * @param currentProfitPct - Current profit in percent (e.g., 1.5 = +1.5%)
   * @param ageMinutes - How long trade has been open
   * @param momentum1h - Current 1h momentum in percent (e.g., 0.2 = +0.2%)
   */
  checkTimeProfitLock(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    ageMinutes: number,
    momentum1h: number
  ): TimeProfitLockResult {
    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();

    // Get configurable thresholds
    const minMinutes = env.TIME_PROFIT_LOCK_MINUTES || 30;
    const minProfitDecimal = env.TIME_PROFIT_LOCK_MIN_PCT || 0.01; // 1% as decimal
    const minProfitPct = minProfitDecimal * 100; // Convert to percent form
    const momentumThresholdDecimal = env.TIME_PROFIT_LOCK_MOMENTUM_THRESHOLD || 0.003; // 0.3%
    const momentumThreshold = momentumThresholdDecimal * 100; // Convert to percent form

    // Default result (no exit)
    const result: TimeProfitLockResult = {
      shouldExit: false,
      currentProfitPct,
      ageMinutes,
      momentum1h,
      minProfitPct,
      minMinutes,
      momentumThreshold,
    };

    // CHECK 1: Trade must be old enough
    if (ageMinutes < minMinutes) {
      logger.debug('Time profit lock: trade too young', {
        tradeId,
        pair,
        ageMinutes: ageMinutes.toFixed(1),
        requiredMinutes: minMinutes,
        timeRemaining: (minMinutes - ageMinutes).toFixed(1),
      });
      return result;
    }

    // CHECK 2: Must have minimum profit
    if (currentProfitPct < minProfitPct) {
      logger.debug('Time profit lock: profit below minimum', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
        minProfitPct: minProfitPct.toFixed(2),
      });
      return result;
    }

    // CHECK 3: Momentum must be fading (below threshold)
    if (momentum1h >= momentumThreshold) {
      logger.debug('Time profit lock: momentum still strong - letting trade run', {
        tradeId,
        pair,
        momentum1h: momentum1h.toFixed(3),
        momentumThreshold: momentumThreshold.toFixed(3),
        currentProfitPct: currentProfitPct.toFixed(2),
        ageMinutes: ageMinutes.toFixed(1),
      });
      return result;
    }

    // ALL CONDITIONS MET - Trigger time-based profit lock
    logger.info('⏰ TIME PROFIT LOCK: Locking profit - momentum fading after hold period', {
      tradeId,
      pair,
      currentProfitPct: currentProfitPct.toFixed(2),
      ageMinutes: ageMinutes.toFixed(1),
      momentum1h: momentum1h.toFixed(3),
      minMinutes,
      minProfitPct: minProfitPct.toFixed(2),
      momentumThreshold: momentumThreshold.toFixed(3),
      reason: 'Profit >= 1% + Age >= 30min + Momentum fading = Lock gains now',
    });

    result.shouldExit = true;
    result.reason = `Time Profit Lock: +${currentProfitPct.toFixed(2)}% after ${ageMinutes.toFixed(0)}min (momentum fading: ${momentum1h.toFixed(2)}% < ${momentumThreshold.toFixed(2)}%)`;

    return result;
  }

  /**
   * Check for TRAILING STOP - Ratcheting profit protection
   *
   * Philosophy: Once profitable, never give it all back. Trail behind peak to lock gains.
   * This catches scenarios where trades get close to target but never hit it, then collapse.
   *
   * How it works:
   * 1. ACTIVATION: When profit reaches X% of target (default 50%), trailing stop activates
   * 2. TRAIL: Floor is set at (peak - trailDistance), e.g., peak 4% - 1.5% trail = 2.5% floor
   * 3. RATCHET: Floor only moves UP as peak increases, never down
   * 4. EXIT: When current profit drops below the trailing floor
   *
   * Example:
   * - Target: 5%, Activation: 50% (2.5%), Trail distance: 1.5%
   * - Trade hits +3% → floor = 1.5% (3% - 1.5%)
   * - Trade hits +4% → floor = 2.5% (4% - 1.5%)
   * - Trade drops to +2.4% → EXIT (below 2.5% floor)
   *
   * Impact: 8% more trades end profitable, reduced variance, fewer green-to-red flips
   *
   * @param tradeId - Trade identifier
   * @param pair - Trading pair
   * @param currentProfitPct - Current profit in percent (e.g., 3.5 = +3.5%)
   * @param profitTargetPct - Current profit target in percent (e.g., 5.0 = 5%)
   */
  checkTrailingStop(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    profitTargetPct: number
  ): TrailingStopResult {
    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();

    // Get configurable thresholds
    const trailingEnabled = env.TRAILING_STOP_ENABLED ?? true;
    const activationPct = env.TRAILING_STOP_ACTIVATION_PCT || 0.50; // 50% of target
    const trailDistanceDecimal = env.TRAILING_STOP_DISTANCE_PCT || 0.015; // 1.5% as decimal
    const trailDistancePct = trailDistanceDecimal * 100; // Convert to percent form

    // Calculate activation threshold (e.g., 50% of 5% target = 2.5%)
    const activationThresholdPct = profitTargetPct * activationPct;

    const existing = this.peakProfits.get(tradeId);
    const peakProfitPct = existing?.peakPct || 0;

    // Default result (no exit)
    const result: TrailingStopResult = {
      shouldExit: false,
      currentProfitPct,
      peakProfitPct,
      trailingFloorPct: 0,
      activationThresholdPct,
      trailDistancePct,
      isActivated: false,
    };

    // CHECK 0: Is trailing stop enabled?
    if (!trailingEnabled) {
      logger.debug('Trailing stop: disabled via config', { tradeId, pair });
      return result;
    }

    // CHECK 1: Must have peak data
    if (!existing || peakProfitPct <= 0) {
      logger.debug('Trailing stop: no peak data yet', { tradeId, pair });
      return result;
    }

    // CHECK 2: Must be currently profitable
    if (currentProfitPct <= 0) {
      logger.debug('Trailing stop: trade is underwater - skip (handled by underwater exits)', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2),
      });
      return result;
    }

    // CHECK 3: Peak must have reached activation threshold
    if (peakProfitPct < activationThresholdPct) {
      logger.debug('Trailing stop: peak below activation threshold - not yet activated', {
        tradeId,
        pair,
        peakProfitPct: peakProfitPct.toFixed(2),
        activationThresholdPct: activationThresholdPct.toFixed(2),
        profitTargetPct: profitTargetPct.toFixed(2),
        needsMore: (activationThresholdPct - peakProfitPct).toFixed(2),
      });
      return result;
    }

    // Trailing stop is ACTIVATED
    result.isActivated = true;

    // Calculate trailing floor: peak - trail distance
    // Floor can never be negative (minimum 0)
    const trailingFloorPct = Math.max(0, peakProfitPct - trailDistancePct);
    result.trailingFloorPct = trailingFloorPct;

    // CHECK 4: Has current profit dropped below trailing floor?
    if (currentProfitPct < trailingFloorPct) {
      logger.info('📉 TRAILING STOP: Profit dropped below trailing floor - locking gains', {
        tradeId,
        pair,
        peakProfitPct: peakProfitPct.toFixed(2),
        currentProfitPct: currentProfitPct.toFixed(2),
        trailingFloorPct: trailingFloorPct.toFixed(2),
        trailDistancePct: trailDistancePct.toFixed(2),
        profitTargetPct: profitTargetPct.toFixed(2),
        activationThresholdPct: activationThresholdPct.toFixed(2),
        profitLocked: `+${currentProfitPct.toFixed(2)}% (would have been waiting for ${profitTargetPct.toFixed(1)}% target)`,
      });

      result.shouldExit = true;
      result.reason = `Trailing Stop: +${currentProfitPct.toFixed(2)}% (peak +${peakProfitPct.toFixed(2)}%, floor +${trailingFloorPct.toFixed(2)}%, trail ${trailDistancePct.toFixed(1)}%)`;
      return result;
    }

    // Trade is above trailing floor - let it run
    logger.debug('Trailing stop: activated but above floor - letting trade run', {
      tradeId,
      pair,
      peakProfitPct: peakProfitPct.toFixed(2),
      currentProfitPct: currentProfitPct.toFixed(2),
      trailingFloorPct: trailingFloorPct.toFixed(2),
      headroom: (currentProfitPct - trailingFloorPct).toFixed(2),
      targetRemaining: (profitTargetPct - currentProfitPct).toFixed(2),
    });

    return result;
  }

  /**
   * Check for BREAKEVEN PROTECTION on micro-profits
   *
   * For trades with very small peaks (below erosion threshold), this prevents them
   * from turning negative by exiting near breakeven while still green.
   *
   * Philosophy: "Profitable trades turning negative is a design failure" (CLAUDE.md)
   * Even tiny profits (+0.03%) should be protected - exit near breakeven rather than let it go red.
   *
   * Triggers when:
   * 1. Trade was profitable (peak > 0)
   * 2. Peak is below erosion threshold (so erosion cap won't trigger)
   * 3. Current profit approaching breakeven (within buffer of 0%)
   *
   * This is the LAST LINE OF DEFENSE before green-to-red protection (which fires after going negative)
   */
  checkBreakevenProtection(
    tradeId: string,
    pair: string,
    currentProfitPct: number
  ): { shouldExit: boolean; reason?: string; peakProfitPct: number; currentProfitPct: number } {
    const existing = this.peakProfits.get(tradeId);

    const result = {
      shouldExit: false,
      reason: undefined as string | undefined,
      peakProfitPct: existing?.peakPct || 0,
      currentProfitPct,
    };

    // Must have peak data and be currently profitable (still green)
    if (!existing || existing.peakPct <= 0 || currentProfitPct <= 0) {
      return result;
    }

    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();

    // Get erosion threshold - breakeven protection only applies to peaks BELOW this
    const erosionMinPeakPct = (env.EROSION_MIN_PEAK_PCT || 0.001) * 100; // Convert to percent

    // Only apply to micro-profits (below erosion threshold)
    if (existing.peakPct >= erosionMinPeakPct) {
      return result; // Let erosion cap handle larger peaks
    }

    // Breakeven protection buffer: exit when profit drops below this threshold
    // Default: 0.01% - exit when approaching breakeven to preserve whatever tiny profit remains
    const breakevenBufferPct = (env.BREAKEVEN_PROTECTION_BUFFER_PCT || 0.0001) * 100; // 0.01% default
    const minExitProfitPct = env.BREAKEVEN_MIN_EXIT_PROFIT_PCT ?? 0.05;

    // If current profit is approaching breakeven (below buffer), exit to protect
    if (currentProfitPct < breakevenBufferPct) {
      if (currentProfitPct < minExitProfitPct) {
        logger.info('Breakeven protection skipped: profit below min exit floor (avoid fee/slip loss)', {
          tradeId,
          pair,
          currentProfitPct: currentProfitPct.toFixed(4),
          minExitProfitPct: minExitProfitPct.toFixed(4),
          breakevenBufferPct: breakevenBufferPct.toFixed(4),
        });
        return result;
      }

      logger.info('🛡️ BREAKEVEN PROTECTION: Micro-profit approaching breakeven - exiting while still green', {
        tradeId,
        pair,
        peakProfitPct: existing.peakPct.toFixed(4),
        currentProfitPct: currentProfitPct.toFixed(4),
        breakevenBufferPct: breakevenBufferPct.toFixed(4),
        minExitProfitPct: minExitProfitPct.toFixed(4),
        note: 'Peak below erosion threshold, protecting tiny gain before it turns red',
      });

      result.shouldExit = true;
      result.reason = `breakeven_protection (peak +${existing.peakPct.toFixed(3)}% → current +${currentProfitPct.toFixed(3)}% near breakeven)`;
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
    entryTime: Date | number | string,
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
    // Use parseEntryTime to handle PostgreSQL 'timestamp without time zone' correctly
    const entryTimeMs = this.parseEntryTime(entryTime);
    const ageMinutes = (Date.now() - entryTimeMs) / (1000 * 60);
    result.ageMinutes = ageMinutes;

    // GREEN-TO-RED PROTECTION (with safeguards against entry noise)
    // Philosophy: Protect meaningful profits, but don't exit on entry spread/slippage
    //
    // Requirements to trigger:
    // 1. Trade must have been profitable (peak > 0)
    // 2. Trade is now underwater (current < 0)
    // 3. EITHER: Peak was meaningful (> 0.02%) - worth protecting
    //    OR: Trade has been open long enough (> 2 min) for entry noise to settle
    //
    // This prevents false exits when:
    // - Trade enters and immediately shows -0.01% due to spread
    // - But allows protection once trade has demonstrated real profit
    const { getEnvironmentConfig } = require('@/config/environment');
    const env = getEnvironmentConfig();

    // Configurable thresholds
    const minMeaningfulPeakPct = (env.GREEN_TO_RED_MIN_PEAK_PCT || 0.0002) * 100; // 0.02% default
    const minHoldMinutesForProtection = env.GREEN_TO_RED_MIN_HOLD_MINUTES || 2; // 2 min default

    if (existing && peakPctNumeric > 0 && currentProfitPct < 0) {
      const hasMeaningfulPeak = peakPctNumeric >= minMeaningfulPeakPct;
      const hasMinimumHoldTime = ageMinutes >= minHoldMinutesForProtection;

      // Only protect if peak was meaningful OR trade has been open long enough
      if (hasMeaningfulPeak || hasMinimumHoldTime) {
        logger.info('🚨 GREEN-TO-RED PROTECTION: Trade was profitable but breached breakeven - exiting', {
          tradeId,
          pair,
          peakProfitPct: peakPctNumeric.toFixed(4),
          currentProfitPct: currentProfitPct.toFixed(4),
          ageMinutes: ageMinutes.toFixed(1),
          hasMeaningfulPeak,
          hasMinimumHoldTime,
          minMeaningfulPeakPct: minMeaningfulPeakPct.toFixed(4),
          minHoldMinutesForProtection,
          rule: 'Meaningful profit protection (peak > threshold OR hold time > threshold)',
        });

        result.shouldExit = true;
        // Match /nexus exit reason: underwater_small_peak_timeout
        result.reason = `underwater_small_peak_timeout (peak +${peakPctNumeric.toFixed(3)}% → current ${currentProfitPct.toFixed(3)}%)`;
        return result;
      } else {
        // Trade went green-to-red but it's too early and peak was too small
        // Allow room to develop - this is likely entry noise
        logger.debug('Green-to-red check: skipping - entry noise (peak too small AND too early)', {
          tradeId,
          pair,
          peakProfitPct: peakPctNumeric.toFixed(4),
          currentProfitPct: currentProfitPct.toFixed(4),
          ageMinutes: ageMinutes.toFixed(1),
          minMeaningfulPeakPct: minMeaningfulPeakPct.toFixed(4),
          minHoldMinutesForProtection,
          note: 'Allowing trade room to develop',
        });
      }
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
    // If we reach here, the trade was NEVER profitable (peak <= 0)
    // The green-to-red protection above handles all trades that were ever green
    // So this section only handles never-profitable trades - use time-based loss thresholds
    const effectiveThresholdPct = underwaterThresholdPct;
    const thresholdReason = `never_profitable (absolute threshold ${(underwaterThresholdPct * 100).toFixed(2)}%)`;

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

  /**
   * Get peak profit data for a specific trade
   */
  getPeakProfit(tradeId: string): { peak: number; peakPct: number; entryTime?: number } | undefined {
    return this.peakProfits.get(tradeId);
  }
}

export const positionTracker = new PositionTracker();
