/**
 * Trade Signal Orchestrator
 * Converts AI signals into actual trade execution plans
 * This is the missing orchestrator that connects signal analysis to trade execution
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';
import { getParamOverrides } from '@/services/admin/param-overrides';
import { getCachedTakerFee } from '@/services/billing/fee-rate';
import { analyzeMarket } from '@/services/ai/analyzer';
import { executionFanOut } from '@/services/execution/fan-out';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { momentumFailureDetector, type OpenPosition } from '@/services/trading/momentum-failure-detector';
import { calculateTechnicalIndicators } from '@/services/ai/market-analysis';
import { regimeDetector } from '@/services/regime/detector';
import { riskManager } from '@/services/risk/risk-manager';
import { positionTracker } from '@/services/risk/position-tracker';
import { capitalPreservation } from '@/services/risk/capital-preservation';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { fetchOHLC, warmOHLCCache } from '@/services/market-data/ohlc-fetcher';
import { sendBotSuspendedEmail, sendLowBalanceEmail } from '@/services/email/triggers';
import { startUserDataStreamsForAllLiveBots } from '@/services/exchanges/binance-user-data-stream';
import { reconcileBinanceFills } from '@/services/exchanges/binance-fill-reconciler';
import type { TradeDecision } from '@/types/market';
import { closeTrade } from '@/services/trading/close-trade';
import { livePriceStore } from '@/services/market-data/live-price-store';
// regimeAgent removed — replaced by deterministic Trend Exhaustion rule
import { tradeMonitorAgent, type OpenTradeContext } from '@/services/ai/trade-monitor-agent';
// transitionDetectorAgent removed — 1h floor eliminated, lagging indicator no longer gates entry

interface BotInstance {
  id: string;
  user_id: string;
  enabled_pairs: string[];
  status: string;
  exchange: string;
  config: Record<string, any>;
}

/**
 * Orchestrator that periodically analyzes signals and executes trades
 */
class TradeSignalOrchestrator {
  private isRunning = false;
  private isCycleRunning = false;      // Main cycle guard
  private isPeakRunning = false;       // Peak-tracking guard (1s loop)
  private isPyramidRunning = false;    // Pyramid guard (5s loop)
  private interval: NodeJS.Timer | null = null;
  lastHeartbeat: number = 0;           // Updated each main cycle — watchdog uses this
  private peakTrackingInterval: NodeJS.Timer | null = null;
  private pyramidCheckInterval: NodeJS.Timer | null = null;
  private reconcileInterval: NodeJS.Timer | null = null; // Combined housekeeping (reconcile + low-balance)
  // Pairs exited for stale reasons in the current cycle — block re-entry until next cycle
  private staleExitedPairsThisCycle = new Set<string>();
  private lowBalanceCheckInterval: NodeJS.Timer | null = null; // kept for stop() cleanup reference
  private lastLowBalanceCheckTs = 0; // tracks last low-balance check within housekeeping interval

  // OPTIMIZATION: OHLC cache to avoid refetching same data multiple times per cycle
  // Cache structure: Map<pair:timeframe, { data: OHLCCandle[], timestamp: number }>
  private ohlcCache = new Map<string, { data: any[], timestamp: number }>();
  private get OHLC_CACHE_TTL_MS() { return getEnvironmentConfig().OHLC_CACHE_TTL_MS_ORCHESTRATOR; }

  // REGIME CACHE: Populated by main orchestrator cycle (60s ADX detection)
  // Used by high-frequency peak tracking loop to avoid ADX fetches every second
  // Key: pair, Value: { regime, timestamp }
  private regimeCache = new Map<string, { regime: string; timestamp: number }>();
  private get REGIME_CACHE_TTL_MS() { return getEnvironmentConfig().REGIME_CACHE_TTL_MS; }

  // HOT-PATH REUSE: Pre-allocated maps cleared between cycles (avoid GC pressure in 1s peak loop)
  private readonly _pairsByExchange = new Map<string, Set<string>>();
  private readonly _pricesByExchangePair = new Map<string, any>();

  // MARKET STATUS: Last cycle result exposed to the dashboard API
  private lastCycleStatus: {
    pairs: Record<string, {
      regime: string;
      momentum1h: number;
      momentum4h: number;
      volumeRatio: number;
      blockReason: string | null;
      blockStage: string | null;
      enteredAt: string | null;
    }>;
    updatedAt: number;
  } = { pairs: {}, updatedAt: 0 };

  public getMarketStatus() {
    return this.lastCycleStatus;
  }

  // EVENT-DRIVEN EROSION: In-memory trade data for tick callbacks (no DB on each tick)
  // Key: tradeId, Value: trade snapshot needed to compute net profit on every tick
  private tickTradeCache = new Map<string, {
    tradeId: string;
    pair: string;
    exchange: string;
    entryPrice: number;
    quantity: number;
    feeDollars: number;
    botInstanceId: string;
    entryTimeMs: number;
    stopLoss: number | null;
    emergencyLossLimit: number;
  }>();
  // Unsubscribe functions keyed by pair (one active trade per pair)
  private tickUnsubs = new Map<string, () => void>();

  // Kept as empty map — was signal confirmation gate (removed: cooldowns forbidden per CLAUDE.md)
  private signalConfirmationCache = new Map<string, number>();


  /**
   * Register a WS-tick erosion callback for a trade.
   * Fires on every Binance ticker event (~100-500ms) instead of the 1.5s poll.
   * Uses only in-memory data — zero DB hits per tick.
   */
  private registerTickErosion(trade: {
    id: string; pair: string; exchange: string;
    entry_price: string | number; quantity: string | number;
    bot_instance_id: string; fee: string | null;
    entry_time?: any; stop_loss?: string | number | null;
    emergencyLossLimit?: number;
  }): void {
    const ex = (trade.exchange || 'binance').toLowerCase();
    if (ex !== 'binance') return; // Only WS-fed pairs

    const entryPrice = parseFloat(String(trade.entry_price));
    const quantity = parseFloat(String(trade.quantity));
    if (!isFinite(entryPrice) || entryPrice <= 0) return;

    // Snapshot trade data for use inside the tick callback (no DB access needed)
    const feeDollars = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getCachedTakerFee(ex));
    const entryTimeMs = trade.entry_time ? this.parseEntryTime(trade.entry_time) : Date.now();
    const stopLoss = trade.stop_loss ? parseFloat(String(trade.stop_loss)) : null;
    const emergencyLossLimit = trade.emergencyLossLimit ?? -0.06;
    this.tickTradeCache.set(trade.id, {
      tradeId: trade.id,
      pair: trade.pair,
      exchange: ex,
      entryPrice,
      quantity,
      feeDollars,
      botInstanceId: trade.bot_instance_id,
      entryTimeMs,
      stopLoss,
      emergencyLossLimit,
    });

    // Avoid double-registering the same pair (one active trade per pair)
    if (this.tickUnsubs.has(trade.pair)) return;

    const unsub = livePriceStore.onTick(trade.pair, (_pair, tickPrice) => {
      // Collect ALL trades for this pair — every user's open trade gets protection
      type TradeEntry = { tradeId: string; pair: string; exchange: string; entryPrice: number; quantity: number; feeDollars: number; botInstanceId: string; entryTimeMs: number; stopLoss: number | null; emergencyLossLimit: number };
      const tradesOnPair: Array<{ id: string; data: TradeEntry }> = [];
      for (const [tid, t] of this.tickTradeCache) {
        if (t.pair === _pair) tradesOnPair.push({ id: tid, data: t });
      }
      if (tradesOnPair.length === 0) return;

      // Use bid price for exit calculations — computed once, shared across all trades on this pair
      const liveData = livePriceStore.get(_pair);
      const exitPrice = (liveData?.bid && liveData.bid > 0) ? liveData.bid : tickPrice;

      for (const { id: foundId, data: cached } of tradesOnPair) {

      const exitFee = exitPrice * cached!.quantity * getCachedTakerFee(cached!.exchange);
      const totalFee = cached!.feeDollars + exitFee;
      const totalFeePct = (totalFee / (cached!.entryPrice * cached!.quantity)) * 100;
      const grossPct = ((exitPrice - cached!.entryPrice) / cached!.entryPrice) * 100;
      const netPct = grossPct - totalFeePct;

      const cachedRegime = this.regimeCache.get(_pair);
      const regime = (cachedRegime && (Date.now() - cachedRegime.timestamp) < this.REGIME_CACHE_TTL_MS)
        ? cachedRegime.regime : 'moderate';

      // ── UNDERWATER PROTECTION (tick-speed) ──────────────────────────────────
      // These checks run on every WS tick (~100ms) to catch sudden crashes before
      // the 20s orchestrator cycle can react. Critical for flash crashes.
      if (grossPct < 0) {
        const tradeAgeMinutes = (Date.now() - cached!.entryTimeMs) / 60000;
        let exitReason: string | null = null;

        // 1. STOP LOSS — price crossed the stop loss price
        if (cached!.stopLoss && exitPrice <= cached!.stopLoss) {
          exitReason = 'stop_loss';
          logger.warn('⚡ STOP LOSS HIT (tick-driven)', {
            tradeId: foundId, pair: _pair, exitPrice, stopLoss: cached!.stopLoss, grossPct: grossPct.toFixed(3),
          });
        }

        // 2. EMERGENCY STOP — catastrophic loss safety net
        if (!exitReason && netPct < cached!.emergencyLossLimit * 100) {
          exitReason = 'emergency_stop';
          logger.warn('🚨 EMERGENCY STOP (tick-driven)', {
            tradeId: foundId, pair: _pair, netPct: netPct.toFixed(3),
            limit: (cached!.emergencyLossLimit * 100).toFixed(1) + '%',
          });
        }

        // 3. EARLY LOSS — time-scaled threshold, only when past 1-minute noise window
        if (!exitReason && tradeAgeMinutes >= 1) {
          const earlyLossThreshold = this.getEarlyLossThreshold(tradeAgeMinutes, regime) * 100;
          if (grossPct < earlyLossThreshold) {
            // Check profitable collapse: peaked ≥ PROFIT_COLLAPSE_MIN_PEAK_PCT, now underwater
            const env = getEnvironmentConfig();
            const peakData = positionTracker.getPeakProfit(foundId);
            const peakPct = peakData?.peakPct || 0;
            const profitCollapseMinPeakPct = env.PROFIT_COLLAPSE_MIN_PEAK_PCT * 100;

            if (peakPct >= profitCollapseMinPeakPct) {
              exitReason = 'underwater_profitable_collapse';
              logger.warn('🚨 PROFITABLE COLLAPSE (tick-driven)', {
                tradeId: foundId, pair: _pair, peakPct: peakPct.toFixed(3), grossPct: grossPct.toFixed(3),
              });
            } else {
              exitReason = peakPct > 0 ? 'underwater_small_peak_timeout' : 'underwater_never_profited';
              logger.warn(`🔴 EARLY LOSS (tick-driven) — ${exitReason}`, {
                tradeId: foundId, pair: _pair, grossPct: grossPct.toFixed(3),
                threshold: earlyLossThreshold.toFixed(3) + '%', ageMinutes: tradeAgeMinutes.toFixed(1),
              });
            }
          }
        }

        if (exitReason) {
          this.unregisterTickErosion(_pair, foundId);
          const profitLoss = (exitPrice - cached!.entryPrice) * cached!.quantity;
          closeTrade({
            botInstanceId: cached!.botInstanceId,
            tradeId: foundId,
            pair: _pair,
            exitTime: new Date().toISOString(),
            exitPrice,
            profitLoss,
            profitLossPercent: grossPct,
            exitReason,
            entryPrice: cached!.entryPrice,
          }).then(r => {
            if (r.ok) {
              positionTracker.clearPosition(foundId!);
              logger.info('⚡ Loss cut (tick-driven)', { tradeId: foundId, pair: _pair, exitReason, profitLoss: profitLoss.toFixed(2) });
            }
          }).catch(() => {});
        }
        continue; // Done with this trade — no peak update needed for underwater trades
      }
      // ── END UNDERWATER PROTECTION ────────────────────────────────────────────

      // Update peak using GROSS percent — fees must not suppress peak registration
      // (net can stay negative even when gross is positive, blocking erosion cap from arming)
      positionTracker.updatePeakIfHigher(foundId, grossPct, exitPrice, totalFee).catch(() => {});

      // Check erosion cap
      const erosionResult = positionTracker.checkErosionCap(foundId, _pair, netPct, regime, exitPrice);

      if (erosionResult.shouldExit) {
        // Unsubscribe immediately to prevent re-firing while close is in-flight
        this.unregisterTickErosion(_pair, foundId);

        const profitLoss = (exitPrice - cached!.entryPrice) * cached!.quantity;
        logger.info('⚡ EROSION CAP (tick-driven): Locking profit', {
          tradeId: foundId, pair: _pair, netPct: netPct.toFixed(4),
          peak: erosionResult.peakProfitPct.toFixed(4), reason: erosionResult.reason,
        });

        closeTrade({
          botInstanceId: cached!.botInstanceId,
          tradeId: foundId,
          pair: _pair,
          exitTime: new Date().toISOString(),
          exitPrice,
          profitLoss,
          profitLossPercent: grossPct,
          exitReason: erosionResult.reason || 'erosion_cap_exceeded',
          entryPrice: cached!.entryPrice,
        }).then(r => {
          if (r.ok) {
            positionTracker.clearPosition(foundId!);
            logger.info('💰 Profit locked (tick-driven)', { tradeId: foundId, pair: _pair, profitLoss: profitLoss.toFixed(2) });
          }
        }).catch(() => {});
      }
      } // end for tradesOnPair
    });

