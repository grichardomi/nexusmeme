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
import { getEnvironmentConfig } from '@/config/environment';

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
  // PORTED FROM /nexus: Dollar-based tracking eliminates micro-peak precision issues
  private peakProfits = new Map<string, {
    peak: number;              // Legacy: peak profit in percent (for backward compat)
    peakPct: number;           // Peak profit in percent (for display/logging)
    peakProfit: number;        // DOLLARS: absolute peak profit (PRIMARY for exit logic)
    currentProfit: number;     // DOLLARS: current profit (updated each check)
    entryPrice: number;        // Entry price for dollar calculations
    quantity: number;          // Position size for dollar calculations
    entryTime?: number;
    estimatedTotalFees: number; // DOLLARS: estimated round-trip fees (entry + exit)
  }>();
  private isInitialized = false;

  // LATENCY OPTIMIZATION (Priority 2): Batch database updates
  // Queue peak updates in memory, flush at end of cycle
  // Reduces N individual UPDATE queries to 1 batched query
  private pendingUpdates = new Map<string, number>(); // tradeId -> peakProfitPct

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
   * LATENCY OPTIMIZATION: Queue peak update for batching
   * Instead of individual UPDATE queries, collect updates in memory
   * and flush at end of cycle (reduces DB round-trips)
   */
  private queuePeakUpdate(tradeId: string, peakProfitPct: number): void {
    this.pendingUpdates.set(tradeId, peakProfitPct);
  }

  /**
   * LATENCY OPTIMIZATION: Flush all pending peak updates in single batch query
   * Should be called at end of each orchestration cycle
   * Reduces N individual UPDATEs to 1 batched UPDATE
   */
  async flushPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) {
      return; // Nothing to flush
    }

    const updates = Array.from(this.pendingUpdates.entries());
    const tradeIds = updates.map(([id]) => id);
    const peakPcts = updates.map(([, pct]) => pct);

    try {
      // Batch update using PostgreSQL unnest() to update multiple rows in one query
      // UNNEST creates arrays that are zipped together row-by-row
      // CRITICAL: Cast to uuid[] not text[] - trades.id is UUID type
      await query(
        `UPDATE trades AS t
         SET peak_profit_percent = u.peak_pct, peak_profit_recorded_at = NOW()
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS peak_pct) AS u
         WHERE t.id = u.id`,
        [tradeIds, peakPcts]
      );

      logger.debug('Position: flushed peak updates (batched)', {
        updateCount: this.pendingUpdates.size,
        tradeIds: tradeIds.slice(0, 5), // Log first 5 IDs
      });

      // Clear queue after successful flush
      this.pendingUpdates.clear();
    } catch (error) {
      logger.error('Position: failed to flush peak updates', error instanceof Error ? error : null, {
        updateCount: this.pendingUpdates.size,
      });
      // Don't clear queue on error - will retry on next flush
    }
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
      // CRITICAL: Load entry_price and quantity to prevent degraded mode on restart
      const openTrades = await query<{
        id: string;
        peak_profit_percent: number | null;
        entry_time: string;
        entry_price: string;
        quantity: string;
      }>(
        `SELECT id, peak_profit_percent, entry_time, entry_price, quantity
         FROM trades
         WHERE status = 'open'`
      );

      for (const trade of openTrades) {
        if (trade.peak_profit_percent !== null && trade.peak_profit_percent !== undefined) {
          // Parse as number (database may return string)
          const peakPct = typeof trade.peak_profit_percent === 'string'
            ? parseFloat(trade.peak_profit_percent)
            : trade.peak_profit_percent;

          // Parse position data to prevent degraded mode
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));
          const hasValidData = !isNaN(entryPrice) && entryPrice > 0 && !isNaN(quantity) && quantity > 0;

          this.peakProfits.set(trade.id, {
            peak: peakPct,
            peakPct: peakPct,
            peakProfit: 0,        // Will be calculated on next update with currentPrice
            currentProfit: 0,     // Will be calculated on next update
            entryPrice: hasValidData ? entryPrice : 0,
            quantity: hasValidData ? quantity : 0,
            entryTime: this.parseEntryTime(trade.entry_time),
            estimatedTotalFees: 0, // Will be populated on next update from orchestrator
          });

          if (!hasValidData) {
            logger.warn('Position tracker init: Invalid entry_price or quantity - will fall into degraded mode', {
              tradeId: trade.id,
              entryPrice: trade.entry_price,
              quantity: trade.quantity,
            });
          }
        }
      }

      this.isInitialized = true;
      logger.info('✅ POSITION TRACKER INITIALIZED', {
        loadedTrades: openTrades.length,
        tradesWithPositionData: openTrades.filter(t => t.entry_price && t.quantity).length,
        note: 'VERIFYING /NEXUS PARITY FIX IS ACTIVE',
      });
    } catch (error) {
      logger.error('Failed to initialize position tracker from database', error instanceof Error ? error : null);
      this.isInitialized = true; // Set to true even on error to avoid infinite retries
    }
  }

  /**
   * Record peak profit for a new position
   * PORTED FROM /nexus: Dollar-based tracking with percentage backup
   * Peak starts at max(0, currentProfit) in both dollars and percent
   */
  async recordPeak(
    tradeId: string,
    profitPct: number,
    entryTime?: number,
    entryPrice?: number,
    quantity?: number,
    currentPrice?: number,
    estimatedTotalFees?: number
  ): Promise<void> {
    // If entry_price or quantity not provided, load from database
    if (!entryPrice || !quantity) {
      try {
        const trade = await query<{ entry_price: string; quantity: string; entry_time: string }>(
          `SELECT entry_price, quantity, entry_time FROM trades WHERE id = $1`,
          [tradeId]
        );
        if (trade.length > 0) {
          entryPrice = entryPrice || parseFloat(trade[0].entry_price);
          quantity = quantity || parseFloat(trade[0].quantity);
          entryTime = entryTime || this.parseEntryTime(trade[0].entry_time);
          logger.debug('Position tracker: Loaded entry data from database', {
            tradeId,
            entryPrice,
            quantity,
          });
        }
      } catch (error) {
        logger.error('Position tracker: Failed to load entry data from database', error instanceof Error ? error : null, {
          tradeId,
        });
      }
    }

    // CRITICAL: Validate inputs - NaN or 0 will break erosion cap logic!
    const hasValidEntryPrice = entryPrice && !isNaN(entryPrice) && entryPrice > 0;
    const hasValidQuantity = quantity && !isNaN(quantity) && quantity > 0;
    const hasValidCurrentPrice = currentPrice && !isNaN(currentPrice) && currentPrice > 0;

    if (!hasValidEntryPrice || !hasValidQuantity) {
      logger.error('🚨 CRITICAL: recordPeak called with invalid position data - erosion cap will not work!', null, {
        tradeId,
        entryPrice,
        quantity,
        currentPrice,
        isEntryPriceValid: hasValidEntryPrice,
        isQuantityValid: hasValidQuantity,
        note: 'Database has null/undefined entry_price or quantity - check trades table!',
      });
    }

    // Use max(0, profit) to match /nexus: peak stays 0 for losing trades
    const peakPct = Math.max(0, profitPct);

    // Calculate dollar profit if we have VALID data
    let peakProfit = 0;
    let currentProfit = 0;
    const safeEntryPrice = hasValidEntryPrice && entryPrice ? entryPrice : 0;
    const safeQuantity = hasValidQuantity && quantity ? quantity : 0;

    if (hasValidEntryPrice && hasValidQuantity && hasValidCurrentPrice && currentPrice && entryPrice && quantity) {
      currentProfit = (currentPrice - entryPrice) * quantity;
      peakProfit = Math.max(0, currentProfit);
    } else {
      logger.warn('Position: Cannot calculate dollar profit - using percentage-only tracking (degraded mode)', {
        tradeId,
        entryPrice: safeEntryPrice,
        quantity: safeQuantity,
        currentPrice,
        note: 'Erosion cap may not work correctly without dollar-based tracking',
      });
    }

    this.peakProfits.set(tradeId, {
      peak: peakPct,
      peakPct: peakPct,
      peakProfit: peakProfit,
      currentProfit: currentProfit,
      entryPrice: safeEntryPrice,
      quantity: safeQuantity,
      entryTime: entryTime || Date.now(),
      estimatedTotalFees: estimatedTotalFees || 0,
    });

    // Queue update for batch flush (LATENCY OPTIMIZATION)
    this.queuePeakUpdate(tradeId, peakPct);

    logger.info('📌 POSITION PEAK RECORDED (/nexus parity)', {
      tradeId,
      profitPct: profitPct.toFixed(2) + '%',
      peakPct: peakPct.toFixed(2) + '%',
      peakProfitDollars: '$' + peakProfit.toFixed(2),
      currentProfitDollars: '$' + currentProfit.toFixed(2),
      entryPrice: safeEntryPrice.toFixed(2),
      quantity: safeQuantity.toFixed(6),
      hasValidData: hasValidEntryPrice && hasValidQuantity,
      note: hasValidEntryPrice && hasValidQuantity ? 'DOLLAR TRACKING ACTIVE' : '⚠️ DEGRADED MODE - MISSING DATA',
    });
  }

  /**
   * Update peak profit if current profit exceeds previous peak
   * PORTED FROM /nexus: Dollar-based comparison eliminates precision issues
   */
  async updatePeakIfHigher(
    tradeId: string,
    currentProfitPct: number,
    currentPrice?: number,
    estimatedTotalFees?: number
  ): Promise<void> {
    const existing = this.peakProfits.get(tradeId);
    if (!existing) {
      // CRITICAL: Position must be initialized via recordPeak FIRST with full data
      // DO NOT call recordPeak here with missing parameters (causes degraded mode)
      logger.error('❌ updatePeakIfHigher called on untracked position', null, {
        tradeId,
        currentProfitPct: currentProfitPct.toFixed(4),
        note: 'Caller must call recordPeak() first with full position data (entryPrice, quantity, etc.)',
      });
      return;
    }

    // Calculate current profit in dollars if we have position data
    let currentProfitDollars = 0;
    if (currentPrice && existing.entryPrice && existing.quantity) {
      currentProfitDollars = (currentPrice - existing.entryPrice) * existing.quantity;
    } else {
      // CRITICAL: Missing position data - can't update peak!
      logger.warn('⚠️ PEAK UPDATE FAILED - Missing position data', {
        tradeId,
        hasCurrentPrice: !!currentPrice,
        hasEntryPrice: !!existing.entryPrice,
        hasQuantity: !!existing.quantity,
        entryPrice: existing.entryPrice,
        quantity: existing.quantity,
        currentProfitPct: currentProfitPct.toFixed(4),
        existingPeakPct: existing.peakPct.toFixed(4),
        note: 'Cannot calculate dollar profit - peak will not update!',
      });
    }

    // Update current profit tracker and fees
    existing.currentProfit = currentProfitDollars;
    if (estimatedTotalFees !== undefined && estimatedTotalFees > 0) {
      existing.estimatedTotalFees = estimatedTotalFees;
    }

    // NET dollar profit = gross - fees
    const netProfitDollars = currentProfitDollars - existing.estimatedTotalFees;
    const netPeakDollars = existing.peakProfit - existing.estimatedTotalFees;

    // Only update peak if NET profit improved AND is positive
    // Use DOLLAR comparison as primary (eliminates precision issues)
    const shouldUpdate = netProfitDollars > netPeakDollars && netProfitDollars > 0;

    if (shouldUpdate) {
      const oldPeakPct = existing.peakPct;
      const oldPeakProfit = existing.peakProfit;

      existing.peakPct = currentProfitPct;
      existing.peak = currentProfitPct;
      existing.peakProfit = currentProfitDollars;

      // Queue update for batch flush (LATENCY OPTIMIZATION)
      this.queuePeakUpdate(tradeId, currentProfitPct);

      logger.info('📈 PEAK UPDATED', {
        tradeId,
        oldPeakPct: oldPeakPct.toFixed(4) + '%',
        newPeakPct: currentProfitPct.toFixed(4) + '%',
        oldPeakProfit: '$' + oldPeakProfit.toFixed(2),
        newPeakProfit: '$' + currentProfitDollars.toFixed(2),
        improvement: '+$' + (currentProfitDollars - oldPeakProfit).toFixed(2),
      });
    } else if (currentProfitDollars > 0) {
      // Log when peak is NOT updated (for debugging)
      logger.info('📊 Peak not updated (current ≤ peak)', {
        tradeId,
        currentProfitPct: currentProfitPct.toFixed(4) + '%',
        existingPeakPct: existing.peakPct.toFixed(4) + '%',
        currentProfitDollars: '$' + currentProfitDollars.toFixed(2),
        peakProfitDollars: '$' + existing.peakProfit.toFixed(2),
        gap: '-$' + (existing.peakProfit - currentProfitDollars).toFixed(2),
      });
    }
  }

  /**
   * Check if position has exceeded erosion cap
   * MATCHES /nexus EXACTLY (PositionTracker.ts:346-437)
   *
   * Two checks:
   * 1. Absolute erosion: erosionUsed > totalCost × cap (1.2% choppy, 1.5% trend)
   * 2. Peak-relative: after 10min, erosionUsed/peak >= 30%
   *
   * CRITICAL: Only fires when currentProfit > 0 (green trades only)
   * Underwater trades handled by checkUnderwaterExit
   */
  checkErosionCap(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    regime: string,
    currentPrice?: number
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

    // No peak data = nothing to check
    if (!existing || existing.peakPct <= 0) {
      return result;
    }

    // Calculate current profit in dollars
    let currentProfitDollars = existing.currentProfit;
    if (currentPrice && existing.entryPrice && existing.quantity) {
      currentProfitDollars = (currentPrice - existing.entryPrice) * existing.quantity;
      existing.currentProfit = currentProfitDollars;
    }

    // ONLY trigger if NET currentProfit > 0 (truly green trades only)
    // NET = gross - estimated fees. Underwater trades handled by checkUnderwaterExit
    const netCurrentDollars = currentProfitDollars - existing.estimatedTotalFees;
    if (netCurrentDollars <= 0) {
      return result;
    }

    // Must have positive NET peak in dollars
    const netPeakDollars = existing.peakProfit - existing.estimatedTotalFees;
    if (netPeakDollars <= 0) {
      return result;
    }

    // If current profit >= peak, no erosion (still growing)
    if (currentProfitDollars >= existing.peakProfit) {
      return result;
    }

    // Calculate erosion
    const erosionUsed = existing.peakProfit - currentProfitDollars;
    const erosionPct = erosionUsed / existing.peakProfit;

    // Erosion cap: totalCost × cap percentage (from environment config)
    const env = getEnvironmentConfig();
    const totalCost = existing.entryPrice * existing.quantity;
    const erosionCapsByRegime: Record<string, number> = {
      choppy: env.EROSION_CAP_CHOPPY,     // 2% default
      weak: env.EROSION_CAP_WEAK,         // 2% default
      moderate: env.EROSION_CAP_MODERATE,  // 3% default
      strong: env.EROSION_CAP_STRONG,      // 5% default
    };
    const erosionCapPct = erosionCapsByRegime[regime.toLowerCase()] || env.EROSION_CAP_MODERATE;
    const erosionCapAbsolute = totalCost * erosionCapPct;

    // Update result metrics
    result.erosionUsed = erosionUsed;
    result.erosionCap = erosionCapAbsolute;
    result.erosionUsedPct = Math.min(1.0, Math.max(0, erosionPct));
    result.peakProfit = existing.peakProfit;
    result.currentProfit = currentProfitDollars;

    logger.debug('📊 EROSION CHECK (/nexus)', {
      tradeId,
      pair,
      regime,
      peakProfit: '$' + existing.peakProfit.toFixed(2),
      currentProfit: '$' + currentProfitDollars.toFixed(2),
      erosionUsed: '$' + erosionUsed.toFixed(2),
      erosionCap: '$' + erosionCapAbsolute.toFixed(2),
      erosionPct: (erosionPct * 100).toFixed(1) + '%',
    });

    // CHECK 1: Absolute erosion exceeds cap (/nexus line 368-404)
    if (erosionUsed > erosionCapAbsolute) {
      logger.info('🛡️ EROSION CAP EXCEEDED - locking profit', {
        tradeId,
        pair,
        regime,
        peakProfit: '$' + existing.peakProfit.toFixed(2),
        currentProfit: '$' + currentProfitDollars.toFixed(2),
        erosionUsed: '$' + erosionUsed.toFixed(2),
        erosionCap: '$' + erosionCapAbsolute.toFixed(2),
        profitLocked: '$' + currentProfitDollars.toFixed(2),
      });
      result.shouldExit = true;
      result.reason = 'erosion_cap_exceeded';
      return result;
    }

    // CHECK 2: Peak-relative erosion (from environment config)
    // If erosion >= threshold of peak profit → EXIT IMMEDIATELY
    // NO fee adjustment — erosion cap protects green trades, period.
    // A small fee-driven net loss is far better than going underwater.
    const peakRelativeThreshold = env.EROSION_PEAK_RELATIVE_THRESHOLD; // default: 0.50 (50%)

    // Immediate exit when peak-relative erosion reaches threshold (no time gate)
    if (erosionPct >= peakRelativeThreshold) {
      logger.info('⏱️ PEAK-RELATIVE EROSION - locking profit (immediate exit)', {
        tradeId,
        pair,
        peakProfit: '$' + existing.peakProfit.toFixed(2),
        currentProfit: '$' + currentProfitDollars.toFixed(2),
        erosionPct: (erosionPct * 100).toFixed(1) + '%',
        threshold: (peakRelativeThreshold * 100).toFixed(1) + '%',
      });
      result.shouldExit = true;
      result.reason = 'erosion_cap_exceeded';
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
   * MATCHES /nexus EXACTLY (PositionTracker.ts:446-523)
   *
   * Scenario A: PROFITABLE COLLAPSE - peaked ≥ 1%, now negative → EXIT IMMEDIATELY
   * Scenario B: EARLY LOSS - never meaningful peak, age > 15min, loss > threshold → EXIT
   *
   * /nexus thresholds: -1.5% (5min), -2.5% (30min), -3.5% (3h), -4.5% (4+h), -5.5% (daily)
   */
  checkUnderwaterExit(
    tradeId: string,
    pair: string,
    currentProfitPct: number,
    entryTime: Date | number | string,
    _currentPrice?: number,
    underwaterThresholdPct: number = -0.015, // Passed from orchestrator's getEarlyLossThreshold
    minTimeMinutes: number = 15 // /nexus: underwaterExitMinTimeMinutes = 15
  ): UnderwaterCheckResult {
    const existing = this.peakProfits.get(tradeId);

    // Default result (no exit)
    const result: UnderwaterCheckResult = {
      shouldExit: false,
      currentProfitPct,
      ageMinutes: 0,
      peakProfitPct: existing?.peakPct || 0,
      thresholdPct: underwaterThresholdPct * 100,
      minTimeMinutes,
    };

    // Must be currently underwater
    if (currentProfitPct >= 0) {
      return result;
    }

    // Calculate trade age
    const entryTimeMs = this.parseEntryTime(entryTime);
    const ageMinutes = (Date.now() - entryTimeMs) / (1000 * 60);
    result.ageMinutes = ageMinutes;

    const peakProfitPct = existing?.peakPct || 0;

    // ============================================================
    // SCENARIO A: PROFITABLE COLLAPSE (/nexus lines 456-488)
    // ============================================================
    // Trade peaked at ≥ 0.5% profit, now negative → EXIT IMMEDIATELY
    // /nexus: profitCollapseMinPeakPct = 0.005 (0.5%) — must match orchestrator:1447
    const profitCollapseMinPeakPct = 0.50; // 0.5% in percent form (matches /nexus 0.005 * 100)

    if (peakProfitPct >= profitCollapseMinPeakPct && currentProfitPct < 0) {
      logger.info('🚨 PROFITABLE COLLAPSE - had ≥1% profit, now underwater → EXIT IMMEDIATELY', {
        tradeId,
        pair,
        peakProfitPct: peakProfitPct.toFixed(2) + '%',
        currentProfitPct: currentProfitPct.toFixed(2) + '%',
        ageMinutes: ageMinutes.toFixed(1),
        rule: '/nexus profitable collapse - no time gate, immediate exit',
      });
      result.shouldExit = true;
      result.reason = 'underwater_profitable_collapse';
      return result;
    }

    // ============================================================
    // SCENARIO B: EARLY LOSS / NEVER PROFITED (/nexus lines 490-523)
    // ============================================================
    // Trade never had meaningful peak (< 1%), use time-based thresholds
    // Must wait minimum time (15 min) before exiting

    // Time gate: must be old enough
    if (ageMinutes < minTimeMinutes) {
      return result;
    }

    // Loss must exceed threshold for this trade age
    // underwaterThresholdPct is passed from orchestrator as a decimal (e.g., -0.015 = -1.5%)
    const thresholdPct = underwaterThresholdPct * 100; // Convert to percentage
    result.thresholdPct = thresholdPct;

    if (currentProfitPct <= thresholdPct) {
      logger.info('🔴 EARLY LOSS - never-profitable trade hit threshold', {
        tradeId,
        pair,
        currentProfitPct: currentProfitPct.toFixed(2) + '%',
        thresholdPct: thresholdPct.toFixed(2) + '%',
        peakProfitPct: peakProfitPct.toFixed(2) + '%',
        ageMinutes: ageMinutes.toFixed(1),
        rule: '/nexus early loss - time-scaled threshold',
      });
      result.shouldExit = true;
      result.reason = 'underwater_never_profited';
      return result;
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