    this.tickUnsubs.set(trade.pair, unsub);
  }

  /** Remove tick callback for a pair/trade. Call when trade closes. */
  private unregisterTickErosion(pair: string, tradeId: string): void {
    const unsub = this.tickUnsubs.get(pair);
    if (unsub) { unsub(); this.tickUnsubs.delete(pair); }
    this.tickTradeCache.delete(tradeId);
  }

  /**
   * Helper: Parse entry_time correctly (handle string or Date object from database)
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
    // Convert to string and check if it already has timezone info
    const timeStr = String(entryTime);
    // If no timezone indicator (Z, +, or -HH:MM), append 'Z' to force UTC interpretation
    // PostgreSQL 'timestamp without time zone' returns formats like: "2026-01-27 01:30:35.549"
    // or "2026-01-27T01:30:35.549" - neither has timezone, so Date() treats as local time
    if (!timeStr.includes('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
      // Replace space with 'T' if needed (PostgreSQL format) and append 'Z' for UTC
      const isoStr = timeStr.replace(' ', 'T') + 'Z';
      return new Date(isoStr).getTime();
    }
    return new Date(entryTime).getTime();
  }

  /**
   * Start the orchestrator (runs on configurable interval)
   */
  async start(intervalMs: number = 20000) {
    if (this.isRunning) {
      logger.warn('Trade signal orchestrator already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting trade signal orchestrator', { intervalMs });

    // Initialize position tracker from database (load peak profits from previous session)
    await positionTracker.initializeFromDatabase();

    // Warm OHLC cache before the main loop starts — prevents "fetch failed" errors on the
    // first few cycles when the undici pool is cold and no stale cache exists yet.
    warmOHLCCache(['BTC/USDT', 'ETH/USDT'], ['1h', '4h']).catch(err => {
      logger.warn('OHLC cache warm-up failed on startup', { error: err instanceof Error ? err.message : String(err) });
    });

    // Start Binance User Data Streams for all live running bots.
    // Real-time fill detection via WebSocket (~100ms) replaces polling for external closes.
    startUserDataStreamsForAllLiveBots().catch(err => {
      logger.warn('Failed to start Binance user data streams on startup', { error: err instanceof Error ? err.message : String(err) });
    });
    // GHOST TRADE RECONCILIATION: On every startup, scan for open DB trades that actually
    // closed on the exchange (WebSocket missed fill during crash/restart). Runs once on
    // startup then every 5 minutes to catch any fills missed by the WebSocket.
    reconcileBinanceFills().catch(err => {
      logger.warn('Startup fill reconciliation failed', { error: err instanceof Error ? err.message : String(err) });
    });
    // HOUSEKEEPING: Single 5-min interval combining fill reconciliation (every tick)
    // and low-balance check (every 15 min = every 3rd tick). Reduces interval count from 5 → 4.
    this.lastLowBalanceCheckTs = Date.now(); // treat startup run as first check
    this.reconcileInterval = setInterval(() => {
      reconcileBinanceFills().catch(err => {
        logger.warn('Periodic fill reconciliation failed', { error: err instanceof Error ? err.message : String(err) });
      });
      // Low-balance check: every 15 minutes within the same interval
      if (Date.now() - this.lastLowBalanceCheckTs >= 15 * 60_000) {
        this.lastLowBalanceCheckTs = Date.now();
        this.checkLowBalanceForLiveBots().catch(err => {
          logger.warn('Low balance proactive check error', { error: err instanceof Error ? err.message : String(err) });
        });
      }
    }, 5 * 60_000);
    // Run low-balance check once immediately on startup
    this.checkLowBalanceForLiveBots().catch(() => {});

    // HIGH-FREQUENCY PEAK TRACKING (runs every 5 seconds)
    // CRITICAL: Captures peak profits quickly so erosion protection and green-to-red
    // protection can work correctly. Without this, trades can go from +0.03% to -0.30%
    // between main orchestrator cycles (60s) and peak is never recorded.
    const peakTrackingIntervalMs = parseInt(process.env.PEAK_TRACKING_INTERVAL_MS || '1000', 10);
    logger.info('Starting high-frequency peak tracking', { peakTrackingIntervalMs });

    this.peakTrackingInterval = setInterval(async () => {
      if (this.isPeakRunning) return; // skip if previous tick still running
      this.isPeakRunning = true;
      try {
        await this.updatePeaksForAllOpenTrades();
      } catch (error) {
        logger.error('Peak tracking error', error instanceof Error ? error : null);
      } finally {
        this.isPeakRunning = false;
      }
    }, peakTrackingIntervalMs);

    // PYRAMID CHECK: Dedicated interval — faster than main cycle to catch L1/L2 triggers
    // promptly without waiting up to 20s. Uses OHLC cache so no extra API calls.
    // Default 5s: fast enough to catch pyramid triggers before erosion cap can fire,
    // slow enough to avoid DB contention with the 1s HF loop.
    const pyramidCheckIntervalMs = parseInt(process.env.PYRAMID_CHECK_INTERVAL_MS || '5000', 10);
    logger.info('Starting pyramid check interval', { pyramidCheckIntervalMs });

    this.pyramidCheckInterval = setInterval(async () => {
      if (this.isPyramidRunning) return;
      this.isPyramidRunning = true;
      try {
        await this.addPyramidLevelsToOpenTrades([]);
      } catch (error) {
        logger.error('Pyramid check interval error', error instanceof Error ? error : null);
      } finally {
        this.isPyramidRunning = false;
      }
    }, pyramidCheckIntervalMs);

    this.interval = setInterval(async () => {
      if (this.isCycleRunning) {
        logger.warn('Orchestrator: previous cycle still running, skipping tick');
        return;
      }
      this.isCycleRunning = true;
      this.lastHeartbeat = Date.now();
      const cycleStart = Date.now();
      try {
        await this.analyzeAndExecuteSignals();
      } catch (error) {
        logger.error('Trade signal orchestrator error', error instanceof Error ? error : null);
      } finally {
        const cycleMs = Date.now() - cycleStart;
        if (cycleMs > intervalMs * 0.8) {
          logger.warn('Orchestrator: slow cycle', { cycleMs, intervalMs, utilizationPct: Math.round((cycleMs / intervalMs) * 100) });
        }
        this.isCycleRunning = false;
      }
    }, intervalMs);
  }

  /**
   * Stop the orchestrator
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval as NodeJS.Timeout);
      this.interval = null;
    }
    if (this.peakTrackingInterval) {
      clearInterval(this.peakTrackingInterval as NodeJS.Timeout);
      this.peakTrackingInterval = null;
    }
    if (this.pyramidCheckInterval) {
      clearInterval(this.pyramidCheckInterval as NodeJS.Timeout);
      this.pyramidCheckInterval = null;
    }
    if (this.lowBalanceCheckInterval) {
      clearInterval(this.lowBalanceCheckInterval as NodeJS.Timeout);
      this.lowBalanceCheckInterval = null;
    }
    if (this.reconcileInterval) {
      clearInterval(this.reconcileInterval as NodeJS.Timeout);
      this.reconcileInterval = null;
    }
    // Unsubscribe all tick callbacks
    for (const unsub of this.tickUnsubs.values()) { try { unsub(); } catch {} }
    this.tickUnsubs.clear();
    this.tickTradeCache.clear();
    logger.info('🛑 Trade signal orchestrator stopped');
  }

  /**
   * HIGH-FREQUENCY PEAK TRACKING + GREEN-TO-RED PROTECTION
   * Runs every 5 seconds (configurable via PEAK_TRACKING_INTERVAL_MS)
   *
   * CRITICAL: This method captures peak profits quickly before they erode.
   * Without this, trades can peak at +0.03% and drop to -0.30% between
   * the main orchestrator cycles (60s), and the peak is never recorded.
   *
   * Also implements IMMEDIATE green-to-red protection:
   * "Profitable trades turning negative is a design failure" (CLAUDE.md)
   * If a trade was ever profitable (peak > 0) and is now underwater (current < 0),
   * exit immediately - don't wait for the next 60s cycle.
   */
  private async updatePeaksForAllOpenTrades(): Promise<void> {
    try {
      // Get all open trades with full data needed for exits
      const openTrades = await query<{
        id: string;
        bot_instance_id: string;
        pair: string;
        entry_price: string;
        quantity: string;
        entry_time: any;
        user_id: string;
        fee: string | null;
        exchange: string;
        stop_loss: string | null;
        config: any;
        entry_notes: any;
      }>(
        `SELECT t.id, t.bot_instance_id, t.pair, t.entry_price, t.quantity, t.entry_time, b.user_id, t.fee, b.exchange, t.stop_loss, b.config, t.entry_notes
         FROM trades t
         INNER JOIN bot_instances b ON t.bot_instance_id = b.id
         WHERE t.status = 'open'`
      );

      if (openTrades.length === 0) {
        return; // No trades to track
      }

      // Group pairs by exchange for accurate pricing (reuse pre-allocated maps)
      this._pairsByExchange.clear();
      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        if (!this._pairsByExchange.has(ex)) this._pairsByExchange.set(ex, new Set());
        this._pairsByExchange.get(ex)!.add(trade.pair);
      }
      const pairsByExchange = this._pairsByExchange;

      // Fetch prices: prefer live WebSocket store (zero latency, no DB) for Binance,
      // fall back to aggregator (PG kv_cache) for non-Binance or cold start.
      this._pricesByExchangePair.clear();
      const pricesByExchangePair = this._pricesByExchangePair;
      for (const [ex, pairs] of pairsByExchange.entries()) {
        if (ex === 'binance') {
          // Use live in-process store — fed directly by WS ticker, no cache TTL lag
          for (const pair of pairs) {
            const live = livePriceStore.get(pair);
            if (live && !livePriceStore.isStale(pair, 5000)) {
              pricesByExchangePair.set(`${ex}:${pair}`, { price: live.price, bid: live.bid, ask: live.ask });
            }
          }
          // Fall back to aggregator for any pairs not yet in live store (cold start)
          const missing = Array.from(pairs).filter(p => !pricesByExchangePair.has(`${ex}:${p}`));
          if (missing.length > 0) {
            const data = await marketDataAggregator.getMarketData(missing, ex);
            for (const [pair, priceData] of data.entries()) {
              pricesByExchangePair.set(`${ex}:${pair}`, priceData);
            }
          }
        } else {
          const data = await marketDataAggregator.getMarketData(Array.from(pairs), ex);
          for (const [pair, priceData] of data.entries()) {
            pricesByExchangePair.set(`${ex}:${pair}`, priceData);
          }
        }
      }

      let updatedCount = 0;
      let exitCount = 0;

      // Hoist tracked-positions lookup outside the per-trade loop — O(1) .has() instead of O(n) .includes()
      const trackedSet = positionTracker.getTrackedPositions();

      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        const priceData = pricesByExchangePair.get(`${ex}:${trade.pair}`);
        if (!priceData) {
          continue; // No price data for this pair
        }

        const currentPrice = priceData.price;
        const entryPrice = parseFloat(String(trade.entry_price));
        const quantity = parseFloat(String(trade.quantity));

        // Skip if entry price is invalid (prevents NaN propagation and missed exits)
        if (!isFinite(entryPrice) || entryPrice <= 0) {
          logger.warn('Invalid entry price encountered in peak tracking, skipping trade', {
            tradeId: trade.id,
            rawEntryPrice: trade.entry_price,
          });
          continue;
        }

        // Calculate NET profit (gross - entry fee - estimated exit fee)
        // This is what the user ACTUALLY makes after fees
        const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const entryFeeDollars = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getCachedTakerFee(trade.exchange));
        const exitFeeDollars = currentPrice * quantity * getCachedTakerFee(trade.exchange);
        const totalFeeDollars = entryFeeDollars + exitFeeDollars;
        const totalFeePct = (totalFeeDollars / (entryPrice * quantity)) * 100;
        const netProfitPct = grossProfitPct - totalFeePct;
        const currentProfitPct = netProfitPct; // All decisions use NET profit

        const isTracked = trackedSet.has(trade.id);

        // Get regime from cache (populated by main orchestrator cycle every ~20s via ADX detection)
        // Fall back to 'moderate' if cache is stale or pair not yet seen by main cycle
        const cachedRegime = this.regimeCache.get(trade.pair);
        const regime = (cachedRegime && (Date.now() - cachedRegime.timestamp) < this.REGIME_CACHE_TTL_MS)
          ? cachedRegime.regime
          : 'moderate';

        // CRITICAL FIX: Always record position data for untracked trades (even underwater)
        // This prevents degraded mode (percentage-only tracking) which causes premature exits
        if (!isTracked) {
          const entryTimeMs = this.parseEntryTime(trade.entry_time);
          await positionTracker.recordPeak(
            trade.id,
            grossProfitPct,
            entryTimeMs,
            entryPrice,
            quantity,
            currentPrice,
            totalFeeDollars
          );
          updatedCount++;
          // Register event-driven tick callback so erosion AND crash protection fire at WS cadence (~100ms)
          const botCfg = typeof trade.config === 'string' ? JSON.parse(trade.config || '{}') : (trade.config || {});
          this.registerTickErosion({
            ...trade,
            emergencyLossLimit: parseFloat(botCfg?.emergencyLossLimit || '-0.06'),
          });
          logger.debug('Peak tracking: recorded initial position data (NET profit)', {
            tradeId: trade.id,
            pair: trade.pair,
            grossProfitPct: grossProfitPct.toFixed(4),
            netProfitPct: netProfitPct.toFixed(4),
            totalFeePct: totalFeePct.toFixed(4),
            entryPrice,
            quantity,
            currentPrice,
          });
        }

        // CASE 1: Trade has gross profit - update peak AND check erosion cap
        // Use GROSS profit for peak so fees don't prevent peak from registering
        if (grossProfitPct > 0) {
          if (isTracked) {
            // Update peak if current is higher - pass currentPrice for absolute value tracking
            await positionTracker.updatePeakIfHigher(trade.id, grossProfitPct, currentPrice, totalFeeDollars);
            updatedCount++;

            // TRAILING STOP - single source of truth for profit protection
            // Arms at EROSION_PEAK_MIN_PCT (0.2% of cost), exits when profit pulls back EROSION_PEAK_RELATIVE_THRESHOLD (15%) from peak
            const erosionResult = positionTracker.checkErosionCap(
              trade.id,
              trade.pair,
              netProfitPct,    // Use NET profit
              regime,
              currentPrice     // Required for absolute value comparison
            );

            if (erosionResult.shouldExit) {
              logger.info('🔒 EROSION CAP: Locking profit - exiting while still green', {
                tradeId: trade.id,
                pair: trade.pair,
                peakProfitPct: erosionResult.peakProfitPct.toFixed(4),
                currentProfitPct: grossProfitPct.toFixed(4),
                erosionUsedPct: (erosionResult.erosionUsedPct * 100).toFixed(1) + '%',
                reason: erosionResult.reason,
              });

              // Exit with profit locked
              const exitPrice = currentPrice;
              const profitLoss = (exitPrice - entryPrice) * quantity;

              // NO fee guard — erosion cap means CLOSE NOW, even if fees make it net-negative.
              // A small fee-driven loss is far better than letting the trade go underwater.
              // "Profitable trades turning negative is a design failure" (CLAUDE.md)

              try {
                const closeResult = await closeTrade({
                  botInstanceId: trade.bot_instance_id,
                  tradeId: trade.id,
                  pair: trade.pair,
                  exitTime: new Date().toISOString(),
                  exitPrice,
                  profitLoss,
                  profitLossPercent: grossProfitPct,
                  exitReason: erosionResult.reason || 'erosion_cap_exceeded',
                  entryPrice: parseFloat(String(trade.entry_price)),
                  entryFee: trade.fee ? parseFloat(String(trade.fee)) : undefined,
                });

                if (closeResult.ok) {
                  exitCount++;
                  positionTracker.clearPosition(trade.id);
                  this.unregisterTickErosion(trade.pair, trade.id);
                  logger.info('💰 Profit locked: Trade closed with gain', {
                    tradeId: trade.id,
                    pair: trade.pair,
                    exitPrice,
                    profitLoss: profitLoss.toFixed(2),
                    profitLossPct: '+' + currentProfitPct.toFixed(4) + '%',
                    peakProfitPct: '+' + erosionResult.peakProfitPct.toFixed(4) + '%',
                  });
                  continue; // Move to next trade
                } else {
                  if (closeResult.reason === 'profit_protection_invalid_for_red_trade') {
                    // Only profit_target exits get aborted when red — erosion cap exits now always execute
                    logger.warn('⚠️ PROFIT TARGET EXIT ABORTED: Trade went red during execution', {
                      tradeId: trade.id,
                      pair: trade.pair,
                      reason: 'Price slipped from green to red during execution',
                      note: 'Position NOT cleared - trade will continue',
                    });
                  } else {
                    logger.error('Erosion cap exit failed', null, {
                      tradeId: trade.id,
                      error: closeResult.error,
                    });
                  }
                }
              } catch (closeError) {
                logger.error('Erosion cap exit failed', closeError instanceof Error ? closeError : null);
              }
            }

            // CHECK PROFIT TARGET (high-frequency) — same frequency as erosion cap
            // Profit target is the PRIMARY profitable exit — must fire before erosion cap can steal it.
            // Uses cached regime from main orchestrator cycle (no ADX fetch needed here).
            if (!erosionResult.shouldExit) {
              const hfEnv = getEnvironmentConfig();
              const hfOverrides = await getParamOverrides();
              let profitTarget: number;
              switch (regime) {
                case 'choppy':       profitTarget = hfOverrides.PROFIT_TARGET_CHOPPY ?? hfEnv.PROFIT_TARGET_CHOPPY; break;
                case 'transitioning':profitTarget = hfEnv.PROFIT_TARGET_TRANSITIONING; break;
                case 'weak':         profitTarget = hfOverrides.PROFIT_TARGET_WEAK ?? hfEnv.PROFIT_TARGET_WEAK; break;
                case 'strong':       profitTarget = hfOverrides.PROFIT_TARGET_STRONG ?? hfEnv.PROFIT_TARGET_STRONG; break;
                default:             profitTarget = hfOverrides.PROFIT_TARGET_MODERATE ?? hfEnv.PROFIT_TARGET_MODERATE;
              }
              const profitTargetPct = profitTarget * 100; // e.g. 0.05 → 5%

              if (netProfitPct >= profitTargetPct) {
                logger.info('🎯 HF profit target hit', { pair: trade.pair, netProfitPct: netProfitPct.toFixed(2), target: profitTargetPct.toFixed(1), regime });
                const profitLoss = (currentPrice - entryPrice) * quantity;
                try {
                  const closeResult = await closeTrade({
                    botInstanceId: trade.bot_instance_id,
                    tradeId: trade.id,
                    pair: trade.pair,
                    exitTime: new Date().toISOString(),
                    exitPrice: currentPrice,
                    profitLoss,
                    profitLossPercent: grossProfitPct,
                    exitReason: 'profit_target',
                    entryPrice: parseFloat(String(trade.entry_price)),
                    entryFee: trade.fee ? parseFloat(String(trade.fee)) : undefined,
                  });
                  if (closeResult.ok) {
                    exitCount++;
                    positionTracker.clearPosition(trade.id);
                    this.unregisterTickErosion(trade.pair, trade.id);
                    logger.info('🎯 Profit target reached (high-frequency)', {
                      tradeId: trade.id,
                      pair: trade.pair,
                      regime,
                      netProfitPct: netProfitPct.toFixed(2) + '%',
                      profitTargetPct: profitTargetPct.toFixed(1) + '%',
                      profitLoss: profitLoss.toFixed(2),
                    });
                    continue;
                  }
                } catch (closeError) {
                  logger.error('HF profit target exit failed', closeError instanceof Error ? closeError : null);
                }
              }
            }
          }
        }
        // CASE 2: Trade is underwater but WAS profitable
        // DISABLED: Green-to-red immediate exit was too aggressive
        // With $2000-5000 positions, even a 0.03% micro-peak (just bid/ask spread) = $1.50
        // which exceeded the $0.50 threshold and caused EVERY trade to exit immediately
        // The 15-minute underwater timeout in checkOpenTradesForProfitTargets handles this properly
        else if (currentProfitPct < 0 && isTracked) {
          logger.debug('Trade underwater with peak data - handled by underwater timeout (15min)', {
            tradeId: trade.id,
            pair: trade.pair,
            currentProfitPct: currentProfitPct.toFixed(4),
          });
        }
      }

      if (updatedCount > 0 || exitCount > 0) {
        logger.debug('Peak tracking cycle complete', {
          tradesChecked: openTrades.length,
          peaksUpdated: updatedCount,
          greenToRedExits: exitCount,
        });
      }

      // LATENCY OPTIMIZATION (Priority 2): Flush all queued peak updates in batch
      await positionTracker.flushPendingUpdates();
    } catch (error) {
      // Don't spam logs on transient errors - this runs frequently
      logger.debug('Peak tracking cycle error (transient)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Main orchestration loop: fetch bots, analyze signals, execute trades, check momentum failure
   */
  private async analyzeAndExecuteSignals() {
    // Reset stale-exit tracking at the start of each cycle
    this.staleExitedPairsThisCycle.clear();
    try {
      // Get all active bots with enabled pairs
      const activeBots = await this.getActiveBots();
      if (activeBots.length === 0) {
        // No running bots for new entries, but still run exit checks for any open trades
        // (covers paused/stopped bots that still have open positions)
        await Promise.all([
          this.checkOpenTradesForMomentumFailure(),
          this.checkOpenTradesForProfitTargets(),
        ]);
        logger.debug('Orchestrator: no active bots found to trade');
        return;
      }

      logger.debug('Orchestrator: found active bots', {
        botCount: activeBots.length,
        bots: activeBots.map(b => ({ id: b.id, pairs: b.enabled_pairs?.length || 0 })),
      });

      // Initialize RiskManager from first bot's config (single source of truth)
      // All config comes from bot_instances.config JSONB, not environment variables
      if (activeBots.length > 0) {
        const botConfig = typeof activeBots[0].config === 'string'
          ? JSON.parse(activeBots[0].config)
          : activeBots[0].config;
        const firstBotExchange = activeBots[0].exchange || 'binance';
        riskManager.initializeFromBotConfig(botConfig, firstBotExchange);
      }

      // Collect all unique pairs from all active bots
      const allPairs = Array.from(
        new Set(activeBots.flatMap(bot => bot.enabled_pairs || []))
      );

      // Build pair → exchange map (first bot wins if pair appears on multiple exchanges)
      const pairExchangeMap = new Map<string, string>();
      for (const bot of activeBots) {
        for (const pair of (bot.enabled_pairs || [])) {
          if (!pairExchangeMap.has(pair)) {
            pairExchangeMap.set(pair, (bot.exchange || 'binance').toLowerCase());
          }
        }
      }

      if (allPairs.length === 0) {
        logger.debug('Orchestrator: no pairs configured on active bots');
        return; // No pairs configured
      }

      // Get environment config for spread check and other thresholds
      // Merge admin UI overrides (stored in kv_cache, updated without restart)
      const env = getEnvironmentConfig();
      const _adminOverrides = await getParamOverrides();
      const effectiveEnv = { ...env, ..._adminOverrides };

      logger.debug('Orchestrator: analyzing pairs', { pairs: allPairs, pairCount: allPairs.length });

      // Fetch market data once per exchange for all their pairs (warm cache)
      const pairsByExchangeWarm = new Map<string, string[]>();
      for (const [pair, ex] of pairExchangeMap.entries()) {
        if (!pairsByExchangeWarm.has(ex)) pairsByExchangeWarm.set(ex, []);
        pairsByExchangeWarm.get(ex)!.push(pair);
      }
      for (const [ex, pairs] of pairsByExchangeWarm.entries()) {
        await marketDataAggregator.getMarketData(pairs, ex);
      }

      // BTC 1h momentum — used for ETH position size reduction (Rec #3)
      let btcMomentum1h = 0;
      // BTC indicators lifted to outer scope so regime agent can use them
      let btcIndicatorsForAgents: import('@/types/ai').TechnicalIndicators = {};

      // ZERO PASS A: Fetch BTC momentum for drop protection (needed by risk manager)
      try {
        const btcPair = 'BTC/USDT';
        const btcExchange = pairExchangeMap.get(btcPair) || 'binance';

        const btcData = await marketDataAggregator.getMarketData([btcPair], btcExchange);
        const btcMarketData = btcData.get(btcPair);
        if (btcMarketData) {
          // Calculate BTC 1h momentum — use live price to avoid closed-candle staleness
          const btcRaw = await this.fetchAndCalculateIndicatorsWithCandles(btcPair, '15m', 100, btcExchange);
          const btcLivePrice = btcMarketData.price;
          if (btcRaw.candles.length >= 4) {
            const btcBase1h = btcRaw.candles[btcRaw.candles.length - 4].close;
            btcRaw.indicators.momentum1h = ((btcLivePrice - btcBase1h) / btcBase1h) * 100;
          }
          const btcCandles = btcRaw.indicators;
          btcIndicatorsForAgents = btcCandles; // expose to agents below
          if (btcCandles.momentum1h !== undefined) {
            btcMomentum1h = btcCandles.momentum1h; // store for per-pair ETH size reduction
            riskManager.updateBTCMomentum(btcCandles.momentum1h / 100); // Convert percent to decimal
            logger.debug('Orchestrator: BTC momentum updated for risk management', {
              btcPair,
              exchange: 'binance',
              btcMomentum1h: (btcCandles.momentum1h / 100).toFixed(4),
            });
          }
          // Pass BTC volume ratio to risk manager — blocks ALL pairs when BTC is illiquid
          if (btcCandles.volumeRatio !== undefined) {
            riskManager.updateBTCVolumeRatio(btcCandles.volumeRatio);
            logger.debug('Orchestrator: BTC volume ratio updated for risk management', {
              btcPair,
              btcVolumeRatio: btcCandles.volumeRatio.toFixed(3),
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch BTC momentum for risk manager', error instanceof Error ? error : undefined);
      }

      // DETERMINISTIC VOLUME THRESHOLD: tighten BTC volume requirement when 4h is mature/declining.
      // Replaces regime agent Claude call — same logic encoded as pure math.
      // When 4h strong (mature move) + 1h fading: use full env threshold (stricter).
      // Otherwise: use floor threshold (more permissive, captures early moves).
      {
        const envCfg = getEnvironmentConfig();
        const mom4h = btcIndicatorsForAgents.momentum4h ?? 0;
        const mom1h = btcIndicatorsForAgents.momentum1h ?? 0;
        const volRatio = btcIndicatorsForAgents.volumeRatio ?? 1;
        const isMatureFading = mom4h >= envCfg.TREND_EXHAUSTION_4H_MIN_PCT
          && mom1h < envCfg.TREND_EXHAUSTION_1H_MAX_PCT
          && volRatio < envCfg.TREND_EXHAUSTION_VOLUME_MAX;
        const envThreshold = envCfg.RISK_BTC_MIN_VOLUME_RATIO;
        const floorThreshold = envThreshold * envCfg.RISK_BTC_VOLUME_FLOOR_SCALE;
        riskManager.updateBTCVolumeThreshold(isMatureFading ? envThreshold : floorThreshold);
        logger.debug('Orchestrator: deterministic volume threshold set', {
          isMatureFading,
          mom4h: mom4h.toFixed(3),
          mom1h: mom1h.toFixed(3),
          volRatio: volRatio.toFixed(3),
          threshold: (isMatureFading ? envThreshold : floorThreshold).toFixed(3),
        });
      }

      // CAPITAL PRESERVATION: Layer 1 - BTC Daily Trend Gate (market-wide)
      // Blocks ALL entries if BTC is below EMA200 (sustained downtrend)
      // Reduces size 50% if BTC below EMA50 (weakening trend)
      let globalCpMultiplier = 1.0;
      try {
        const btcGateResult = await capitalPreservation.checkBtcTrendGate();
        if (!btcGateResult.allowTrading) {
          logger.info('🛡️ Capital preservation: BTC trend gate blocking ALL entries this cycle', {
            reason: btcGateResult.reason,
            layer: btcGateResult.layer,
          });
          return; // Skip entire cycle - BTC below EMA200
        }
        globalCpMultiplier = btcGateResult.sizeMultiplier;
        if (globalCpMultiplier < 1.0) {
          logger.info('🛡️ Capital preservation: BTC trend gate reducing position sizes', {
            multiplier: globalCpMultiplier,
            reason: btcGateResult.reason,
          });
        }
      } catch (error) {
        logger.warn('Capital preservation: BTC trend gate error, continuing with full size', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // ZERO PASS B: Detect market regime for all pairs (critical for entry gating)
      // This ensures the regime gatekeeper has fresh data for entry validation
      // Group pairs by exchange and detect regime per exchange
      logger.info('Orchestrator: detecting market regime for all pairs');

      // Group bots by exchange
      const botsByExchange = new Map<string, BotInstance[]>();
      for (const bot of activeBots) {
        if (!botsByExchange.has(bot.exchange)) {
          botsByExchange.set(bot.exchange, []);
        }
        botsByExchange.get(bot.exchange)!.push(bot);
      }

      // Detect regime for all exchanges in parallel (independent per exchange)
      await Promise.all(
        Array.from(botsByExchange.entries()).map(([exchange, bots]) => {
          const exchangePairs = Array.from(new Set(bots.flatMap(b => b.enabled_pairs || [])));
          logger.info('Orchestrator: detecting regime for exchange', {
            exchange,
            pairCount: exchangePairs.length,
            pairs: exchangePairs,
          });
          return regimeDetector.detectRegimeForAllPairs(exchangePairs, exchange);
        })
      );

      // EXIT CHECKS + OHLC PRE-FETCH run concurrently:
      // - Exit checks (momentum failure + profit targets) are independent of OHLC
      // - OHLC pre-fetch warms cache so signal analysis finds it hot immediately after
      // - Pyramid pass runs AFTER exits complete (needs to know which trades survived)
      const ohlcPrefetch = Promise.all(
        allPairs.map(pair => {
          const exchange = pairExchangeMap.get(pair) || 'binance';
          return this.getCachedOHLC(pair, '15m', 100, exchange).catch(err => {
            logger.debug('OHLC pre-fetch failed for pair (will retry in analysis)', { pair, error: err instanceof Error ? err.message : String(err) });
          });
        })
      );

      await Promise.all([
        this.checkOpenTradesForMomentumFailure(),
        this.checkOpenTradesForProfitTargets(),
        ohlcPrefetch,
      ]);

      // TRADE MONITOR AGENT: Advisory health check on open trades (fire-and-forget)
      // Non-blocking — result logged as HEALTHY/WATCH/CONCERN, never triggers exits.
      // Silently skipped on timeout or API failure.
      this.runTradeMonitorAgent(btcIndicatorsForAgents).catch(() => {});

      // PYRAMID PASS: Add levels to profitable open trades (after exits complete)
      await this.addPyramidLevelsToOpenTrades(allPairs);

      // FOURTH PASS: Analyze new signals and generate trade decisions
      // PARALLELIZED: All pairs analyzed concurrently — each pair is fully independent.
      // Before: 10 pairs × ~1500ms sequential = ~15s consumed per cycle
      // After:  Promise.all across all pairs = max(single pair latency) ≈ 1.5s
      logger.debug('Orchestrator cycle: momentum failure → profit targets → pyramiding → parallel signal analysis');

      type PairResult =
        | { type: 'decision'; decision: TradeDecision }
        | { type: 'rejected'; signal: Record<string, any> }
        | { type: 'skipped' };

      const pairResults = await Promise.all(
        allPairs.map(async (pair): Promise<PairResult> => {
          const pairExchange = pairExchangeMap.get(pair) || 'binance';
          try {
            // Skip pairs exited for stale reasons this cycle — signal still live, would re-trigger
            if (this.staleExitedPairsThisCycle.has(pair)) {
              logger.info('Skipping entry: pair had stale exit this cycle', { pair });
              return { type: 'skipped' };
            }


            // OPEN POSITION GUARD: Skip AI/Claude entirely if any active bot already
            // holds this pair. fan-out.ts does the per-bot DB check, but checking here
            // first avoids burning Claude API calls on pairs that will be skipped anyway.
            {
              const baseAsset = pair.split('/')[0];
              const openPos = await query<{ id: string }>(
                `SELECT t.id FROM trades t
                 JOIN bot_instances b ON b.id = t.bot_instance_id
                 WHERE b.status = 'running'
                 AND t.pair LIKE $1
                 AND t.status = 'open'
                 LIMIT 1`,
                [`${baseAsset}/%`]
              );
              if (openPos.length > 0) {
                logger.debug('Skipping analysis: open position already exists for pair', { pair, baseAsset });
                return { type: 'skipped' };
              }
            }

            // NO RE-ENTRY COOLDOWN — cooldowns are forbidden (CLAUDE.md).
            // Each setup is evaluated on its own merit via the 5-stage risk filter.
            // If conditions now meet entry criteria, the previous loss is irrelevant.

            // ============================================
            // 5-STAGE RISK FILTER (/nexus parity - BEFORE AI)
            // ============================================
            let indicators;
            let candles;
            try {
              const result = await this.fetchAndCalculateIndicatorsWithCandles(pair, '15m', 100, pairExchange);
              indicators = result.indicators;
              candles = result.candles;
            } catch (indicatorError) {
              logger.warn('Failed to fetch indicators for pre-entry risk check', {
                pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
              return { type: 'skipped' };
            }

            const marketData = await marketDataAggregator.getMarketData([pair], pairExchange);
            const currentPriceData = marketData.get(pair);
            if (!currentPriceData) {
              logger.warn('No market data for pre-entry risk check', { pair });
              return { type: 'skipped' };
            }
            // LIVE PRICE OVERRIDE: Always prefer WebSocket price over aggregator in-process cache.
            // The aggregator's in-process cache has a 10-15s TTL — during a fast dump it
            // returns a pre-dump price, making momentum look positive when the market is falling.
            // livePriceStore is fed directly by WS ticks (~100-500ms) — zero TTL lag.
            // Result: ALL downstream momentum calculations use real market price, not stale cache.
            let currentPrice = currentPriceData.price;
            {
              const liveData = livePriceStore.get(pair);
              const livePriceCfg = getEnvironmentConfig();
              if (liveData && (Date.now() - liveData.timestamp) < livePriceCfg.LIVE_PRICE_MAX_AGE_MS) {
                const divergence = Math.abs(liveData.price - currentPrice) / currentPrice;
                if (divergence > livePriceCfg.LIVE_PRICE_DIVERGENCE_LOG_PCT) {
                  logger.info('Orchestrator: live WS price diverges from aggregator cache — using live price', {
                    pair,
                    cachedPrice: currentPrice,
                    livePrice: liveData.price,
                    divergencePct: (divergence * 100).toFixed(3),
                    liveAgeMs: Date.now() - liveData.timestamp,
                  });
                }
                // SPIKE GUARD: if WS price is significantly above the aggregator (sustained average),
                // momentum1h would be recalculated using the spiked price → inflated signal.
                // The spike hasn't been validated as sustained — skip this cycle and wait for
                // the aggregator to catch up (confirming the move is real, not a flash spike).
                if (divergence > livePriceCfg.LIVE_PRICE_SPIKE_BLOCK_PCT) {
                  logger.info('🚫 Orchestrator: entry blocked — live price spike vs aggregator cache', {
                    pair,
                    cachedPrice: currentPrice,
                    livePrice: liveData.price,
                    divergencePct: (divergence * 100).toFixed(3),
                    threshold: (livePriceCfg.LIVE_PRICE_SPIKE_BLOCK_PCT * 100).toFixed(2) + '%',
                    note: 'momentum1h would be spike-inflated — waiting for aggregator to confirm',
                  });
                  this.signalConfirmationCache.delete(pair); // reset — spike means prior reading was inflated
                  return { type: 'skipped' };
                }
                currentPrice = liveData.price;
              }
            }

            // CRITICAL: Real-time intrabar momentum — checks if price is currently falling
            // Uses last CLOSED candle's close (not open) as reference — the OHLC fetcher drops
            // the in-progress candle (slice(0,-1)), so lastCandle.open is 0-29min stale.
            // Comparing currentPrice to lastCandle.close answers: "is price up from last confirmed close?"
            const lastCandle = candles[candles.length - 1];
            const intrabarMomentum = ((currentPrice - lastCandle.close) / lastCandle.close) * 100;
            indicators.intrabarMomentum = intrabarMomentum;

            // LIVE MOMENTUM: Override closed-candle momentum1h/4h with live price as current close.
            // Closed candles are up to 15m stale — in fast crypto this misses breakouts entirely.
            // Formula identical to market-analysis.ts but anchors to currentPrice instead of last close.
            if (candles.length >= 4) {
              const base1h = candles[candles.length - 4].close;
              indicators.momentum1h = ((currentPrice - base1h) / base1h) * 100;
            }
            if (candles.length >= 8) {
              const base2h = candles[candles.length - 8].close;
              indicators.momentum2h = ((currentPrice - base2h) / base2h) * 100;
            }
            if (candles.length >= 16) {
              const base4h = candles[candles.length - 16].close;
              indicators.momentum4h = ((currentPrice - base4h) / base4h) * 100;
            }
            if (candles.length >= 32) {
              const base8h = candles[candles.length - 32].close;
              indicators.momentum8h = ((currentPrice - base8h) / base8h) * 100;
            }

            // TREND DIRECTION SCORE — zero/near-zero lag signals for fast recovery detection
            // Replaces lagging ROC-based health gate: don't ask "are you above 4h ago?"
            // Ask: "are you moving UP right now?" — fires 1-3 candles into any real recovery.
            if (candles.length >= 6) {
              // Signal 1: HIGHER CLOSES — last 2 candles each closed above the prior close
              // Pure price action, zero lag. Filters noise (one green candle isn't enough).
              // 2 consecutive (3 candles) catches slow creeping uptrends; 3 consecutive was
              // too strict and blocked valid entries during sustained low-volatility grinds.
              const c = candles;
              const n = c.length;
              const higherCloses =
                c[n - 1].close > c[n - 2].close &&
                c[n - 2].close > c[n - 3].close;
              indicators.higherCloses = higherCloses;

              // Signal 2: MOMENTUM SLOPE — is 1h ROC improving vs 30min ago?
              // Even if still negative, -0.3% → -0.1% = direction change confirmed.
              // base2h_30mAgo: the 1h-ago reference shifted 2 candles back
              const mom1hNow = indicators.momentum1h ?? 0;
              const base1h_30mAgo = c[n - 6].close; // reference for 1h ROC from 30min ago
              const mom1h_30mAgo = ((c[n - 2].close - base1h_30mAgo) / base1h_30mAgo) * 100;
              const momentumSlope = mom1hNow - mom1h_30mAgo;
              indicators.momentumSlope = momentumSlope;

              // Trend score: 2/3 signals = entry allowed (intrabar already gated separately)
              const slopeImproving = momentumSlope > 0;
              const intrabarUp = intrabarMomentum > 0;
              indicators.trendScore = [higherCloses, slopeImproving, intrabarUp].filter(Boolean).length;
            }

            // SHARP DROP RECOVERY (V-shape detection)
            // Looks back 4 candles (1h) to find a panic drop followed by a recovery.
            // Pattern: high → sharp drop → current price recovered >= 50% of drop.
            // 15m candles: 4 candles = 1h window, catches fast V-shapes within the hour.
            if (candles.length >= 6) {
              const c = candles;
              const n = c.length;
              // Find highest high and lowest low in the last 4 closed candles
              const lookback = c.slice(n - 4, n);
              const windowHigh = Math.max(...lookback.map((x: { high: number }) => x.high));
              const windowLow = Math.min(...lookback.map((x: { low: number }) => x.low));
              const dropMagnitude = windowHigh > 0 ? ((windowHigh - windowLow) / windowHigh) * 100 : 0;
              const minDrop = effectiveEnv.SHARP_DROP_MIN_PCT ?? 1.5; // default 1.5% minimum drop
              if (dropMagnitude >= minDrop) {
                const recoveryRatio = windowHigh > windowLow
                  ? (currentPrice - windowLow) / (windowHigh - windowLow)
                  : 0;
                const minRecovery = effectiveEnv.SHARP_DROP_MIN_RECOVERY_RATIO ?? 0.5; // default 50% recovered
                indicators.sharpDropRecovery = recoveryRatio >= minRecovery && intrabarMomentum > 0;
                indicators.dropMagnitudePct = dropMagnitude;
                indicators.recoveryRatioPct = recoveryRatio;
              } else {
                indicators.sharpDropRecovery = false;
              }
            }

            const bid = currentPriceData.bid;
            const ask = currentPriceData.ask;
            let spreadPct = 0.001;
            if (bid && ask && bid > 0) {
              spreadPct = (ask - bid) / bid;
            }

            logger.debug('Orchestrator: pair scan', { pair, price: currentPrice, trendScore: indicators.trendScore, higherCloses: indicators.higherCloses, slope: (indicators.momentumSlope || 0).toFixed(3), intrabar: intrabarMomentum.toFixed(2), mom4h: (indicators.momentum4h || 0).toFixed(2), volRatio: (indicators.volumeRatio || 1).toFixed(2), spreadPct: (spreadPct * 100).toFixed(3) });

            // PRE-CHECK: Block entry if spread exceeds maximum
            const maxEntrySpreadPct = env.MAX_ENTRY_SPREAD_PCT || 0.003;
            if (spreadPct > maxEntrySpreadPct) {
              logger.info('🚫 Orchestrator: entry blocked - spread too wide', { pair, spreadPct: (spreadPct * 100).toFixed(3), maxSpreadPct: (maxEntrySpreadPct * 100).toFixed(2), bid, ask, reason: 'Wide spread erases profit potential' });
              return { type: 'rejected', signal: { pair, reason: 'spread_too_wide', details: `Spread ${(spreadPct * 100).toFixed(3)}% > ${(maxEntrySpreadPct * 100).toFixed(2)}% max`, stage: 'Pre-Filter' } };
            }

            // NOTE: Intrabar hard pre-filter removed — it blocked entries for entire 15m candles
            // when price pulled back slightly from the candle open (same value cycle after cycle).
            // trendScore already includes intrabar > 0 as one of three signals — redundant here.

            // Run 5-stage risk filter. Health Gate uses leading signals only (direction score 2/3,
            // slope, intrabar). 1h and 4h floors removed — they're lagging; used for regime context only.
            const ticker = { bid, ask, spread: spreadPct };
            const riskFilter = await riskManager.runFullRiskFilter(pair, currentPrice, indicators, ticker);

            if (!riskFilter.pass) {
              logger.info('🚫 Orchestrator: entry blocked by 5-stage risk filter', { pair, reason: riskFilter.reason, stage: riskFilter.stage, momentum1h: indicators.momentum1h?.toFixed(3), momentum4h: indicators.momentum4h?.toFixed(3) });
              this.lastCycleStatus.pairs[pair] = { regime: this.regimeCache.get(pair)?.regime || 'unknown', momentum1h: indicators.momentum1h ?? 0, momentum4h: indicators.momentum4h ?? 0, volumeRatio: indicators.volumeRatio ?? 0, blockReason: riskFilter.reason ?? null, blockStage: riskFilter.stage ?? null, enteredAt: null };
              this.lastCycleStatus.updatedAt = Date.now();
              this.signalConfirmationCache.delete(pair); // reset — pair no longer qualifies
              return { type: 'rejected', signal: { pair, reason: 'risk_filter_blocked', details: riskFilter.reason, stage: riskFilter.stage } };
            }

            logger.info('✅ Orchestrator: risk filter passed', { pair, momentum4h: indicators.momentum4h?.toFixed(3), momentum1h: indicators.momentum1h?.toFixed(3) });

            // 1H MOMENTUM FLOOR REMOVED — 1h is a lagging indicator.
            // It measures what happened in the past hour. Using it as an entry gate causes
            // the bot to enter AFTER the move is already 40-60% complete (near the local top).
            //
            // 1h and 4h are now CONTEXT ONLY: they determine regime classification
            // (weak/moderate/strong) which sets position size and profit target.
            //
            // ENTRY is gated by LEADING signals (already handled above by health gate):
            //   - intrabar > 0     → price rising RIGHT NOW
            //   - slope > 0        → momentum accelerating
            //   - higherCloses     → recent candles confirming direction
            //   - volumeRatio      → buyers present
            //
            // HARD BLOCKS remain (crash guard, BTC dump, spread) — these are real-time conditions
            // not lagging indicators.
            //
            // Transition detector agent is not used — it was wired to adjust the 1h floor
            // which no longer exists. Intrabar gate is the real-time entry gate.
            const isBinance = (pairExchangeMap.get(pair) || 'binance').toLowerCase() === 'binance';
            // isStrong4hBypass no longer needed for 1h floor — keep for confirmation window only
            const isStrong4hBypass = (() => {
              const mom4h = indicators.momentum4h ?? 0;
              const intrabar = indicators.intrabarMomentum ?? 0;
              const bypass4hThreshold = effectiveEnv.RISK_STRONG_4H_BYPASS_THRESHOLD ?? 0.80;
              const bypass4hIntrabarMin = effectiveEnv.RISK_STRONG_4H_BYPASS_INTRABAR_MIN ?? 0.15;
              return mom4h >= bypass4hThreshold && intrabar >= bypass4hIntrabarMin;
            })();
            // Log regime context so it's visible in logs (not a gate, just informational)
            {
            }

            // Regime agent removed — replaced by deterministic Trend Exhaustion rule above.

            // higherCloses gate REMOVED — functioned as a de-facto cooldown (forced 2-3h wait
            // for hourly candle confirmation), violating CLAUDE.md "no cooldowns/delays" rule.
            // Entry quality is handled by: momentum thresholds, AI veto, trend exhaustion veto.

            // INTRABAR MOMENTUM GATE: the PRIMARY entry gate. Blocks when price is declining NOW.
            // Since 1h is no longer a gate (lagging), intrabar is the real-time signal confirming
            // the move is still active at the moment of entry — not just that it was active 1h ago.
            // isTrending now uses 4h (more reliable trend indicator) instead of 1h (lagging).
            {
              const intrabar = indicators.intrabarMomentum ?? 0;
              const mom1h = indicators.momentum1h ?? 0;
              const mom4h = indicators.momentum4h ?? 0;
              // Use 4h to determine if we're in a trending market (not 1h — lagging)
              const isTrending = mom4h >= effectiveEnv.REGIME_MODERATE_4H_PCT;
              const minIntrabar = isTrending
                ? (effectiveEnv.ENTRY_MIN_INTRABAR_MOMENTUM_TRENDING ?? 0)
                : (effectiveEnv.ENTRY_MIN_INTRABAR_MOMENTUM_CHOPPY ?? 0);
              // Strong trend bypass: strong 1h momentum allows intrabar >= 0 (normal pullback in uptrend)
              // Never enter a candle already declining (intrabar < 0).
              const bypassThreshold = effectiveEnv.RISK_INTRABAR_BYPASS_1H_MIN ?? 1.5;
              const strongTrendBypass = mom1h >= bypassThreshold && intrabar >= 0.0;
              if (intrabar < minIntrabar && !strongTrendBypass) {
                logger.info('🚫 Orchestrator: entry blocked — intrabar momentum below minimum', {
                  pair, intrabar: intrabar.toFixed(3), minIntrabar, isTrending,
                });
                this.lastCycleStatus.pairs[pair] = { regime: this.regimeCache.get(pair)?.regime || 'unknown', momentum1h: indicators.momentum1h ?? 0, momentum4h: indicators.momentum4h ?? 0, volumeRatio: indicators.volumeRatio ?? 0, blockReason: `intrabar ${intrabar.toFixed(3)}% < ${minIntrabar}% minimum`, blockStage: 'Intrabar Gate', enteredAt: null };
                this.lastCycleStatus.updatedAt = Date.now();
                this.signalConfirmationCache.delete(pair); // reset — pair no longer qualifies
                return { type: 'rejected', signal: { pair, reason: 'risk_filter_blocked', details: `intrabar ${intrabar.toFixed(3)}% < ${minIntrabar}%`, stage: 'Intrabar Gate' } };
              }
              if (strongTrendBypass && intrabar < minIntrabar) {
                logger.info('✅ Orchestrator: intrabar gate bypassed — strong 1h trend', {
                  pair, intrabar: intrabar.toFixed(3), mom1h: mom1h.toFixed(3), bypassThreshold,
                });
              }
            }

            // DAY TREND GATE: block entries during sustained intraday downtrends.
            // 8h momentum measures the full intraday move. When it's deeply negative,
            // 1h/4h bounces are dead-cat — the larger trend dominates.
            {
              const mom8h = indicators.momentum8h ?? 0;
              const dayTrendMin = effectiveEnv.ENTRY_DAY_TREND_MIN_8H;
              if (mom8h < dayTrendMin) {
                logger.info('🚫 Orchestrator: entry blocked — sustained intraday downtrend', {
                  pair, momentum8h: mom8h.toFixed(3), threshold: dayTrendMin,
                });
                this.lastCycleStatus.pairs[pair] = { regime: this.regimeCache.get(pair)?.regime || 'unknown', momentum1h: indicators.momentum1h ?? 0, momentum4h: indicators.momentum4h ?? 0, volumeRatio: indicators.volumeRatio ?? 0, blockReason: `8h momentum ${mom8h.toFixed(3)}% < ${dayTrendMin}% — intraday downtrend`, blockStage: 'Day Trend Gate', enteredAt: null };
                this.lastCycleStatus.updatedAt = Date.now();
                this.signalConfirmationCache.delete(pair);
                return { type: 'rejected', signal: { pair, reason: 'risk_filter_blocked', details: `8h momentum ${mom8h.toFixed(3)}% < ${dayTrendMin}% — intraday downtrend, bounces are traps`, stage: 'Day Trend Gate' } };
              }
            }

            // CREEPING UPTREND DETECTION: slow sustained grind with low volume.
            // Signals the AI to judge candle consistency, not volume explosiveness.
            // Gates: both momentum timeframes positive + not in deep pullback.
            // Volume NOT required — low volume IS the signature of a creeping grind.
            // priceNearHigh removed — creeping uptrends can be mid-range, not just at highs.
            let isCreepingUptrend = false;
            if (env.CREEPING_UPTREND_ENABLED) {
              const mom1hVal = indicators.momentum1h ?? 0;
              const mom4hVal = indicators.momentum4h ?? 0;
              const recentHigh = Math.max(...candles.slice(-16).map(c => c.high));
              const priceToHighRatio = recentHigh > 0 ? currentPrice / recentHigh : 0;

              const mom1hOk = mom1hVal >= env.CREEPING_UPTREND_GATE_MIN_1H;
              const mom4hOk = mom4hVal >= env.CREEPING_UPTREND_GATE_MIN_4H;
              // Block only if price has pulled back more than PULLBACK_THRESHOLD from recent high
              const noPullback = env.CREEPING_UPTREND_PULLBACK_THRESHOLD <= 0
                || priceToHighRatio >= env.CREEPING_UPTREND_PULLBACK_THRESHOLD;
              // Block if price is already AT the recent high — move is over, not starting
              const notAtTop = env.CREEPING_UPTREND_PRICE_TOP_THRESHOLD <= 0
                || priceToHighRatio <= env.CREEPING_UPTREND_PRICE_TOP_THRESHOLD;

              isCreepingUptrend = mom1hOk && mom4hOk && noPullback && notAtTop;

              if (isCreepingUptrend) {
                const volRatio = indicators.volumeRatio ?? 1;
                logger.info('📈 Orchestrator: creeping uptrend detected', { pair, mom1h: mom1hVal.toFixed(3), mom4h: mom4hVal.toFixed(3), volumeRatio: volRatio.toFixed(2), priceToHighRatio: priceToHighRatio.toFixed(4) });
              }
            }

            // V-SHAPE REBOUND ENTRY PATH
            // Bypasses momentum floor gates when a sharp panic drop has recovered >= 50%.
            // 4h will always be negative after a sudden drop — that's expected, not a filter.
            // Requirements: confirmed drop >= SHARP_DROP_MIN_PCT, recovery >= 50%,
            //               intrabar positive (still rising), higherCloses (2+ candles confirming).
            // Trades tagged isRebound=true → tighter erosion cap in position-tracker.
            let isReboundEntry = false;
            if (
              effectiveEnv.SHARP_DROP_RECOVERY_ENABLED &&
              indicators.sharpDropRecovery &&
              indicators.higherCloses &&
              intrabarMomentum > 0
            ) {
              isReboundEntry = true;
              logger.info('📈 Orchestrator: V-shape rebound entry detected', {
                pair,
                dropMagnitudePct: (indicators.dropMagnitudePct ?? 0).toFixed(2),
                recoveryRatioPct: (indicators.recoveryRatioPct ?? 0).toFixed(2),
                mom1h: (indicators.momentum1h ?? 0).toFixed(3),
                mom4h: (indicators.momentum4h ?? 0).toFixed(3),
                intrabar: intrabarMomentum.toFixed(3),
              });
            }

            const analysis = await analyzeMarket({
              pair,
              timeframe: '1h',
              includeSignal: true,
              includeRegime: true,
              currentPrice,
              indicators,
              isCreepingUptrend,
              isReboundEntry,
              regimeContext: null, // regime agent removed — deterministic veto in analyzer.ts
              minMomentum1h: isBinance ? effectiveEnv.RISK_MIN_MOMENTUM_1H_BINANCE : effectiveEnv.RISK_MIN_MOMENTUM_1H,
            });

            logger.info('Orchestrator: analyzeMarket returned', { pair, hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence, regimeType: analysis.regime?.regime });

            const regime = analysis.regime?.regime?.toLowerCase() || 'moderate';

            logger.info('Orchestrator: regime detected', { pair, regime, signalConfidence: analysis.signal?.confidence });

            // AI confidence is advisory only — entry is gated by leading signals (intrabar, slope,
            // direction score). AI veto (signal === null) is still respected as explicit veto.
            if (analysis.signal && analysis.regime) {
              if (analysis.signal.signal !== 'buy') {
                return { type: 'rejected', signal: { pair, reason: 'not_buy', signal: analysis.signal.signal, confidence: analysis.signal.confidence } };
              }

              // Cost floor validated pre-AI in Risk Manager Stage 5 (uses live spread + RISK_COST_FLOOR_MULTIPLIER)
              const effectiveRegime = analysis.regime.regime as any;
              const entryPath = 'momentum';
              const decision: TradeDecision = {
                pair,
                side: 'buy',
                price: analysis.signal.entryPrice,
                amount: 1,
                stopLoss: analysis.signal.stopLoss,
                takeProfit: analysis.signal.takeProfit,
                reason: `AI signal (strength: ${analysis.signal.strength}, confidence: ${analysis.signal.confidence}%, regime: ${effectiveRegime}) - matching /nexus`,
                timestamp: new Date(),
                signalConfidence: analysis.signal.confidence,
                regime: {
                  type: effectiveRegime,
                  confidence: analysis.regime.confidence / 100,
                  reason: analysis.regime.analysis,
                  timestamp: analysis.regime.timestamp,
                },
                capitalPreservationMultiplier: globalCpMultiplier,
                entryNotes: {
                  momentum1h: indicators.momentum1h ?? 0,
                  momentum4h: indicators.momentum4h ?? 0,
                  confidence: analysis.signal.confidence,
                  regime: effectiveRegime,
                  entryPath,
                  volumeRatio: indicators.volumeRatio ?? 0,
                  isRebound: isReboundEntry,
                  dropMagnitudePct: indicators.dropMagnitudePct ?? 0,
                  recoveryRatioPct: indicators.recoveryRatioPct ?? 0,
                },
              };

              // Reduce ETH position when BTC 1h momentum is negative
              if (pair.startsWith('ETH') && btcMomentum1h < 0) {
                decision.capitalPreservationMultiplier = (decision.capitalPreservationMultiplier ?? 1) * effectiveEnv.RISK_ETH_BTC_NEG_MULTIPLIER;
                logger.info('Orchestrator: ETH position halved — BTC 1h momentum negative', { pair, btcMomentum1h: btcMomentum1h.toFixed(3), newMultiplier: decision.capitalPreservationMultiplier });
              }

              // NO confirmation gate — enter on first qualifying signal every cycle.
              // Cooldowns are FORBIDDEN (CLAUDE.md). The 5-stage risk filter + intrabar gate
              // already validate the signal in real-time. A 60s delay caused late fills at the
              // top of moves, triggering immediate early-loss exits instead of booking profit.
              this.signalConfirmationCache.delete(pair);

              const regimeClass = effectiveRegime.toUpperCase();
              const expectedTarget = `${(riskManager.getProfitTarget(effectiveRegime) * 100).toFixed(1)}%`;
              logger.info('📈 Orchestrator: TRADE DECISION CREATED', { pair, signalStrength: analysis.signal.strength, confidence: analysis.signal.confidence, entryPrice: analysis.signal.entryPrice, stopLoss: analysis.signal.stopLoss, takeProfit: analysis.signal.takeProfit, regime: effectiveRegime, regimeClass, expectedProfitTarget: expectedTarget, mom1h: (indicators.momentum1h ?? 0).toFixed(2), mom4h: (indicators.momentum4h ?? 0).toFixed(2), btcMomentum1h: btcMomentum1h.toFixed(3), cpMultiplier: decision.capitalPreservationMultiplier });
              this.lastCycleStatus.pairs[pair] = { regime: effectiveRegime, momentum1h: indicators.momentum1h ?? 0, momentum4h: indicators.momentum4h ?? 0, volumeRatio: indicators.volumeRatio ?? 0, blockReason: null, blockStage: null, enteredAt: new Date().toISOString() };
              this.lastCycleStatus.updatedAt = Date.now();

              return { type: 'decision', decision };

            } else if (analysis.signal == null) {
              // null = AI veto (set explicitly in analyzer.ts); undefined = no signal generated
              const reason = analysis.signal === null ? 'ai_veto' : 'no_signal';
              logger.warn('⛔ Orchestrator: signal blocked or absent', { pair, reason, hasRegime: !!analysis.regime, regimeType: analysis.regime?.regime });
              return { type: 'skipped' };
            } else {
              logger.warn('Orchestrator: signal rejected - unknown reason', { pair, hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence });
              return { type: 'skipped' };
            }
          } catch (error) {
            logger.error(`Orchestrator: failed to analyze ${pair}`, error instanceof Error ? error : null);
            return { type: 'skipped' };
          }
        })
      );

      // Collect results — pairs ran in parallel, merge into sequential arrays
      const tradeDecisions: TradeDecision[] = [];
      const rejectedSignals: Array<Record<string, any>> = [];
      for (const result of pairResults) {
        if (result.type === 'decision') tradeDecisions.push(result.decision);
        else if (result.type === 'rejected') rejectedSignals.push(result.signal);
      }

      // Log summary of rejected signals only if there are any
      if (rejectedSignals.length > 0) {
        logger.info('Orchestrator: signals rejected in this cycle', {
          count: rejectedSignals.length,
          details: rejectedSignals,
        });
      }

      // Execute each trade decision
      const allPlans: any[] = [];
      for (const decision of tradeDecisions) {
        try {
          const plans = await executionFanOut.fanOutTradeDecision(decision);
          if (plans.length > 0) {
            logger.info('📋 Orchestrator: execution plans created', {
              pair: decision.pair,
              side: decision.side,
              plansCount: plans.length,
            });
            allPlans.push(...plans);
          }
        } catch (error) {
          logger.error(
            `Orchestrator: failed to fan-out decision for ${decision.pair}`,
            error instanceof Error ? error : null
          );
        }
      }

      // Execute trades directly (/nexus parity - no job queue race conditions)
      if (allPlans.length > 0) {
        try {
          const result = await executionFanOut.executeTradesDirect(allPlans);
          logger.info('✅ Orchestrator: direct execution complete', {
            planCount: allPlans.length,
            executed: result.executed,
            skipped: result.skipped,
          });
        } catch (error) {
          logger.error(
            'Orchestrator: direct execution failed',
            error instanceof Error ? error : null
          );
        }
      }

      // LATENCY OPTIMIZATION (Priority 2): Flush all queued peak updates in batch
      await positionTracker.flushPendingUpdates();
    } catch (error) {
      logger.error('Orchestrator: main loop error', error instanceof Error ? error : null);
    }
  }

  /**
   * Fetch OHLC candles from Binance API and calculate technical indicators
   * CRITICAL: Do NOT return default indicators on error - only use real data for risk assessment
   *
   * PARITY REQUIREMENT: Must use 15m candles (not 1h) to match /nexus behavior!
   * With 15m candles: momentum1h = 4 candles, momentum4h = 16 candles
   * With 1h candles: those same calculations would give 4h and 16h momentum (WRONG!)
   */
  /**
   * Get cached OHLC data or fetch fresh if needed (OPTIMIZATION: Priority #1)
   * Reduces API calls from N per cycle to 1 per pair per 30 seconds
   */
  private async getCachedOHLC(pair: string, timeframe: string, limit: number, exchange: string = 'binance'): Promise<any[]> {
    const cacheKey = `${exchange}:${pair}:${timeframe}:${limit}`;
    const cached = this.ohlcCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.OHLC_CACHE_TTL_MS) {
      logger.debug('OHLC cache HIT', { pair, timeframe, exchange, ageMs: now - cached.timestamp });
      return cached.data;
    }

    logger.debug('OHLC cache MISS - fetching fresh', { pair, timeframe, exchange, limit });
    const candles = await fetchOHLC(pair, limit, timeframe, exchange);
    this.ohlcCache.set(cacheKey, { data: candles, timestamp: now });
    return candles;
  }

  private async fetchAndCalculateIndicators(pair: string, timeframe: string = '15m', limit: number = 100, exchange: string = 'binance') {
    // Use cached OHLC data to avoid redundant API calls (OPTIMIZATION)
    const candles = await this.getCachedOHLC(pair, timeframe, limit, exchange);

    if (candles.length < 26) {
      throw new Error(
        `Insufficient market data for ${pair}: ${candles.length} candles < 26 required`
      );
    }

    // Calculate technical indicators from real candles
    return calculateTechnicalIndicators(candles);
  }

  /**
   * Run trade monitor agent — exits CONCERN trades immediately.
   * Fetches open trades, passes to agent with BTC indicators for health assessment.
   * Any pair returned as CONCERN triggers an immediate close via the trade close API.
   */
  private async runTradeMonitorAgent(btcIndicators: import('@/types/ai').TechnicalIndicators): Promise<void> {
    const env = getEnvironmentConfig();
    if (!env.AI_TRADE_MONITOR_ENABLED) return;

    try {
      const openTradesRaw = await query<{
        id: string;
        pair: string;
        entry_price: string;
        entry_time: string;
        regime: string | null;
        bot_instance_id: string;
      }>(
        `SELECT t.id, t.pair, t.entry_price, t.entry_time,
                t.entry_notes->>'regime' AS regime,
                t.bot_instance_id
         FROM trades t
         JOIN bot_instances b ON b.id = t.bot_instance_id
         WHERE t.exit_time IS NULL AND b.status = 'running'
         LIMIT 10`
      );

      if (!openTradesRaw.length) return;

      const trades: OpenTradeContext[] = openTradesRaw.map(row => {
        const entry = parseFloat(row.entry_price);
        const livePrice = livePriceStore.getPrice(row.pair);
        const current = livePrice ?? entry;
        const ageMs = Date.now() - new Date(row.entry_time).getTime();
        const unrealizedPct = entry > 0 ? ((current - entry) / entry) * 100 : 0;
        return {
          pair: row.pair,
          entryPrice: entry,
          currentPrice: current,
          unrealizedPctGross: unrealizedPct,
          ageMinutes: ageMs / 60000,
          regime: row.regime ?? 'unknown',
        };
      });

      const concernPairs = await tradeMonitorAgent.analyze(trades, btcIndicators);

      if (concernPairs.length > 0) {
        // Exit CONCERN trades — AI detected conditions degrading (BTC reversing + trade not profitable)
        for (const concernPair of concernPairs) {
          const row = openTradesRaw.find(r => r.pair === concernPair);
          if (!row) continue;
          const livePrice = livePriceStore.getPrice(concernPair);
          if (!livePrice) continue;
          logger.warn('🚨 TradeMonitor: exiting CONCERN trade', {
            pair: concernPair,
            tradeId: row.id,
            exitPrice: livePrice,
            reason: 'ai_monitor_concern',
          });
          // Fire-and-forget close — same pattern as tick-level erosion exits
          fetch(`${env.NEXT_PUBLIC_APP_URL}/api/bots/trades/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tradeId: row.id,
              exitPrice: livePrice,
              reason: 'ai_monitor_concern',
              botInstanceId: row.bot_instance_id,
            }),
          }).catch(err => logger.error('TradeMonitor: close request failed', err));
        }
      }
    } catch {
      // non-critical
    }
  }

  /**
   * Fetch OHLC candles and calculate indicators (returns both for intrabar momentum calc)
   */
  private async fetchAndCalculateIndicatorsWithCandles(pair: string, timeframe: string = '15m', limit: number = 100, exchange: string = 'binance') {
    // Use cached OHLC data to avoid redundant API calls (OPTIMIZATION)
    const candles = await this.getCachedOHLC(pair, timeframe, limit, exchange);

    if (candles.length < 26) {
      throw new Error(
        `Insufficient market data for ${pair}: ${candles.length} candles < 26 required`
      );
    }

    const indicators = calculateTechnicalIndicators(candles);
    return { indicators, candles };
  }

  /**
   * Calculate early loss threshold based on trade age AND market regime
   * Philosophy: REGIME-AWARE thresholds - tight in chop, loose in trends
   *
   * CHOPPY (ADX < 25): Tight thresholds - cut losers fast
   *   0-5min: -1.0%, 5-30min: -0.8%, 30min-3h: -0.6%, 4h+: -0.4%, 1d+: -0.3%
   *
   * TRENDING (ADX >= 25): Loose thresholds - allow pullbacks
   *   0-5min: -1.5%, 5-30min: -2.5%, 30min-3h: -3.5%, 4h+: -4.5%, 1d+: -5.5%
   */
  private getEarlyLossThreshold(tradeAgeMinutes: number, regime: string = 'moderate'): number {
    const env = getEnvironmentConfig();

    // Determine if regime is trending or choppy
    // Trending = strong/moderate/weak/transitioning (positive momentum — use looser thresholds)
    // Choppy = only true 'choppy' regime (mom4h <= 0 — use tight thresholds)
    const isTrending = regime !== 'choppy';

    // Select thresholds based on regime
    const thresholds = isTrending ? {
      minute_1_5: env.EARLY_LOSS_TRENDING_MINUTE_1_5,
      minute_15_30: env.EARLY_LOSS_TRENDING_MINUTE_15_30,
      hour_1_3: env.EARLY_LOSS_TRENDING_HOUR_1_3,
      hour_4_plus: env.EARLY_LOSS_TRENDING_HOUR_4_PLUS,
      daily: env.EARLY_LOSS_TRENDING_DAILY,
    } : {
      minute_1_5: env.EARLY_LOSS_CHOPPY_MINUTE_1_5,
      minute_15_30: env.EARLY_LOSS_CHOPPY_MINUTE_15_30,
      hour_1_3: env.EARLY_LOSS_CHOPPY_HOUR_1_3,
      hour_4_plus: env.EARLY_LOSS_CHOPPY_HOUR_4_PLUS,
      daily: env.EARLY_LOSS_CHOPPY_DAILY,
    };

    // Returns threshold as decimal (e.g., -0.015 for -1.5%)
    // minute_1_5 covers 0-15 min — env var named _1_5 but intended for early trade window
    if (tradeAgeMinutes <= 15) {
      return thresholds.minute_1_5;
    } else if (tradeAgeMinutes <= 30) {
      return thresholds.minute_15_30;
    } else if (tradeAgeMinutes <= 180) { // 3 hours
      return thresholds.hour_1_3;
    } else if (tradeAgeMinutes <= 1440) { // 24 hours
      return thresholds.hour_4_plus;
    } else {
      return thresholds.daily; // 1+ day
    }
  }

  /**
   * Check open trades for momentum failure and close if conditions met
   * This is the FIRST PASS - exits happen before new entries
   */
  private async checkOpenTradesForMomentumFailure(): Promise<void> {
    if (!momentumFailureDetector.isEnabled()) {
      logger.debug('Momentum failure detector is disabled');
      return;
    }

    try {
      // Get ALL open trades (not just from active bots) to manage risk
      // Matches /nexus behavior: all open positions must be monitored for exits
      const openTrades = await query<any>(
        `SELECT
          t.id,
          t.bot_instance_id,
          t.pair,
          t.entry_price,
          t.quantity,
          t.entry_time,
          t.profit_loss,
          t.profit_loss_percent,
          t.fee,
          b.user_id,
          b.exchange
        FROM trades t
        INNER JOIN bot_instances b ON t.bot_instance_id = b.id
        WHERE t.status = 'open'
        ORDER BY t.entry_time ASC`
      );

      if (openTrades.length === 0) {
        logger.debug('No open trades to check for momentum failure');
        return;
      }

      logger.info('Checking open trades for momentum failure', {
        tradeCount: openTrades.length,
        pairs: Array.from(new Set(openTrades.map((t: any) => t.pair))),
      });

      // Batch price fetch: group by exchange, fetch all pairs at once before the loop
      const momPricesByPair = new Map<string, any>();
      const momPairsByExchange = new Map<string, string[]>();
      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        if (!momPairsByExchange.has(ex)) momPairsByExchange.set(ex, []);
        momPairsByExchange.get(ex)!.push(trade.pair);
      }
      await Promise.all(
        Array.from(momPairsByExchange.entries()).map(async ([ex, pairs]) => {
          const unique = [...new Set(pairs)];
          const data = await marketDataAggregator.getMarketData(unique, ex);
          for (const [pair, priceData] of data.entries()) momPricesByPair.set(pair, priceData);
        })
      );

      // Hoist tracked-positions lookup outside loop
      const momTrackedSet = positionTracker.getTrackedPositions();

      // Process each open trade
      let exitCount = 0;
      for (const trade of openTrades) {
        try {
          const currentPriceData = momPricesByPair.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair', { pair: trade.pair });
            continue;
          }

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));
          const momExchange = trade.exchange || 'binance';

          // Calculate NET profit for momentum check
          const momGrossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const momEntryFee = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getCachedTakerFee(momExchange));
          const momExitFee = currentPrice * quantity * getCachedTakerFee(momExchange);
          const momTotalFees = momEntryFee + momExitFee;
          const momFeePct = (momTotalFees / (entryPrice * quantity)) * 100;
          const profitPct = momGrossProfitPct - momFeePct;

          // Update GROSS profit metrics in database (trades API adds fee deduction at display)
          // CRITICAL: Write GROSS, not NET - prevents double fee deduction
          const profitLoss = (currentPrice - entryPrice) * quantity;
          try {
            await query(
              `UPDATE trades
               SET profit_loss = $1, profit_loss_percent = $2
               WHERE id = $3`,
              [profitLoss, momGrossProfitPct, trade.id]
            );
          } catch (updateError) {
            logger.debug('Failed to update momentum check profit metrics', {
              tradeId: trade.id,
            });
          }

          // Build OpenPosition object for momentum failure detector
          const entryTimeForPos = this.parseEntryTime(trade.entry_time);
          const holdTimeMinutes = (Date.now() - entryTimeForPos) / 60_000;
          const cachedRegime = this.regimeCache.get(trade.pair);
          const regime = (cachedRegime && (Date.now() - cachedRegime.timestamp) < this.REGIME_CACHE_TTL_MS)
            ? cachedRegime.regime
            : 'moderate';
          const peak = positionTracker.getPeakProfit(trade.id);
          const position: OpenPosition = {
            pair: trade.pair,
            entryPrice,
            currentPrice,
            profitPct,
            pyramidLevelsActivated: 0,
            holdTimeMinutes,
            regime,
            peakPct: peak?.peakPct,
          };

          // Update peak profit tracking using GROSS — fees must not suppress peak registration
          if (!momTrackedSet.has(trade.id)) {
            const entryTimeMs = this.parseEntryTime(trade.entry_time);
            await positionTracker.recordPeak(
              trade.id,
              momGrossProfitPct,
              entryTimeMs,
              entryPrice,
              quantity,
              currentPrice,
              momTotalFees
            );
          } else {
            await positionTracker.updatePeakIfHigher(trade.id, momGrossProfitPct, currentPrice, momTotalFees);
          }

          // Fetch and calculate real technical indicators
          const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');

          // Run momentum failure detector
          const momentumResult = momentumFailureDetector.detectMomentumFailure(
            position,
            indicators,
            regime
          );

          // If momentum failure detected, close the trade
          if (momentumResult.shouldExit) {
            // Calculate trade age to distinguish early vs late exit
            const entryTimeMs = this.parseEntryTime(trade.entry_time);
            const tradeAgeMinutes = (Date.now() - entryTimeMs) / (1000 * 60);
            const momExitType = tradeAgeMinutes > 0 && tradeAgeMinutes < 5
              ? 'momentum_failure_early'
              : 'momentum_failure_late';

            logger.info('Momentum failure detected - closing trade', {
              tradeId: trade.id,
              pair: trade.pair,
              currentPrice,
              profitPct: position.profitPct,
              tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
              exitType: momExitType,
              signals: momentumResult.signals,
              reasoning: momentumResult.reasoning,
            });

            // Calculate exit price and P&L
            const exitPrice = currentPrice;
            const profitLoss = currentPrice * parseFloat(String(trade.quantity)) -
                              entryPrice * parseFloat(String(trade.quantity));
            const profitLossPercent = profitPct;

            try {
              const closeResult = await closeTrade({
                botInstanceId: trade.bot_instance_id,
                tradeId: trade.id,
                pair: trade.pair,
                exitTime: new Date().toISOString(),
                exitPrice,
                profitLoss,
                profitLossPercent,
                exitReason: momExitType,
                entryPrice: parseFloat(String(trade.entry_price)),
                entryFee: trade.fee ? parseFloat(String(trade.fee)) : undefined,
              });

              if (closeResult.ok) {
                logger.info('Trade successfully closed by momentum failure detector', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  exitPrice,
                  profitLoss: profitLoss.toFixed(2),
                  profitLossPercent: profitLossPercent.toFixed(2),
                });
                positionTracker.clearPosition(trade.id);
                // Block same-cycle re-entry — market conditions haven't changed in 8s
                this.staleExitedPairsThisCycle.add(trade.pair);
                logger.info('Momentum failure exit: blocking same-cycle re-entry', { pair: trade.pair, exitType: momExitType });
                exitCount++;
              } else {
                logger.error('Failed to close trade (momentum failure)', null, {
                  tradeId: trade.id,
                  pair: trade.pair,
                  error: closeResult.error,
                });
              }
            } catch (closeError) {
              logger.error('Error closing trade', closeError instanceof Error ? closeError : null, {
                tradeId: trade.id,
                pair: trade.pair,
              });
            }
          } else if (momentumResult.signalCount > 0) {
            logger.debug('Momentum failure check - insufficient signals', {
              tradeId: trade.id,
              pair: trade.pair,
              profitPct: position.profitPct,
              signalCount: momentumResult.signalCount,
              required: 2,
              reasoning: momentumResult.reasoning,
            });
          }
        } catch (error) {
          logger.error(
            `Error checking momentum failure for trade ${trade.id}`,
            error instanceof Error ? error : null
          );
        }
      }

      logger.info('Momentum failure check completed', {
        tradesChecked: openTrades.length,
        tradesClosed: exitCount,
      });
    } catch (error) {
      logger.error(
        'Error in momentum failure check',
        error instanceof Error ? error : null
      );
    }
  }

  /**
   * Check open trades for profit targets, time-based exits, and profit erosion
   * This is the SECOND PASS - closes profitable trades before new entries
   */
  private async checkOpenTradesForProfitTargets(): Promise<void> {
    try {
      // Get ALL open trades (not just from active bots) to manage risk
      // Matches /nexus behavior: all open positions must be monitored for exits
      const openTrades = await query<any>(
        `SELECT
          t.id,
          t.bot_instance_id,
          t.pair,
          t.entry_price,
          t.quantity,
          t.entry_time,
          t.profit_loss,
          t.profit_loss_percent,
          t.peak_profit_percent,
          t.stop_loss,
          t.fee,
          b.user_id,
          b.config,
          b.exchange
        FROM trades t
        INNER JOIN bot_instances b ON t.bot_instance_id = b.id
        WHERE t.status = 'open'
        ORDER BY t.entry_time ASC`
      );

      if (openTrades.length === 0) {
        logger.debug('No open trades to check for profit targets');
        return;
      }

      logger.debug('Checking open trades for profit targets', {
        tradeCount: openTrades.length,
      });

      // BTC DUMP DETECTION — fetch BTC indicators once per cycle for dump exit check
      // If BTC is panic-selling (high volume + negative momentum), exit all underwater trades immediately
      const env = getEnvironmentConfig();
      let isBtcDumping = false;
      let btcDumpMom1h = 0;
      let btcDumpVolumeRatio = 0;
      // Use exchange from the first trade as the reference (BTC dump is correlated across exchanges)
      const btcDumpExchange = (openTrades[0]?.exchange || 'binance').toLowerCase();
      try {
        const btcIndicators = await this.fetchAndCalculateIndicators('BTC/USDT', '15m', 100, btcDumpExchange);
        btcDumpMom1h = btcIndicators.momentum1h || 0;
        btcDumpVolumeRatio = btcIndicators.volumeRatio || 1;
        isBtcDumping = btcDumpMom1h < env.BTC_DUMP_MOM1H_THRESHOLD && btcDumpVolumeRatio > env.BTC_DUMP_VOLUME_MIN;
        if (isBtcDumping) {
          logger.warn('🚨 BTC DUMP DETECTED - will exit underwater trades immediately', {
            btcMom1h: btcDumpMom1h.toFixed(2) + '%',
            btcVolumeRatio: btcDumpVolumeRatio.toFixed(2) + 'x',
            mom1hThreshold: env.BTC_DUMP_MOM1H_THRESHOLD + '%',
            volumeThreshold: env.BTC_DUMP_VOLUME_MIN + 'x',
          });
        }
      } catch (btcErr) {
        logger.debug('Could not fetch BTC indicators for dump check - skipping', {
          error: btcErr instanceof Error ? btcErr.message : String(btcErr),
        });
      }

      // Batch price fetch before loop: group by exchange, fetch all pairs at once
      const ptPricesByPair = new Map<string, any>();
      const ptPairsByExchange = new Map<string, string[]>();
      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        if (!ptPairsByExchange.has(ex)) ptPairsByExchange.set(ex, []);
        ptPairsByExchange.get(ex)!.push(trade.pair);
      }
      await Promise.all(
        Array.from(ptPairsByExchange.entries()).map(async ([ex, pairs]) => {
          const unique = [...new Set(pairs)];
          const data = await marketDataAggregator.getMarketData(unique, ex);
          for (const [pair, priceData] of data.entries()) ptPricesByPair.set(pair, priceData);
        })
      );

      // Hoist tracked-positions lookup outside loop
      const ptTrackedSet = positionTracker.getTrackedPositions();

      let exitCount = 0;
      for (const trade of openTrades) {
        try {
          const currentPriceData = ptPricesByPair.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair - skipping trade', { pair: trade.pair, tradeId: trade.id });
            continue;
          }

          const tradeExchange = (trade.exchange || 'binance').toLowerCase();
          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));

          // Calculate NET profit (gross - entry fee ONLY)
          // Exit fee deducted at close time, not during open monitoring
          // This matches /nexus (no fees) and exchange best practice
          const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const entryFeeDollars = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getCachedTakerFee(tradeExchange));
          const entryFeePct = (entryFeeDollars / (entryPrice * quantity)) * 100;
          const currentProfitPct = grossProfitPct - entryFeePct;

          // Parse entry_time correctly (handle string or Date object)
          const entryTimeMs = this.parseEntryTime(trade.entry_time);
          const rawTradeAgeMinutes = (Date.now() - entryTimeMs) / (1000 * 60);
          // Clamp to 0 minimum - negative ageMinutes means entry_time is in the future (data bug)
          // which would prevent time-based exits from ever firing
          const tradeAgeMinutes = Math.max(0, rawTradeAgeMinutes);
          if (rawTradeAgeMinutes < 0) {
            logger.warn('Trade entry_time is in the future (data integrity issue) - clamping ageMinutes to 0', {
              tradeId: trade.id,
              pair: trade.pair,
              entryTime: trade.entry_time,
              entryTimeMs,
              nowMs: Date.now(),
              rawAgeMinutes: rawTradeAgeMinutes.toFixed(1),
            });
          }

          // CRITICAL: Persist GROSS profit metrics to database for monitoring
          // Write GROSS P&L - the /api/trades endpoint adds fee deduction at display time
          // Writing NET here would cause DOUBLE FEE DEDUCTION (fees subtracted here + again in /api/trades)
          const currentProfitLoss = (currentPrice - entryPrice) * quantity;
          try {
            await query(
              `UPDATE trades
               SET profit_loss = $1, profit_loss_percent = $2
               WHERE id = $3`,
              [currentProfitLoss, grossProfitPct, trade.id]
            );
          } catch (updateError) {
            logger.warn('Failed to update trade profit metrics', {
              tradeId: trade.id,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
          }

          logger.debug('Processing open trade for exit checks', {
            tradeId: trade.id,
            pair: trade.pair,
            entryPrice,
            currentPrice,
            profitPct: currentProfitPct.toFixed(2),
            profitLoss: currentProfitLoss.toFixed(2),
            ageMinutes: tradeAgeMinutes.toFixed(1),
          });

          logger.debug('Trade price data calculated', {
            tradeId: trade.id,
            pair: trade.pair,
            currentPrice,
            entryPrice,
            currentProfitPct: currentProfitPct.toFixed(2),
            ageMinutes: tradeAgeMinutes.toFixed(1),
          });

          // Parse bot config for emergency loss limit
          const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
          const emergencyLossLimit = parseFloat(botConfig?.emergencyLossLimit || '-0.06'); // -6% emergency exit

          // Determine regime LIVE from momentum — never use stale bot config value
          let regime = 'moderate'; // safe fallback
          let liveMomentum1h = 0;
          try {
            const regimeIndicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
            liveMomentum1h = regimeIndicators?.momentum1h ?? 0;
            const liveMomentum4h = regimeIndicators?.momentum4h ?? 0;
            const liveMomentum2h = regimeIndicators?.momentum2h;
            regime = riskManager.getRegime(liveMomentum1h, liveMomentum4h, liveMomentum2h);
          } catch {
            // fallback to stored config regime if live fetch fails
            regime = botConfig?.regime || 'moderate';
          }

          // Cache regime for high-frequency peak tracking loop (avoids ADX fetch every second)
          this.regimeCache.set(trade.pair, { regime, timestamp: Date.now() });

          // ============================================
          // PEAK PROFIT TRACKING (for erosion cap)
          // ============================================
          // On first encounter, record the initial profit and entry time
          logger.debug('Checking if trade tracked', {
            tradeId: trade.id,
            isTracked: ptTrackedSet.has(trade.id),
            trackedCount: ptTrackedSet.size,
          });

          if (!ptTrackedSet.has(trade.id)) {
            const entryTimeMs = this.parseEntryTime(trade.entry_time);
            // Use GROSS profit for peak tracking — fees must not suppress peak registration
            await positionTracker.recordPeak(
              trade.id,
              grossProfitPct,
              entryTimeMs,
              entryPrice,
              quantity,
              currentPrice,
              entryFeeDollars
            );
            logger.debug('Position peak profit recorded (GROSS)', {
              tradeId: trade.id,
              pair: trade.pair,
              grossProfitPct: grossProfitPct.toFixed(2),
              netProfitPct: currentProfitPct.toFixed(2),
              entryFeePct: entryFeePct.toFixed(2),
              entryPrice,
              quantity,
              currentPrice,
            });
          } else {
            // Update peak using GROSS profit — fees must not suppress peak registration
            await positionTracker.updatePeakIfHigher(trade.id, grossProfitPct, currentPrice, entryFeeDollars);
            logger.debug('Position peak updated if higher (GROSS)', {
              tradeId: trade.id,
              currentProfitPct: currentProfitPct.toFixed(2),
            });
          }

          // Determine profit target based on REGIME (ADX-based with slope awareness)
          // Choppy: 1.5%, Transitioning: 2.5%, Weak: 2.5%, Moderate: 5%, Strong: 20%
          // ADX slope can downgrade strong → moderate when trend is exhausting
          const env = getEnvironmentConfig();
          let profitTarget: number;

          // Fetch current ADX slope for dynamic profit target adjustment
          profitTarget = riskManager.getProfitTarget(regime);

          logger.debug('Regime-based profit target selected', {
            tradeId: trade.id,
            pair: trade.pair,
            regime,
            profitTarget: (profitTarget * 100).toFixed(1) + '%',
            currentProfitPct: currentProfitPct.toFixed(2) + '%',
          });

          let shouldClose = false;
          let exitReason = '';

          // CHECK 0: Stop Loss Hit (HIGHEST PRIORITY - from /nexus implementation)
          // Exit immediately if price has fallen below stop loss threshold
          if (trade.stop_loss && currentPrice <= trade.stop_loss) {
            shouldClose = true;
            exitReason = 'stop_loss';
            logger.info('Stop loss hit for trade', {
              tradeId: trade.id,
              pair: trade.pair,
              entryPrice,
              currentPrice,
              stopLossPrice: trade.stop_loss,
              profitPct: currentProfitPct.toFixed(2),
            });
          }

          // ============================================
          // SIMPLIFIED EXIT LOGIC - 4 Core Checks
          // ============================================
          // Philosophy: Agile trading - get in green, get out fast
          // 0b. BTC DUMP EXIT - Market panic? Exit underwater now.
          // 1.  EROSION CAP - Had profit? Protect it.
          // 2.  EARLY LOSS - Never profitable? Cut losses.
          // 3.  EMERGENCY STOP - Safety net.

          // CHECK 0b: BTC DUMP EXIT — exit underwater trades during BTC panic selling
          // When BTC dumps (high volume + negative momentum), all crypto follows immediately.
          // Waiting for normal depth thresholds means riding down the entire dump.
          if (!shouldClose && isBtcDumping && grossProfitPct < 0) {
            const minAgeMinutes = env.BTC_DUMP_MIN_TRADE_AGE_MINUTES;
            if (tradeAgeMinutes >= minAgeMinutes) {
              shouldClose = true;
              exitReason = 'btc_dump_exit';
              logger.warn('🔴 BTC DUMP EXIT - exiting underwater trade during BTC panic sell', {
                tradeId: trade.id,
                pair: trade.pair,
                grossProfitPct: grossProfitPct.toFixed(2) + '%',
                tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
                btcMom1h: btcDumpMom1h.toFixed(2) + '%',
                btcVolumeRatio: btcDumpVolumeRatio.toFixed(2) + 'x',
              });
            }
          }

          // CHECK 1: EROSION CAP (was profitable → protect it)
          // If trade ever had NET profit and erosion exceeds cap → EXIT
          // Use NET profit so erosion only fires on truly green trades
          // Rebound trades get tighter erosion (lock gains faster on first dip)
          if (!shouldClose) {
            const isReboundTrade = !!(trade.entry_notes?.isRebound);
            const erosionCheck = positionTracker.checkErosionCap(
              trade.id,
              trade.pair,
              currentProfitPct,  // Use NET profit
              regime,
              currentPrice,      // Required for absolute value comparison
              isReboundTrade
            );

            if (erosionCheck.shouldExit) {
              shouldClose = true;
              exitReason = erosionCheck.reason || 'erosion_cap_exceeded';
              logger.info('🛡️ EROSION CAP - locking profit (/nexus)', {
                tradeId: trade.id,
                pair: trade.pair,
                peakProfit: '$' + erosionCheck.peakProfit.toFixed(2),
                currentProfit: '$' + erosionCheck.currentProfit.toFixed(2),
                erosionUsedPct: (erosionCheck.erosionUsedPct * 100).toFixed(1) + '%',
                regime,
                reason: exitReason,
              });
            }
          }

          // CHECK 1b: REMOVED - breakeven_protection caused fee churn on micro-peak trades
          // Closing near-zero NET trades just pays exit fees for nothing.
          // /nexus underwater logic (15-min gate + time-scaled thresholds) handles these correctly.
          // Stale flat trade exit (6h) catches anything that lingers.

          // CHECK 2: UNDERWATER EXIT (/nexus PositionTracker.ts:446-523)
          // CRITICAL: Uses GROSS profit (/nexus has no fees; NET triggers too early on low-fee exchanges)
          // Three exit reasons, each with its own trigger — NO blanket time gate.
          // The time-scaled thresholds ARE the protection against exiting on entry noise.
          //
          // A) PROFITABLE COLLAPSE: peaked ≥0.5% GROSS, now negative → IMMEDIATE
          // B) SMALL PEAK TIMEOUT: peaked > 0 but < 0.5%, GROSS loss > age-scaled threshold
          // C) NEVER PROFITED: never went positive, GROSS loss > age-scaled threshold
          const profitCollapseMinPeakPct = env.PROFIT_COLLAPSE_MIN_PEAK_PCT * 100; // e.g. 0.005 → 0.5%

          if (!shouldClose && grossProfitPct < 0) {
            const peakData = positionTracker.getPeakProfit(trade.id);
            const peakPct = peakData?.peakPct || 0;

            // A) PROFITABLE COLLAPSE — peaked ≥0.5% GROSS, now underwater → EXIT IMMEDIATELY
            if (peakPct >= profitCollapseMinPeakPct) {
              shouldClose = true;
              exitReason = 'underwater_profitable_collapse';
              logger.info('🚨 PROFITABLE COLLAPSE - peaked ≥0.5% GROSS, now underwater → IMMEDIATE EXIT', {
                tradeId: trade.id,
                pair: trade.pair,
                peakPct: peakPct.toFixed(2) + '%',
                grossProfitPct: grossProfitPct.toFixed(2) + '%',
                netProfitPct: currentProfitPct.toFixed(2) + '%',
                ageMinutes: tradeAgeMinutes.toFixed(1),
              });
            }
            // B & C) EARLY LOSS — time-scaled AND REGIME-AWARE thresholds
            // Choppy (ADX < 25): Tight thresholds - cut losers fast
            // Trending (ADX >= 25): Loose thresholds - allow pullbacks
            else {
              const earlyLossThreshold = this.getEarlyLossThreshold(tradeAgeMinutes, regime) * 100;

              if (grossProfitPct < earlyLossThreshold) {
                shouldClose = true;
                exitReason = peakPct > 0 ? 'underwater_small_peak_timeout' : 'underwater_never_profited';
                const isTrending = regime === 'moderate' || regime === 'strong';
                logger.info(`🔴 EARLY LOSS - ${isTrending ? 'TRENDING' : 'CHOPPY'} regime threshold hit`, {
                  tradeId: trade.id,
                  pair: trade.pair,
                  regime,
                  thresholdType: isTrending ? 'loose (trending)' : 'tight (choppy)',
                  grossProfitPct: grossProfitPct.toFixed(2) + '%',
                  netProfitPct: currentProfitPct.toFixed(2) + '%',
                  threshold: earlyLossThreshold.toFixed(2) + '%',
                  peakPct: peakPct.toFixed(2) + '%',
                  ageMinutes: tradeAgeMinutes.toFixed(1),
                  exitReason,
                });
              }
            }
          }

          // CHECK 2.4: MOMENTUM THESIS INVALIDATED
          // Fires only when 1h momentum goes NEGATIVE (< 0%) — not just below entry minimum.
          // In a rising market, 1h will fluctuate around 0.3% during pullbacks — that's normal.
          // Only exit early when momentum is genuinely reversed, not just breathing.
          // Mar 24 lesson: BTC 1h went 0.306% → 0.26% (still positive) → thesis invalidation fired
          // too early during a temporary pullback in an ongoing uptrend. Price was still rising.
          if (!shouldClose && grossProfitPct < 0 && env.ENTRY_THESIS_INVALIDATION_ENABLED) {
            const minAge = env.ENTRY_THESIS_INVALIDATION_MIN_AGE_MINUTES; // 10 min
            const invalidationLoss = env.ENTRY_THESIS_INVALIDATION_LOSS_PCT * 100; // -0.2%
            const peakData = positionTracker.getPeakProfit(trade.id);
            const peakPct = peakData?.peakPct || 0;

            if (
              tradeAgeMinutes >= minAge &&
              peakPct < profitCollapseMinPeakPct && // never confirmed (< 0.5% peak)
              grossProfitPct < invalidationLoss && // underwater enough
              liveMomentum1h < 0 // 1h is genuinely negative — not just below entry minimum
            ) {
              shouldClose = true;
              exitReason = 'momentum_thesis_invalidated';
              logger.info('📉 THESIS INVALIDATED — 1h momentum turned negative while underwater', {
                tradeId: trade.id,
                pair: trade.pair,
                liveMomentum1h: liveMomentum1h.toFixed(2) + '%',
                grossProfitPct: grossProfitPct.toFixed(2) + '%',
                invalidationLoss: invalidationLoss.toFixed(2) + '%',
                peakPct: peakPct.toFixed(2) + '%',
                ageMinutes: tradeAgeMinutes.toFixed(1),
              });
            }
          }

          // CHECK 2.5: STALE UNDERWATER removed.
          // Early loss percentage gate (tick-driven, -0.30% gross) handles all underwater exits.
          // Time-based underwater checks are band-aids — if early loss is tuned correctly,
          // no trade should stay underwater long enough to need a time gate.

          // CHECK 2.7: MAX HOLD TIME — agile trading, not investing
          // In trending/bullish regimes, profitable trades are skipped — erosion cap handles exit.
          // Erosion cap is the correct trailing mechanism; max hold cutting a winner is premature.
          if (!shouldClose) {
            const maxHoldByRegime: Record<string, number> = {
              choppy: env.MAX_HOLD_MINUTES_CHOPPY,
              transitioning: env.MAX_HOLD_MINUTES_WEAK,
              weak: env.MAX_HOLD_MINUTES_WEAK,
              moderate: env.MAX_HOLD_MINUTES_MODERATE,
              strong: env.MAX_HOLD_MINUTES_STRONG,
            };
            const maxHoldMinutes = maxHoldByRegime[regime.toLowerCase()] ?? env.MAX_HOLD_MINUTES_MODERATE;
            if (tradeAgeMinutes >= maxHoldMinutes) {
              const isTrending = ['moderate', 'strong'].includes(regime.toLowerCase());
              // In trending regimes, let profitable trades ride — erosion cap will protect gains.
              // Only exit via max hold when underwater or in choppy/weak markets.
              if (currentProfitPct > 0 && isTrending) {
                logger.info('⏰ MAX HOLD — profitable trade in trending regime, deferring to erosion cap', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  regime,
                  ageMinutes: tradeAgeMinutes.toFixed(1),
                  profitPct: currentProfitPct.toFixed(2) + '%',
                });
              } else {
                shouldClose = true;
                exitReason = currentProfitPct > 0 ? 'max_hold_profit' : 'max_hold_exit';
                logger.info('⏰ MAX HOLD TIME - agile exit', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  regime,
                  ageMinutes: tradeAgeMinutes.toFixed(1),
                  maxHoldMinutes,
                  profitPct: currentProfitPct.toFixed(2) + '%',
                  exitReason,
                });
              }
            }
          }

          // CHECK 2.8: STALE FLAT — trade hovering at zero = dead capital, free it
          // Skip when trade is net-positive: a profitable trade pausing in a bullish market
          // is not dead capital — it may be consolidating before the next leg up.
          // Skip when price is actively rising: gross near peak means momentum is live.
          // Erosion cap handles exit once the trade peaks and pulls back.
          if (!shouldClose) {
            const flatBand = env.STALE_FLAT_BAND_PCT * 100; // convert to pct
            const isFlat = Math.abs(grossProfitPct) <= flatBand;
            if (isFlat && tradeAgeMinutes >= env.STALE_FLAT_MINUTES) {
              if (currentProfitPct > 0) {
                // Trade is net-profitable even while "flat" — hold, let erosion cap protect gains
                logger.info('😴 STALE FLAT skipped — trade is net-positive, erosion cap will exit', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  grossProfitPct: grossProfitPct.toFixed(3) + '%',
                  netProfitPct: currentProfitPct.toFixed(3) + '%',
                  ageMinutes: tradeAgeMinutes.toFixed(1),
                });
              } else {
                // Check if price is actively rising: if gross ≈ peak, the trade is still climbing.
                // A rising trade inside the flat band is not dead capital — it just hasn't cleared fees yet.
                const peakPct = parseFloat(String(trade.peak_profit_percent ?? 0));
                const distanceFromPeak = peakPct - grossProfitPct; // positive = pulled back from peak
                // Only treat "near peak" as a meaningful rising signal if the peak itself clears
                // the round-trip fee cost (~0.20%). A sub-fee peak is noise, not a real recovery.
                const minMeaningfulPeak = env.STALE_FLAT_MIN_MEANINGFUL_PEAK_PCT * 100; // convert to pct
                const isRising = peakPct >= minMeaningfulPeak && distanceFromPeak <= flatBand; // at or near all-time high
                if (isRising) {
                  logger.info('😴 STALE FLAT skipped — price actively rising (gross near peak)', {
                    tradeId: trade.id,
                    pair: trade.pair,
                    grossProfitPct: grossProfitPct.toFixed(3) + '%',
                    peakPct: peakPct.toFixed(3) + '%',
                    distanceFromPeak: distanceFromPeak.toFixed(3) + '%',
                    ageMinutes: tradeAgeMinutes.toFixed(1),
                  });
                } else {
                  shouldClose = true;
                  exitReason = 'stale_flat';
                  logger.info('😴 STALE FLAT - dead capital, freeing for next opportunity', {
                    tradeId: trade.id,
                    pair: trade.pair,
                    grossProfitPct: grossProfitPct.toFixed(3) + '%',
                    peakPct: peakPct.toFixed(3) + '%',
                    ageMinutes: tradeAgeMinutes.toFixed(1),
                    flatBand: flatBand.toFixed(2) + '%',
                  });
                }
              }
            }
          }

          // CHECK 2.9: STALE PEAK — peak not growing in weak/transitioning regime → lock the gain
          // Fires when: peak stalled X minutes + profit above fee round-trip + weak/transitioning regime
          // Prevents: entry catches a real move, move stalls, profit slowly erodes to a loss
          if (!shouldClose && currentProfitPct > 0) {
            const stalePeakMinutes = env.STALE_PEAK_MINUTES;
            const stalePeakMinProfit = env.STALE_PEAK_MIN_PROFIT_PCT;
            const isWeakRegime = ['weak', 'transitioning', 'choppy'].includes(regime.toLowerCase());
            if (isWeakRegime) {
              const peakData = positionTracker.getPeakProfit(trade.id);
              const peakUpdatedAt = peakData?.peakUpdatedAt ?? 0;
              const minutesSincePeakGrew = peakUpdatedAt > 0 ? (Date.now() - peakUpdatedAt) / 60000 : tradeAgeMinutes;
              const stalePeakPositionCost = entryPrice * quantity;
              const stalePeakEstimatedFees = stalePeakPositionCost * env.BINANCE_TAKER_FEE_DEFAULT * 2;
              const stalePeakCurrentProfitDollars = (currentPrice - entryPrice) * quantity;
              if (minutesSincePeakGrew >= stalePeakMinutes && currentProfitPct >= stalePeakMinProfit && stalePeakCurrentProfitDollars > stalePeakEstimatedFees) {
                shouldClose = true;
                exitReason = 'stale_peak_lock';
                logger.info('🔒 STALE PEAK LOCK — peak stalled, locking gain in weak regime', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  regime,
                  currentProfitPct: currentProfitPct.toFixed(3) + '%',
                  peakPct: (peakData?.peakPct ?? 0).toFixed(3) + '%',
                  minutesSincePeakGrew: minutesSincePeakGrew.toFixed(1),
                  stalePeakMinutes,
                });
              }
            }
          }

          // CHECK 3: EMERGENCY STOP (safety net - catastrophic loss)
          if (!shouldClose && currentProfitPct < emergencyLossLimit * 100) {
            shouldClose = true;
            exitReason = 'emergency_stop';
            logger.info('🆘 EMERGENCY STOP', {
              tradeId: trade.id,
              pair: trade.pair,
              currentProfitPct: currentProfitPct.toFixed(2),
              emergencyLossLimit: `${(emergencyLossLimit * 100).toFixed(1)}%`,
            });
          }

          // CHECK 4: PROFIT TARGET (optional - let winners run or take profit)
          if (!shouldClose && currentProfitPct >= profitTarget * 100) {
            shouldClose = true;
            exitReason = 'profit_target';
          }

          if (shouldClose) {
            const exitPrice = currentPrice;
            const profitLoss = (currentPrice - entryPrice) * quantity;
            const profitLossPercent = currentProfitPct;

            logger.info('EXIT TRIGGERED - closing trade', {
              tradeId: trade.id,
              pair: trade.pair,
              entryPrice,
              exitPrice,
              profitPct: currentProfitPct.toFixed(2),
              tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
              exitReason,
            });

            try {
              const closeResult = await closeTrade({
                botInstanceId: trade.bot_instance_id,
                tradeId: trade.id,
                pair: trade.pair,
                exitTime: new Date().toISOString(),
                exitPrice,
                profitLoss,
                profitLossPercent,
                exitReason,
              });

              if (closeResult.ok) {
                logger.info('Trade successfully closed by profit target', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  exitPrice,
                  profitLoss: profitLoss.toFixed(2),
                  profitLossPercent: profitLossPercent.toFixed(2),
                  exitReason,
                });
                positionTracker.clearPosition(trade.id);
                if (exitReason === 'stale_flat' ||
                    exitReason === 'underwater_small_peak_timeout' || exitReason === 'underwater_never_profited') {
                  this.staleExitedPairsThisCycle.add(trade.pair);
                  logger.info('Loss exit: blocking same-cycle re-entry', { pair: trade.pair, exitReason });
                }
                exitCount++;
              } else {
                logger.error('Failed to close trade', null, {
                  tradeId: trade.id,
                  pair: trade.pair,
                  error: closeResult.error,
                });
              }
            } catch (closeError) {
              logger.error('Error closing trade', closeError instanceof Error ? closeError : null, {
                tradeId: trade.id,
                pair: trade.pair,
              });
            }
          }
        } catch (error) {
          logger.error(
            `Error checking profit target for trade ${trade.id}`,
            error instanceof Error ? error : null
          );
        }
      }

      logger.info('Profit target check completed', {
        tradesChecked: openTrades.length,
        tradesClosed: exitCount,
      });
    } catch (error) {
      logger.error(
        'Error in profit target check',
        error instanceof Error ? error : null
      );
    }
  }

  /**
   * Add pyramid levels to open profitable trades (safe pyramiding)
   * This is the THIRD PASS - runs AFTER profit targets can exit
   * Adds L1 at 4.5% profit, L2 at 8% profit (matching /nexus performance)
   */
  private async addPyramidLevelsToOpenTrades(allPairs: string[] = []): Promise<void> {
    const env = getEnvironmentConfig();
    try {
      // Get all open trades — optionally scoped to specific pairs (main cycle passes active pairs;
      // dedicated pyramid interval passes [] to process ALL open trades regardless of pair)
      // Only pyramid live trades — paper trades must never trigger real exchange orders.
      // t.trading_mode is set at entry time and is the immutable source of truth.
      const openTrades = await query<any>(
        allPairs.length > 0
          ? `SELECT
              t.id, t.bot_instance_id, t.pair, t.entry_price, t.quantity, t.entry_time,
              t.profit_loss_percent, t.pyramid_levels, t.fee,
              b.user_id, b.config, b.exchange
            FROM trades t
            INNER JOIN bot_instances b ON t.bot_instance_id = b.id
            WHERE t.status = 'open' AND t.trading_mode = 'live' AND t.pair = ANY($1)
            ORDER BY t.entry_time ASC`
          : `SELECT
              t.id, t.bot_instance_id, t.pair, t.entry_price, t.quantity, t.entry_time,
              t.profit_loss_percent, t.pyramid_levels, t.fee,
              b.user_id, b.config, b.exchange
            FROM trades t
            INNER JOIN bot_instances b ON t.bot_instance_id = b.id
            WHERE t.status = 'open' AND t.trading_mode = 'live'
            ORDER BY t.entry_time ASC`,
        allPairs.length > 0 ? [allPairs] : []
      );

      if (openTrades.length === 0) {
        logger.debug('No open trades to add pyramid levels to');
        return;
      }

      // Batch price fetch before loop
      const pyPricesByPair = new Map<string, any>();
      const pyPairsByExchange = new Map<string, string[]>();
      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        if (!pyPairsByExchange.has(ex)) pyPairsByExchange.set(ex, []);
        pyPairsByExchange.get(ex)!.push(trade.pair);
      }
      await Promise.all(
        Array.from(pyPairsByExchange.entries()).map(async ([ex, pairs]) => {
          const unique = [...new Set(pairs)];
          const data = await marketDataAggregator.getMarketData(unique, ex);
          for (const [pair, priceData] of data.entries()) pyPricesByPair.set(pair, priceData);
        })
      );

      let pyramidCount = 0;
      for (const trade of openTrades) {
        try {
          const pyramidExchange = (trade.exchange || 'binance').toLowerCase();
          const currentPriceData = pyPricesByPair.get(trade.pair);
          if (!currentPriceData) continue;

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));

          // Calculate NET profit (gross - entry fee - estimated exit fee)
          const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const pyramidEntryFee = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getCachedTakerFee(pyramidExchange));
          const pyramidExitFee = currentPrice * quantity * getCachedTakerFee(pyramidExchange);
          const pyramidTotalFees = pyramidEntryFee + pyramidExitFee;
          const pyramidFeePct = (pyramidTotalFees / (entryPrice * quantity)) * 100;
          const currentProfitPct = grossProfitPct - pyramidFeePct;

          // Parse existing pyramid levels (safe defaults if malformed)
          let pyramidLevels: Array<Record<string, any>> = [];
          try {
            pyramidLevels = Array.isArray(trade.pyramid_levels) ? trade.pyramid_levels : [];
          } catch (e) {
            pyramidLevels = [];
          }

          const hasL1 = pyramidLevels.some((l: any) => l.level === 1);
          const hasL2 = pyramidLevels.some((l: any) => l.level === 2);

          // Only add pyramids if trade hasn't reached profit target yet
          // (trades reaching target will be closed in profit target pass)
          const _pyramidOverrides = await getParamOverrides();
          const profitTargetStrong = (_pyramidOverrides.PROFIT_TARGET_STRONG ?? env.PROFIT_TARGET_STRONG) * 100; // e.g. 0.20 → 20%
          if (currentProfitPct >= profitTargetStrong) {
            logger.debug('Trade approaching profit target - skip pyramid add', {
              pair: trade.pair,
              profitPct: currentProfitPct.toFixed(2),
              targetPct: profitTargetStrong,
            });
            continue;
          }

          // PYRAMID REGIME GATE: only pyramid in strong BTC momentum.
          // Fetch fresh BTC indicators here (pyramid method is also called from interval, outside main cycle).
          // Strong = mom1h >= 1.0% AND mom4h >= 0.8% (mirrors REGIME_STRONG thresholds).
          {
            let btcMom1hPyramid = 0;
            let btcMom4hPyramid = 0;
            try {
              const btcPyramidIndicators = await this.fetchAndCalculateIndicators('BTC/USDT', '15m', 100, trade.exchange || 'binance');
              btcMom1hPyramid = btcPyramidIndicators.momentum1h ?? 0;
              btcMom4hPyramid = btcPyramidIndicators.momentum4h ?? 0;
            } catch { /* skip pyramid if BTC fetch fails */ }
            const envCfg = getEnvironmentConfig();
            const isStrongBtc = btcMom1hPyramid >= envCfg.REGIME_STRONG_1H_PCT && btcMom4hPyramid >= envCfg.REGIME_STRONG_4H_PCT;
            if (!isStrongBtc) {
              logger.info('Pyramid skipped — BTC not in strong regime', {
                pair: trade.pair,
                btcMom1h: btcMom1hPyramid.toFixed(3),
                btcMom4h: btcMom4hPyramid.toFixed(3),
                requiredMom1h: envCfg.REGIME_STRONG_1H_PCT,
                requiredMom4h: envCfg.REGIME_STRONG_4H_PCT,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
              continue;
            }
          }

          // CHECK L1: Add at L1 trigger % profit
          // Pyramid gate: momentum-based. Trade already profitable at trigger % = trend confirmed.
          // Require 1h momentum still positive to confirm trend is continuing, not reversing.
          const l1TriggerPct = env.PYRAMID_L1_TRIGGER_PCT * 100;
          if (!hasL1 && currentProfitPct >= l1TriggerPct) {
            let mom1hL1 = 0;
            try {
              const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
              mom1hL1 = indicators.momentum1h || 0;
            } catch (indicatorError) {
              logger.warn('Failed to fetch momentum for L1 pyramid check', {
                pair: trade.pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
            }

            // Infer confidence from momentum strength (env-driven thresholds)
            const inferredConfidence = mom1hL1 >= env.REGIME_STRONG_1H_PCT
              ? env.PYRAMID_INFERRED_CONFIDENCE_STRONG
              : mom1hL1 >= env.REGIME_MODERATE_1H_PCT
                ? env.PYRAMID_INFERRED_CONFIDENCE_MODERATE
                : env.PYRAMID_INFERRED_CONFIDENCE_WEAK;
            const l1ConfidenceCheck = riskManager.canAddPyramidLevel(1, inferredConfidence);
            if (!l1ConfidenceCheck.pass) {
              logger.debug('L1 pyramid rejected - insufficient confidence', {
                pair: trade.pair,
                reason: l1ConfidenceCheck.reason,
                mom1h: mom1hL1.toFixed(2),
                inferredConfidence,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
            } else {
              if (mom1hL1 <= 0) {
                logger.debug('L1 pyramid rejected - 1h momentum not positive', {
                  pair: trade.pair,
                  mom1h: mom1hL1.toFixed(2),
                  currentProfitPct: currentProfitPct.toFixed(2),
                });
              } else {
                const l1Quantity = parseFloat(String(trade.quantity)) * env.PYRAMID_ADD_SIZE_PCT_L1;
                const l1Entry = {
                  level: 1,
                  entryPrice: currentPrice,
                  quantity: l1Quantity,
                  entryTime: new Date().toISOString(),
                  triggerProfitPct: l1TriggerPct / 100,
                  status: 'pending_execution',
                  aiConfidence: inferredConfidence,
                };

                // Add L1 to pyramid_levels
                pyramidLevels.push(l1Entry);

                // Update trades table with pending status
                await query(
                  `UPDATE trades
                   SET pyramid_levels = $1
                   WHERE id = $2`,
                  [JSON.stringify(pyramidLevels), trade.id]
                );

                // Create execution job for the pyramid order (exchange-agnostic)
                try {
                  await jobQueueManager.enqueue('pyramid_add_order', {
                    userId: trade.user_id,
                    botInstanceId: trade.bot_instance_id,
                    tradeId: trade.id,
                    pair: trade.pair,
                    level: 1,
                    quantity: l1Quantity,
                    currentPrice,
                    triggerProfitPct: l1TriggerPct / 100,
                  }, { priority: 8, maxRetries: 2 }); // High priority, 2 retries

                  logger.info('Pyramid L1 job enqueued', {
                    tradeId: trade.id,
                    pair: trade.pair,
                    l1Price: currentPrice.toFixed(2),
                    l1Quantity: l1Quantity.toFixed(8),
                    currentProfitPct: currentProfitPct.toFixed(2),
                  });

                  pyramidCount++;
                } catch (jobError) {
                  logger.error('Failed to enqueue L1 pyramid job', jobError instanceof Error ? jobError : null, {
                    tradeId: trade.id,
                    pair: trade.pair,
                  });
                }
              }
            }
          }

          // CHECK L2: Add at L2 trigger % profit (only if L1 exists, requires strong momentum)
          const l2TriggerPct = env.PYRAMID_L2_TRIGGER_PCT * 100;
          if (!hasL2 && hasL1 && currentProfitPct >= l2TriggerPct) {
            let mom1hL2 = 0;
            try {
              const indicatorsL2 = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
              mom1hL2 = indicatorsL2.momentum1h || 0;
            } catch (indicatorError) {
              logger.warn('Failed to fetch momentum for L2 pyramid check', {
                pair: trade.pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
            }

            // L2 requires strong momentum — env-driven confidence thresholds
            const inferredConfidenceL2 = mom1hL2 >= env.REGIME_STRONG_1H_PCT
              ? env.PYRAMID_L2_INFERRED_CONFIDENCE_STRONG
              : env.PYRAMID_L2_INFERRED_CONFIDENCE_WEAK;
            const l2ConfidenceCheck = riskManager.canAddPyramidLevel(2, inferredConfidenceL2);

            if (!l2ConfidenceCheck.pass || mom1hL2 <= 0) {
              logger.debug('L2 pyramid rejected', {
                pair: trade.pair,
                mom1h: mom1hL2.toFixed(2),
                inferredConfidence: inferredConfidenceL2,
                reason: !l2ConfidenceCheck.pass ? l2ConfidenceCheck.reason : `1h momentum ${mom1hL2.toFixed(2)}% not positive`,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
            } else {
              {
                const l2Quantity = parseFloat(String(trade.quantity)) * env.PYRAMID_ADD_SIZE_PCT_L2;
                const l2Entry = {
                  level: 2,
                  entryPrice: currentPrice,
                  quantity: l2Quantity,
                  entryTime: new Date().toISOString(),
                  triggerProfitPct: l2TriggerPct / 100,
                  status: 'pending_execution',
                  aiConfidence: inferredConfidenceL2,
                };

                // Add L2 to pyramid_levels
                pyramidLevels.push(l2Entry);

                // Update trades table with pending status
                await query(
                  `UPDATE trades
                   SET pyramid_levels = $1
                   WHERE id = $2`,
                  [JSON.stringify(pyramidLevels), trade.id]
                );

                // Create execution job for the pyramid order (exchange-agnostic)
                try {
                  await jobQueueManager.enqueue('pyramid_add_order', {
                    userId: trade.user_id,
                    botInstanceId: trade.bot_instance_id,
                    tradeId: trade.id,
                    pair: trade.pair,
                    level: 2,
                    quantity: l2Quantity,
                    currentPrice,
                    triggerProfitPct: l2TriggerPct / 100,
                  }, { priority: 8, maxRetries: 2 }); // High priority, 2 retries

                  logger.info('Pyramid L2 job enqueued', {
                    tradeId: trade.id,
                    pair: trade.pair,
                    l2Price: currentPrice.toFixed(2),
                    l2Quantity: l2Quantity.toFixed(8),
                    currentProfitPct: currentProfitPct.toFixed(2),
                  });

                  pyramidCount++;
                } catch (jobError) {
                  logger.error('Failed to enqueue L2 pyramid job', jobError instanceof Error ? jobError : null, {
                    tradeId: trade.id,
                    pair: trade.pair,
                  });
                }
              }
            }
          }
        } catch (error) {
          logger.error(
            `Error checking pyramid opportunity for trade ${trade.id}`,
            error instanceof Error ? error : null
          );
        }
      }

      if (pyramidCount > 0) {
        logger.info('Pyramid level additions completed', {
          pyramidsAdded: pyramidCount,
        });
      }
    } catch (error) {
      logger.error(
        'Error in pyramid level check',
        error instanceof Error ? error : null
      );
    }
  }

  /**
   * Proactive low-balance alert: check all live bots and email users whose free cash
   * is below LIVE_TRADING_MIN_USDT_USD. Runs every 4h; at most one email per bot per 24h.
   * Cooldown persisted in bot config so server restarts don't re-trigger emails.
   */
  private async checkLowBalanceForLiveBots(): Promise<void> {
    const { getEnvironmentConfig } = await import('@/config/environment');
    const { decrypt } = await import('@/lib/crypto');
    const { getExchangeAdapter } = await import('@/services/exchanges/singleton');
    const env = getEnvironmentConfig();
    const minUsdt = env.LIVE_TRADING_MIN_USDT_USD;
    const cooldownMs = 24 * 60 * 60_000;

    let liveBots: Array<{ id: string; exchange: string; user_id: string; email: string; name: string; bot_name: string; config: any }>;
    try {
      liveBots = await query(
        `SELECT b.id, b.exchange, b.user_id, u.email, u.name,
                COALESCE(b.config->>'name', 'Trading Bot') AS bot_name,
                b.config
         FROM bot_instances b
         JOIN users u ON u.id = b.user_id
         WHERE b.status IN ('running', 'paused')
           AND b.config->>'tradingMode' = 'live'
           AND b.trading_mode = 'live'`
      );
    } catch {
      return;
    }

    for (const bot of liveBots) {
      try {
        // Persist cooldown in DB so server restarts don't re-trigger emails
        const lastSentStr = (bot.config || {}).lowBalanceAlertSentAt;
        const lastSent = lastSentStr ? parseInt(String(lastSentStr), 10) : 0;
        if (Date.now() - lastSent < cooldownMs) continue;

        const keysResult = await query(
          `SELECT encrypted_public_key, encrypted_secret_key
           FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2 LIMIT 1`,
          [bot.user_id, bot.exchange.toLowerCase()]
        );
        if (!keysResult.length) continue;

        const publicKey = decrypt(keysResult[0].encrypted_public_key);
        const secretKey = decrypt(keysResult[0].encrypted_secret_key);

        const adapter = getExchangeAdapter(bot.exchange);
        await adapter.connect({ publicKey, secretKey });
        const balances = await adapter.getBalances();

        let freeStable = 0;
        for (const b of balances) {
          const asset = b.asset.toUpperCase();
          if (['USDT', 'USDC', 'USD', 'BUSD'].includes(asset)) freeStable += b.free;
        }

        if (freeStable < minUsdt) {
          // Persist timestamp in DB before sending — survives server restarts
          await query(
            `UPDATE bot_instances SET config = config || jsonb_build_object('lowBalanceAlertSentAt', $2::text)
             WHERE id = $1`,
            [bot.id, String(Date.now())]
          );
          await sendLowBalanceEmail(
            bot.email, bot.name, bot.id, bot.bot_name, bot.exchange, freeStable, minUsdt
          );
          logger.info('Proactive low-balance alert sent (bot still running)', {
            botId: bot.id, exchange: bot.exchange, freeStable, minUsdt,
          });
        }
      } catch (err) {
        logger.debug('Low balance check skipped for bot', {
          botId: bot.id, error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Get all active bots with enabled pairs
   */
  private async getActiveBots(): Promise<BotInstance[]> {
    try {
      // Shard support: each worker handles a partition of users based on user_id hash.
      // WORKER_SHARD_INDEX (0-based) and WORKER_SHARD_TOTAL control the partition.
      // When not set (or WORKER_SHARD_TOTAL=1), all bots are processed by this worker.
      // To add a shard: create a new Railway worker service with these env vars:
      //   WORKER_SHARD_INDEX=1, WORKER_SHARD_TOTAL=2  (worker B of 2)
      // No code deployment needed — just env vars + new service.
      const shardTotal = parseInt(process.env.WORKER_SHARD_TOTAL || '1', 10);
      const shardIndex = parseInt(process.env.WORKER_SHARD_INDEX || '0', 10);
      const shardFilter = shardTotal > 1
        ? `AND ('x' || substr(md5(bi.user_id::text), 1, 8))::bit(32)::int % ${shardTotal} = ${shardIndex}`
        : '';

      // Get running bots, but ONLY for users with valid subscription
      // This prevents trading for users with payment_required, cancelled, or past_due status
      // Also exclude bots where trial has expired (plan_tier=live_trial AND trial_ends_at <= NOW())
      const allBots = await query<any>(
        `SELECT bi.id, bi.user_id, bi.enabled_pairs, bi.status, bi.exchange, bi.config
         FROM bot_instances bi
         INNER JOIN subscriptions s ON s.user_id = bi.user_id
         WHERE bi.status = 'running'
           AND s.status IN ('active', 'trialing')
           AND NOT (s.plan_tier = 'live_trial' AND s.trial_ends_at <= NOW())
           ${shardFilter}
         ORDER BY bi.created_at DESC`
      );

      // Filter for bots that have enabled pairs
      const activeBots = (allBots || []).filter(bot => {
        const hasEnabledPairs = bot.enabled_pairs && Array.isArray(bot.enabled_pairs) && bot.enabled_pairs.length > 0;

        if (!hasEnabledPairs) {
          logger.debug('Orchestrator: skipping bot - no enabled pairs', {
            botId: bot.id,
            pairs: bot.enabled_pairs
          });
        }

        return hasEnabledPairs;
      });

      // Auto-pause bots for expired trials (real-time safety net for background job misses)
      const expiredTrialBots = await query<any>(
        `SELECT bi.id, bi.user_id, u.email, u.name
         FROM bot_instances bi
         INNER JOIN subscriptions s ON s.user_id = bi.user_id
         JOIN users u ON u.id = bi.user_id
         WHERE bi.status = 'running'
           AND s.plan_tier = 'live_trial'
           AND s.trial_ends_at <= NOW()
         LIMIT 10`
      );

      if (expiredTrialBots.length > 0) {
        for (const bot of expiredTrialBots) {
          await query(
            `UPDATE bot_instances SET status = 'paused', updated_at = NOW()
             WHERE id = $1 AND status = 'running'`,
            [bot.id]
          );
          logger.info('Orchestrator: Auto-paused bot — trial expired', {
            botId: bot.id,
            userId: bot.user_id,
            email: bot.email,
          });
        }
      }

      // Also check for running bots that were skipped due to subscription issues
      const skippedBots = await query<any>(
        `SELECT bi.id, bi.user_id, u.email, u.name, s.status as sub_status
         FROM bot_instances bi
         LEFT JOIN subscriptions s ON s.user_id = bi.user_id
         JOIN users u ON u.id = bi.user_id
         WHERE bi.status = 'running'
           AND (s.status IS NULL OR s.status NOT IN ('active', 'trialing'))
         LIMIT 10`
      );

      if (skippedBots.length > 0) {
        logger.warn('Orchestrator: Blocked bots due to subscription status', {
          blockedCount: skippedBots.length,
          bots: skippedBots.map(b => ({
            botId: b.id,
            userId: b.user_id,
            subStatus: b.sub_status || 'no_subscription',
          })),
        });

        // Auto-pause these bots and notify users
        for (const bot of skippedBots) {
          await query(
            `UPDATE bot_instances SET status = 'paused', updated_at = NOW()
             WHERE id = $1 AND status = 'running'`,
            [bot.id]
          );
          logger.info('Orchestrator: Auto-paused bot due to invalid subscription', {
            botId: bot.id,
            userId: bot.user_id,
            subStatus: bot.sub_status || 'no_subscription',
          });

          // Notify user their bot was paused
          if (bot.email) {
            const reason = bot.sub_status === 'payment_required'
              ? 'Your free trial has ended. Please add a payment method to continue trading.'
              : bot.sub_status === 'cancelled'
              ? 'Your subscription has been cancelled.'
              : 'Your subscription requires attention to continue trading.';

            try {
              await sendBotSuspendedEmail(
                bot.email,
                bot.name || 'Trader',
                bot.id,
                reason,
                'Please visit your billing page to resolve this.',
                '/dashboard/billing'
              );
              logger.info('Orchestrator: Sent bot-paused notification email', {
                botId: bot.id,
                userId: bot.user_id,
                email: bot.email,
              });
            } catch (emailErr) {
              logger.error('Orchestrator: Failed to send bot-paused email', emailErr instanceof Error ? emailErr : null, {
                botId: bot.id,
                userId: bot.user_id,
              });
            }
          }
        }
      }

      return activeBots as BotInstance[];
    } catch (error) {
      logger.error('Failed to fetch active bots', error instanceof Error ? error : null);
      return [];
    }
  }
}

// Persist singleton across Next.js HMR reloads in development.
// Without this, every file save creates a new instance and stacks a new setInterval
// on top of existing ones — causing multiple orchestrator cycles to run simultaneously,
// multiplying Binance API calls and triggering rate limit exhaustion.
declare global {
  // eslint-disable-next-line no-var
  var __tradeSignalOrchestrator: TradeSignalOrchestrator | undefined;
}

if (!globalThis.__tradeSignalOrchestrator) {
  globalThis.__tradeSignalOrchestrator = new TradeSignalOrchestrator();
}

export const tradeSignalOrchestrator = globalThis.__tradeSignalOrchestrator;
