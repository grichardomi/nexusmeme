/**
 * Trade Signal Orchestrator
 * Converts AI signals into actual trade execution plans
 * This is the missing orchestrator that connects signal analysis to trade execution
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { getEnvironmentConfig, aiConfig } from '@/config/environment';
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
import { fetchOHLC } from '@/services/market-data/ohlc-fetcher';
import { sendBotSuspendedEmail, sendLowBalanceEmail } from '@/services/email/triggers';
import { startUserDataStreamsForAllLiveBots } from '@/services/exchanges/binance-user-data-stream';
import { startKrakenStreamsForAllLiveBots } from '@/services/exchanges/kraken-user-data-stream';
import { reconcileBinanceFills } from '@/services/exchanges/binance-fill-reconciler';
import type { TradeDecision } from '@/types/market';
import { closeTrade } from '@/services/trading/close-trade';

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
  private interval: NodeJS.Timer | null = null;
  private peakTrackingInterval: NodeJS.Timer | null = null;
  private pyramidCheckInterval: NodeJS.Timer | null = null;
  private reconcileInterval: NodeJS.Timer | null = null;
  // Pairs exited for stale reasons in the current cycle — block re-entry until next cycle
  private staleExitedPairsThisCycle = new Set<string>();
  private lowBalanceCheckInterval: NodeJS.Timer | null = null;

  // OPTIMIZATION: OHLC cache to avoid refetching same data multiple times per cycle
  // Cache structure: Map<pair:timeframe, { data: OHLCCandle[], timestamp: number }>
  private ohlcCache = new Map<string, { data: any[], timestamp: number }>();
  private readonly OHLC_CACHE_TTL_MS = 30000; // 30 seconds TTL — prevents stale spike indicators reused across trade cycles

  // REGIME CACHE: Populated by main orchestrator cycle (60s ADX detection)
  // Used by high-frequency peak tracking loop to avoid ADX fetches every second
  // Key: pair, Value: { regime, timestamp }
  private regimeCache = new Map<string, { regime: string; timestamp: number }>();
  private readonly REGIME_CACHE_TTL_MS = 60000; // 60s — stale after one orchestrator cycle


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
    logger.info('Starting trade signal orchestrator', { intervalMs });

    // Initialize position tracker from database (load peak profits from previous session)
    await positionTracker.initializeFromDatabase();

    // Start Binance User Data Streams for all live running bots.
    // Real-time fill detection via WebSocket (~100ms) replaces polling for external closes.
    startUserDataStreamsForAllLiveBots().catch(err => {
      logger.warn('Failed to start Binance user data streams on startup', { error: err instanceof Error ? err.message : String(err) });
    });
    startKrakenStreamsForAllLiveBots().catch(err => {
      logger.warn('Failed to start Kraken user data streams on startup', { error: err instanceof Error ? err.message : String(err) });
    });

    // GHOST TRADE RECONCILIATION: On every startup, scan for open DB trades that actually
    // closed on the exchange (WebSocket missed fill during crash/restart). Runs once on
    // startup then every 5 minutes to catch any fills missed by the WebSocket.
    reconcileBinanceFills().catch(err => {
      logger.warn('Startup fill reconciliation failed', { error: err instanceof Error ? err.message : String(err) });
    });
    this.reconcileInterval = setInterval(() => {
      reconcileBinanceFills().catch(err => {
        logger.warn('Periodic fill reconciliation failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, 5 * 60_000); // every 5 minutes

    // PROACTIVE LOW-BALANCE ALERT: Check every 4 hours for live bots with insufficient free cash.
    // Emails user once per 24h so they know trades are paused before the next signal fires.
    this.lowBalanceCheckInterval = setInterval(() => {
      this.checkLowBalanceForLiveBots().catch(err => {
        logger.warn('Low balance proactive check error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, 15 * 60_000);
    // Run once immediately on startup so user is alerted right away
    this.checkLowBalanceForLiveBots().catch(() => {});

    // HIGH-FREQUENCY PEAK TRACKING (runs every 5 seconds)
    // CRITICAL: Captures peak profits quickly so erosion protection and green-to-red
    // protection can work correctly. Without this, trades can go from +0.03% to -0.30%
    // between main orchestrator cycles (60s) and peak is never recorded.
    const peakTrackingIntervalMs = parseInt(process.env.PEAK_TRACKING_INTERVAL_MS || '1000', 10);
    logger.info('Starting high-frequency peak tracking', { peakTrackingIntervalMs });

    this.peakTrackingInterval = setInterval(async () => {
      try {
        await this.updatePeaksForAllOpenTrades();
      } catch (error) {
        logger.error('Peak tracking error', error instanceof Error ? error : null);
      }
    }, peakTrackingIntervalMs);

    // PYRAMID CHECK: Dedicated interval — faster than main cycle to catch L1/L2 triggers
    // promptly without waiting up to 20s. Uses OHLC cache so no extra API calls.
    // Default 5s: fast enough to catch pyramid triggers before erosion cap can fire,
    // slow enough to avoid DB contention with the 1s HF loop.
    const pyramidCheckIntervalMs = parseInt(process.env.PYRAMID_CHECK_INTERVAL_MS || '5000', 10);
    logger.info('Starting pyramid check interval', { pyramidCheckIntervalMs });

    this.pyramidCheckInterval = setInterval(async () => {
      try {
        await this.addPyramidLevelsToOpenTrades([]);
      } catch (error) {
        logger.error('Pyramid check interval error', error instanceof Error ? error : null);
      }
    }, pyramidCheckIntervalMs);

    this.interval = setInterval(async () => {
      try {
        await this.analyzeAndExecuteSignals();
      } catch (error) {
        logger.error('Trade signal orchestrator error', error instanceof Error ? error : null);
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
    logger.info('Trade signal orchestrator stopped');
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
      }>(
        `SELECT t.id, t.bot_instance_id, t.pair, t.entry_price, t.quantity, t.entry_time, b.user_id, t.fee, b.exchange
         FROM trades t
         INNER JOIN bot_instances b ON t.bot_instance_id = b.id
         WHERE t.status = 'open'`
      );

      if (openTrades.length === 0) {
        return; // No trades to track
      }

      // Group pairs by exchange for accurate pricing
      const pairsByExchange = new Map<string, Set<string>>();
      for (const trade of openTrades) {
        const ex = (trade.exchange || 'binance').toLowerCase();
        if (!pairsByExchange.has(ex)) pairsByExchange.set(ex, new Set());
        pairsByExchange.get(ex)!.add(trade.pair);
      }

      // Fetch prices per exchange and merge into one map keyed by exchange:pair
      const pricesByExchangePair = new Map<string, any>();
      for (const [ex, pairs] of pairsByExchange.entries()) {
        const data = await marketDataAggregator.getMarketData(Array.from(pairs), ex);
        for (const [pair, priceData] of data.entries()) {
          pricesByExchangePair.set(`${ex}:${pair}`, priceData);
        }
      }

      let updatedCount = 0;
      let exitCount = 0;

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

        const trackedPositions = positionTracker.getTrackedPositions();
        const isTracked = trackedPositions.includes(trade.id);

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
            netProfitPct,
            entryTimeMs,
            entryPrice,
            quantity,
            currentPrice,
            totalFeeDollars
          );
          updatedCount++;
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

        // CASE 1: Trade is profitable (NET) - update peak AND check erosion cap
        // Use NET profit so erosion cap only fires on truly profitable trades
        if (currentProfitPct > 0) {
          if (isTracked) {
            // Update peak if current is higher - pass currentPrice for absolute value tracking
            await positionTracker.updatePeakIfHigher(trade.id, netProfitPct, currentPrice, totalFeeDollars);
            updatedCount++;

            // CHECK EROSION CAP - Exit WHILE STILL GREEN (NET) to protect profits
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
                    logger.warn('⚠️ PROFIT PROTECTION EXIT ABORTED: Trade went red - letting underwater logic handle it', {
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
              let profitTarget: number;
              switch (regime) {
                case 'choppy':       profitTarget = hfEnv.PROFIT_TARGET_CHOPPY; break;
                case 'transitioning':profitTarget = hfEnv.PROFIT_TARGET_TRANSITIONING; break;
                case 'weak':         profitTarget = hfEnv.PROFIT_TARGET_WEAK; break;
                case 'strong':       profitTarget = hfEnv.PROFIT_TARGET_STRONG; break;
                default:             profitTarget = hfEnv.PROFIT_TARGET_MODERATE;
              }
              const profitTargetPct = profitTarget * 100; // e.g. 0.05 → 5%

              if (netProfitPct >= profitTargetPct) {
                console.log(`\n🎯 [HF] PROFIT TARGET HIT: ${trade.pair} net +${netProfitPct.toFixed(2)}% >= ${profitTargetPct.toFixed(1)}% (${regime})`);
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
        const firstBotExchange = activeBots[0].exchange || 'kraken';
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
      const env = getEnvironmentConfig();

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

      // ZERO PASS A: Fetch BTC momentum for drop protection (needed by risk manager)
      try {
        const btcPair = 'BTC/USDT';
        const btcExchange = pairExchangeMap.get(btcPair) || 'binance';

        const btcData = await marketDataAggregator.getMarketData([btcPair], btcExchange);
        const btcMarketData = btcData.get(btcPair);
        if (btcMarketData) {
          // Calculate BTC 1h momentum (needs minimum 26 candles for indicator calculation)
          const btcCandles = await this.fetchAndCalculateIndicators(btcPair, '15m', 100, btcExchange);
          if (btcCandles.momentum1h !== undefined) {
            btcMomentum1h = btcCandles.momentum1h; // store for per-pair ETH size reduction
            riskManager.updateBTCMomentum(btcCandles.momentum1h / 100); // Convert percent to decimal
            logger.debug('Orchestrator: BTC momentum updated for risk management', {
              btcPair,
              exchange: 'binance',
              btcMomentum1h: (btcCandles.momentum1h / 100).toFixed(4),
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch BTC momentum for risk manager', error instanceof Error ? error : undefined);
      }

      // CAPITAL PRESERVATION: Layer 1 - BTC Daily Trend Gate (market-wide)
      // Blocks ALL entries if BTC is below EMA200 (sustained downtrend)
      // Reduces size 50% if BTC below EMA50 (weakening trend)
      let globalCpMultiplier = 1.0;
      try {
        const btcGateResult = await capitalPreservation.checkBtcTrendGate();
        if (!btcGateResult.allowTrading) {
          logger.info('Capital preservation: BTC trend gate blocking ALL entries this cycle', {
            reason: btcGateResult.reason,
            layer: btcGateResult.layer,
          });
          return; // Skip entire cycle - BTC below EMA200
        }
        globalCpMultiplier = btcGateResult.sizeMultiplier;
        if (globalCpMultiplier < 1.0) {
          logger.info('Capital preservation: BTC trend gate reducing position sizes', {
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

      // Detect regime for each exchange separately
      for (const [exchange, bots] of botsByExchange.entries()) {
        const exchangePairs = Array.from(new Set(bots.flatMap(b => b.enabled_pairs || [])));
        logger.info('Orchestrator: detecting regime for exchange', {
          exchange,
          pairCount: exchangePairs.length,
          pairs: exchangePairs,
        });
        await regimeDetector.detectRegimeForAllPairs(exchangePairs, exchange);
      }

      // EXIT CHECKS: Run momentum failure + profit targets in PARALLEL (LATENCY OPTIMIZATION)
      // Both are independent exit checks on open trades - no ordering dependency
      // Pyramid pass runs AFTER exits complete (needs to know which trades survived)
      await Promise.all([
        this.checkOpenTradesForMomentumFailure(),
        this.checkOpenTradesForProfitTargets(),
      ]);

      // PYRAMID PASS: Add levels to profitable open trades (after exits complete)
      await this.addPyramidLevelsToOpenTrades(allPairs);

      // OHLC PRE-FETCH: Warm cache for all pairs in parallel before analysis begins.
      // Each pair's analysis calls getCachedOHLC — if cache is cold, each call blocks ~100-200ms.
      // Pre-fetching in parallel here: all pairs fetch concurrently → cache is hot for every pair.
      // Cost: max(single fetch latency) ≈ 150ms once, vs N × 150ms if fetched lazily inside the loop.
      await Promise.all(
        allPairs.map(pair => {
          const exchange = pairExchangeMap.get(pair) || 'binance';
          return this.getCachedOHLC(pair, '15m', 100, exchange).catch(err => {
            // Non-fatal: pair will re-fetch inside the analysis loop and handle its own error
            logger.debug('OHLC pre-fetch failed for pair (will retry in analysis)', { pair, error: err instanceof Error ? err.message : String(err) });
          });
        })
      );

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

            // NOTE: Position duplicate prevention handled PER-BOT in fan-out.ts

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
            const currentPrice = currentPriceData.price;

            // CRITICAL: Real-time intrabar momentum — checks if price is currently falling
            const lastCandle = candles[candles.length - 1];
            const intrabarMomentum = ((currentPrice - lastCandle.open) / lastCandle.open) * 100;
            indicators.intrabarMomentum = intrabarMomentum;

            const bid = currentPriceData.bid;
            const ask = currentPriceData.ask;
            let spreadPct = 0.001;
            if (bid && ask && bid > 0) {
              spreadPct = (ask - bid) / bid;
            }

            console.log(`\n🔍 [SCAN] ${pair} @ $${currentPrice.toFixed(2)} | ADX: ${indicators.adx?.toFixed(1) || 'N/A'} | RSI: ${indicators.rsi?.toFixed(1) || 'N/A'} | Mom1h: ${(indicators.momentum1h || 0).toFixed(2)}% | Intrabar: ${intrabarMomentum.toFixed(2)}% | Vol: ${(indicators.volumeRatio || 1).toFixed(2)}x | Spread: ${(spreadPct * 100).toFixed(3)}%`);

            // PRE-CHECK: Block entry if spread exceeds maximum
            const maxEntrySpreadPct = env.MAX_ENTRY_SPREAD_PCT || 0.003;
            if (spreadPct > maxEntrySpreadPct) {
              console.log(`\n🚫 SPREAD TOO WIDE: ${pair} - ${(spreadPct * 100).toFixed(3)}% > ${(maxEntrySpreadPct * 100).toFixed(2)}% max`);
              logger.info('Orchestrator: entry blocked - spread too wide', { pair, spreadPct: (spreadPct * 100).toFixed(3), maxSpreadPct: (maxEntrySpreadPct * 100).toFixed(2), bid, ask, reason: 'Wide spread erases profit potential' });
              return { type: 'rejected', signal: { pair, reason: 'spread_too_wide', details: `Spread ${(spreadPct * 100).toFixed(3)}% > ${(maxEntrySpreadPct * 100).toFixed(2)}% max`, stage: 'Pre-Filter' } };
            }

            // INTRABAR MOMENTUM CHECK
            const adx = indicators.adx ?? 0;
            const minIntrabar = adx < 20
              ? (env.ENTRY_MIN_INTRABAR_MOMENTUM_CHOPPY || 0.05)
              : (env.ENTRY_MIN_INTRABAR_MOMENTUM_TRENDING ?? -0.1);
            if (intrabarMomentum < minIntrabar) {
              const regimeLabel = adx < 20 ? 'choppy' : 'trending';
              console.log(`\n🔴 INTRABAR BLOCKED (${regimeLabel}): ${pair} - candle momentum ${intrabarMomentum.toFixed(2)}% < ${minIntrabar}% (ADX ${adx.toFixed(1)})`);
              logger.info('Orchestrator: entry blocked - intrabar momentum falling', { pair, intrabarMomentum: intrabarMomentum.toFixed(3), minIntrabar, adx: adx.toFixed(1), regimeLabel });
              return { type: 'rejected', signal: { pair, reason: 'intrabar_negative', details: `Intrabar ${intrabarMomentum.toFixed(2)}% < ${minIntrabar}% (${regimeLabel} ADX ${adx.toFixed(1)})`, stage: 'Pre-Filter' } };
            }

            // 1H MOMENTUM GUARD — exchange-aware threshold
            // Binance round-trip: 0.20% → threshold 0.2%; Kraken round-trip: 0.52% → threshold 1.0%
            // Creeping uptrend exception: if CREEPING_UPTREND_ENABLED, use the lower gate threshold
            // and let the health gate's full 4h+slope check make the final call
            // Trending pullback exception: in strong trend (ADX >= 35), the 5-stage risk filter's
            // path 4 allows 1h dips down to -0.5%. Don't block here — let path 4 evaluate it.
            const mom1h = indicators.momentum1h ?? 0;
            const standardMinMom1h = pairExchange.startsWith('binance')
              ? (env.RISK_MIN_MOMENTUM_1H_BINANCE ?? 0.2)
              : (env.RISK_MIN_MOMENTUM_1H ?? 1.0);
            const minMom1h = env.CREEPING_UPTREND_ENABLED
              ? Math.min(standardMinMom1h, env.CREEPING_UPTREND_GATE_MIN_1H)
              : standardMinMom1h;
            // In strong trend (ADX >= 35), allow shallow DIPS (negative 1h) ONLY with volume confirmation
            // Volume >= 0.8x required: a genuine pullback in a strong trend has buyers stepping in
            // Low volume + negative 1h = failed breakout, not a buyable dip — block it
            const isStrongTrend = (indicators.adx ?? 0) >= 35;
            const hasVolumeForDip = (indicators.volumeRatio ?? 0) >= 0.8;
            const trendingPullbackMin = isStrongTrend ? -0.5 : -0.3;
            const effectiveMinMom1h = (isStrongTrend && mom1h < 0 && hasVolumeForDip) ? Math.min(minMom1h, trendingPullbackMin) : minMom1h;
            if (mom1h < effectiveMinMom1h) {
              console.log(`\n🔴 1H MOMENTUM BLOCKED: ${pair} - 1h momentum ${mom1h.toFixed(2)}% < ${effectiveMinMom1h.toFixed(2)}% min${isStrongTrend ? ' (strong trend pullback limit)' : ''}`);
              return { type: 'rejected', signal: { pair, reason: 'negative_1h_momentum', details: `1h momentum ${mom1h.toFixed(2)}% below minimum ${effectiveMinMom1h.toFixed(2)}%`, stage: 'Pre-Filter' } };
            }

            // Run 5-stage risk filter
            const ticker = { bid, ask, spread: spreadPct };
            const riskFilter = await riskManager.runFullRiskFilter(pair, currentPrice, indicators, ticker);

            if (!riskFilter.pass) {
              console.log(`\n🚫 RISK FILTER BLOCKED: ${pair} - ${riskFilter.reason}`);
              logger.info('Orchestrator: entry blocked by 5-stage risk filter', { pair, reason: riskFilter.reason, stage: riskFilter.stage, momentum1h: indicators.momentum1h?.toFixed(3), adx: indicators.adx?.toFixed(1) });
              return { type: 'rejected', signal: { pair, reason: 'risk_filter_blocked', details: riskFilter.reason, stage: riskFilter.stage } };
            }

            const isTransitioning = riskFilter.isTransitioning === true;
            const isCreepingUptrend = riskFilter.isCreepingUptrend === true;
            const isVolumeSurge = riskFilter.isVolumeSurge === true;
            const entryLabel = isCreepingUptrend ? ' | 🌿 CREEPING' : isVolumeSurge ? ' | 🚀 VOL SURGE' : isTransitioning ? ' | 🔄 TRANSITIONING' : '';
            console.log(`\n✅ RISK FILTER PASSED: ${pair} - ADX: ${indicators.adx?.toFixed(1)} | Mom1h: ${(indicators.momentum1h || 0).toFixed(2)}%${entryLabel}`);
            logger.info('Orchestrator: 5-stage risk filter passed', { pair, adx: indicators.adx?.toFixed(1), adxSlope: indicators.adxSlope?.toFixed(2), momentum1h: indicators.momentum1h?.toFixed(3), rsi: indicators.rsi?.toFixed(1), volumeRatio: indicators.volumeRatio?.toFixed(2), isTransitioning, isCreepingUptrend });

            // Pass live price + indicators — same fresh data as risk filter (prevents staleness)
            console.log(`\n🔍 [ORCHESTRATOR] Passing indicators to analyzeMarket for ${pair}:`, { adx: indicators.adx, momentum1h: indicators.momentum1h, intrabarMomentum: indicators.intrabarMomentum, momentum4h: indicators.momentum4h, rsi: indicators.rsi });

            const analysis = await analyzeMarket({
              pair,
              timeframe: '1h',
              includeSignal: true,
              includeRegime: true,
              currentPrice,
              indicators,
              isVolumeSurge,
            });

            console.log(`\n🔍 DIAGNOSTIC: analyzeMarket returned for ${pair}`, { hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence, regimeType: analysis.regime?.regime });
            logger.info('Orchestrator: analyzeMarket returned', { pair, hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence, regimeType: analysis.regime?.regime });

            const regime = analysis.regime?.regime?.toLowerCase() || 'moderate';
            const minConfidenceThreshold = aiConfig.getMinConfidenceForRegime(regime);

            console.log(`\n📊 REGIME: ${pair} - ${regime.toUpperCase()} market, AI threshold: ${minConfidenceThreshold}% (regime-specific)`);
            logger.info('Orchestrator: regime detected (regime-specific confidence threshold)', { pair, regime, minConfidenceThreshold, signalConfidence: analysis.signal?.confidence });

            if (analysis.signal && analysis.regime && analysis.signal.confidence >= minConfidenceThreshold) {
              if (analysis.signal.signal !== 'buy') {
                return { type: 'rejected', signal: { pair, reason: 'not_buy', signal: analysis.signal.signal, confidence: analysis.signal.confidence } };
              }

              // Creeping uptrend = sustained slow grind → use 'weak' profit target (1.5%)
              // Transitioning = ADX slope rising, trend forming → use 'transitioning' target (0.8%)
              const effectiveRegime = isCreepingUptrend ? 'weak' : isTransitioning ? 'transitioning' : (analysis.regime.regime as any);

              const entryPath = isCreepingUptrend ? 'creeping' : isVolumeSurge ? 'path3_volume' : isTransitioning ? 'transitioning' : 'path1_or_2';
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
                  adx: indicators.adx ?? 0,
                  momentum1h: indicators.momentum1h ?? 0,
                  momentum4h: indicators.momentum4h ?? 0,
                  confidence: analysis.signal.confidence,
                  regime: effectiveRegime,
                  entryPath,
                  volumeRatio: indicators.volumeRatio ?? 0,
                },
              };

              // Reduce ETH position 50% when BTC 1h momentum is negative
              if (pair.startsWith('ETH') && btcMomentum1h < 0) {
                decision.capitalPreservationMultiplier = (decision.capitalPreservationMultiplier ?? 1) * 0.5;
                logger.info('Orchestrator: ETH position halved — BTC 1h momentum negative', { pair, btcMomentum1h: btcMomentum1h.toFixed(3), newMultiplier: decision.capitalPreservationMultiplier });
              }

              const adxVal = indicators.adx ?? 0;
              const adxMod = env.ADX_MODERATE_MAX; // 40
              const adxWeak = env.ADX_WEAK_MAX;     // 25
              const adxTrans = env.ADX_TRANSITION_ZONE_MIN; // 15
              const regimeClass = adxVal >= adxMod ? 'STRONG' : adxVal >= adxWeak ? 'MODERATE' : adxVal >= env.RISK_MIN_ADX_FOR_ENTRY ? 'WEAK' : adxVal >= adxTrans ? 'TRANSITIONING' : 'CHOPPY';
              const expectedTarget = adxVal >= adxMod ? `${(env.PROFIT_TARGET_STRONG * 100).toFixed(0)}%` : adxVal >= adxWeak ? `${(env.PROFIT_TARGET_MODERATE * 100).toFixed(0)}%` : adxVal >= env.RISK_MIN_ADX_FOR_ENTRY ? `${(env.PROFIT_TARGET_WEAK * 100).toFixed(1)}%` : adxVal >= adxTrans ? `${(env.PROFIT_TARGET_TRANSITIONING * 100).toFixed(1)}%` : `${(env.PROFIT_TARGET_CHOPPY * 100).toFixed(1)}%`;
              console.log(`\n✅ TRADE DECISION CREATED for ${pair}!`, { confidence: analysis.signal.confidence, minThreshold: minConfidenceThreshold, regime: analysis.regime.regime, adx: adxVal.toFixed(1), regimeClass, expectedProfitTarget: expectedTarget, btcMomentum1h: btcMomentum1h.toFixed(3), cpMultiplier: decision.capitalPreservationMultiplier });
              logger.info('Orchestrator: TRADE DECISION CREATED (5-stage filter passed)', { pair, signalStrength: analysis.signal.strength, confidence: analysis.signal.confidence, minConfidenceThreshold, entryPrice: analysis.signal.entryPrice, stopLoss: analysis.signal.stopLoss, takeProfit: analysis.signal.takeProfit, regime: analysis.regime.regime, adx: adxVal.toFixed(1), regimeClass, expectedProfitTarget: expectedTarget, btcMomentum1h: btcMomentum1h.toFixed(3), cpMultiplier: decision.capitalPreservationMultiplier });

              return { type: 'decision', decision };

            } else if (analysis.signal && analysis.signal.confidence < minConfidenceThreshold) {
              logger.warn('Orchestrator: signal generated but rejected due to low confidence', { pair, signal: analysis.signal.signal, confidence: analysis.signal.confidence, minThreshold: minConfidenceThreshold, gap: minConfidenceThreshold - analysis.signal.confidence });
              return { type: 'rejected', signal: { pair, reason: 'low_confidence', signal: analysis.signal.signal, confidence: analysis.signal.confidence, minThreshold: minConfidenceThreshold, gap: minConfidenceThreshold - analysis.signal.confidence } };
            } else if (analysis.signal === undefined) {
              logger.warn('Orchestrator: no signal generated for pair', { pair, hasRegime: !!analysis.regime, regimeType: analysis.regime?.regime });
              return { type: 'skipped' };
            } else {
              console.log(`\n❌ SIGNAL REJECTED for ${pair}:`, { hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence, minConfidenceThreshold, passesConfidence: analysis.signal ? analysis.signal.confidence >= minConfidenceThreshold : false });
              logger.warn('Orchestrator: signal rejected - unknown reason', { pair, hasSignal: !!analysis.signal, hasRegime: !!analysis.regime, signalType: analysis.signal?.signal, signalConfidence: analysis.signal?.confidence, minConfidenceThreshold });
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
            logger.info('Orchestrator: execution plans created', {
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
          logger.info('Orchestrator: direct execution complete', {
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
   * Fetch OHLC candles from Kraken API and calculate technical indicators
   * CRITICAL: Do NOT return default indicators on error - only use real data for risk assessment
   *
   * PARITY REQUIREMENT: Must use 15m candles (not 1h) to match /nexus behavior!
   * With 15m candles: momentum1h = 4 candles, momentum4h = 16 candles
   * With 1h candles: those same calculations would give 4h and 16h momentum (WRONG!)
   */
  /**
   * Get cached OHLC data or fetch fresh if needed (OPTIMIZATION: Priority #1)
   * Reduces Kraken API calls from N per cycle to 1 per pair per 30 seconds
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

    // Calculate technical indicators from real Kraken candles
    return calculateTechnicalIndicators(candles);
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
    // Trending = moderate/strong (ADX >= 25), Choppy = choppy/weak/transitioning (ADX < 25)
    const isTrending = regime === 'moderate' || regime === 'strong';

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
    if (tradeAgeMinutes <= 5) {
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

      // Process each open trade
      let exitCount = 0;
      for (const trade of openTrades) {
        try {
          // Get current market price from aggregator (exchange-specific for accurate bid/ask)
          const momExchangeForPrice = trade.exchange || 'binance';
          const marketData = await marketDataAggregator.getMarketData([trade.pair], momExchangeForPrice);
          const currentPriceData = marketData.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair', { pair: trade.pair });
            continue;
          }

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));
          const momExchange = trade.exchange || 'kraken';

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
          const position: OpenPosition = {
            pair: trade.pair,
            entryPrice,
            currentPrice,
            profitPct,
            pyramidLevelsActivated: 0, // Default - can be enhanced later if tracking multi-level entries
          };

          // Update peak profit tracking (same as profit target pass)
          // CRITICAL: Pass position data to prevent degraded mode
          const trackedPositionsMF = positionTracker.getTrackedPositions();
          if (!trackedPositionsMF.includes(trade.id)) {
            const entryTimeMs = this.parseEntryTime(trade.entry_time);
            await positionTracker.recordPeak(
              trade.id,
              profitPct,
              entryTimeMs,
              entryPrice,
              quantity,
              currentPrice,
              momTotalFees
            );
          } else {
            await positionTracker.updatePeakIfHigher(trade.id, profitPct, currentPrice, momTotalFees);
          }

          // Fetch and calculate real technical indicators
          const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');

          // Run momentum failure detector
          const momentumResult = momentumFailureDetector.detectMomentumFailure(
            position,
            indicators
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

      let exitCount = 0;
      for (const trade of openTrades) {
        try {
          // Get current market price (exchange-specific for accurate bid/ask/spread)
          const tradeExchange = trade.exchange || 'binance';
          const marketData = await marketDataAggregator.getMarketData([trade.pair], tradeExchange);
          const currentPriceData = marketData.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair - skipping trade', { pair: trade.pair, tradeId: trade.id });
            continue;
          }

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

          // Determine regime LIVE from current ADX — never use stale bot config value
          // Stale regime causes wrong profit targets (e.g. null → 'moderate' → 2% when market is choppy)
          let regime = 'moderate'; // safe fallback
          try {
            const regimeIndicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
            const liveAdx = regimeIndicators?.adx ?? 0;
            if (liveAdx >= 40) regime = 'strong';
            else if (liveAdx >= 25) regime = 'moderate';
            else if (liveAdx >= 15) regime = 'weak';
            else regime = 'choppy';
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
          const trackedPositions = positionTracker.getTrackedPositions();
          logger.debug('Checking if trade tracked', {
            tradeId: trade.id,
            isTracked: trackedPositions.includes(trade.id),
            trackedCount: trackedPositions.length,
          });

          if (!trackedPositions.includes(trade.id)) {
            const entryTimeMs = this.parseEntryTime(trade.entry_time);
            // Use NET profit for peak tracking - peaks must be real (after fees)
            await positionTracker.recordPeak(
              trade.id,
              currentProfitPct,
              entryTimeMs,
              entryPrice,
              quantity,
              currentPrice,
              entryFeeDollars
            );
            logger.debug('Position peak profit recorded (NET)', {
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
            // Update peak if current NET profit exceeds previous peak
            await positionTracker.updatePeakIfHigher(trade.id, currentProfitPct, currentPrice, entryFeeDollars);
            logger.debug('Position peak updated if higher (NET)', {
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
          let adxSlope = 0;
          try {
            const exitIndicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
            adxSlope = exitIndicators?.adxSlope ?? 0;
          } catch {
            // Safe fallback: slope=0 means no adjustment (uses static regime targets)
          }
          const slopeFallingThreshold = env.ADX_SLOPE_FALLING_THRESHOLD;
          switch (regime.toLowerCase()) {
            case 'choppy':
              profitTarget = env.PROFIT_TARGET_CHOPPY;  // 1.5% - fast exit
              break;
            case 'transitioning':
              profitTarget = env.PROFIT_TARGET_TRANSITIONING; // 2.5% - early trend
              break;
            case 'weak':
              profitTarget = env.PROFIT_TARGET_WEAK;    // 2.5% - weak trends
              break;
            case 'moderate':
              profitTarget = env.PROFIT_TARGET_MODERATE; // 5% - developing trends
              break;
            case 'strong':
              // ADX slope downgrade: if trend exhausting, use moderate target
              if (adxSlope <= slopeFallingThreshold) {
                profitTarget = env.PROFIT_TARGET_MODERATE;
                console.log(`📉 [ORCHESTRATOR] Profit target downgraded: strong → moderate (slope ${adxSlope.toFixed(2)} <= ${slopeFallingThreshold})`);
              } else {
                profitTarget = env.PROFIT_TARGET_STRONG;   // default 8% — configurable via PROFIT_TARGET_STRONG
              }
              break;
            default:
              profitTarget = env.PROFIT_TARGET_MODERATE; // Default to 5%
          }

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
          if (!shouldClose) {
            const erosionCheck = positionTracker.checkErosionCap(
              trade.id,
              trade.pair,
              currentProfitPct,  // Use NET profit
              regime,
              currentPrice       // Required for absolute value comparison
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
          // CRITICAL: Uses GROSS profit (/nexus has no fees; NET triggers too early on Kraken)
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

          // CHECK 2.5: STALE UNDERWATER — never profitable, old enough, still negative → give up
          // Catches slow bleeds that don't hit early loss depth thresholds
          if (!shouldClose && grossProfitPct < 0) {
            const staleMinutes = env.STALE_UNDERWATER_MINUTES; // 30 min default
            const staleMinLoss = env.STALE_UNDERWATER_MIN_LOSS_PCT * 100; // -0.3% default (in percent)
            const peakData = positionTracker.getPeakProfit(trade.id);
            const peakPct = peakData?.peakPct || 0;

            // Use profitCollapseMinPeakPct (0.5%) as "meaningfully profitable" threshold
            // Trades that peaked < 0.5% never confirmed the entry thesis — treat as stale
            if (peakPct < profitCollapseMinPeakPct && tradeAgeMinutes >= staleMinutes && grossProfitPct < staleMinLoss) {
              shouldClose = true;
              exitReason = 'stale_underwater';
              logger.info('🏊 STALE UNDERWATER - never profitable, giving up', {
                tradeId: trade.id,
                pair: trade.pair,
                grossProfitPct: grossProfitPct.toFixed(2) + '%',
                netProfitPct: currentProfitPct.toFixed(2) + '%',
                peakPct: peakPct.toFixed(2) + '%',
                ageMinutes: tradeAgeMinutes.toFixed(1),
                staleThresholdMinutes: staleMinutes,
                minLossThreshold: staleMinLoss.toFixed(2) + '%',
              });
            }
          }

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
                const isRising = peakPct >= 0 && distanceFromPeak <= flatBand; // at or near all-time high
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
                if (exitReason === 'stale_underwater' || exitReason === 'stale_flat' ||
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

      let pyramidCount = 0;
      for (const trade of openTrades) {
        try {
          // Get current market price (exchange-specific for accurate pricing)
          const pyramidExchange = trade.exchange || 'binance';
          const marketData = await marketDataAggregator.getMarketData([trade.pair], pyramidExchange);
          const currentPriceData = marketData.get(trade.pair);
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
          const profitTargetStrong = env.PROFIT_TARGET_STRONG * 100; // e.g. 0.20 → 20%
          if (currentProfitPct >= profitTargetStrong) {
            logger.debug('Trade approaching profit target - skip pyramid add', {
              pair: trade.pair,
              profitPct: currentProfitPct.toFixed(2),
              targetPct: profitTargetStrong,
            });
            continue;
          }

          // CHECK L1: Add at L1 trigger % profit (requires ADX > PYRAMID_L1_MIN_ADX)
          // Confidence inferred from ADX: ADX >= 35 = strong trend = high confidence
          // (Using stale bot-config confidence caused perpetual rejection — ADX IS the confidence signal)
          const l1TriggerPct = env.PYRAMID_L1_TRIGGER_PCT * 100;
          if (!hasL1 && currentProfitPct >= l1TriggerPct) {
            // Check ADX for trend strength first — ADX IS the confidence gate
            let adx = 0;
            try {
              const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
              adx = indicators.adx || 0;
            } catch (indicatorError) {
              logger.warn('Failed to fetch ADX for pyramid check', {
                pair: trade.pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
              adx = 0;
            }

            const minAdxL1 = env.PYRAMID_L1_MIN_ADX;
            // Infer AI confidence from ADX: ADX >= 35 → 87%, ADX >= 40 → 92%
            // A trade up 4.5% in a strong trend IS high-confidence by definition
            const inferredConfidence = adx >= 40 ? 92 : adx >= 35 ? 87 : 70;
            const l1ConfidenceCheck = riskManager.canAddPyramidLevel(1, inferredConfidence);
            if (!l1ConfidenceCheck.pass) {
              logger.debug('L1 pyramid rejected - insufficient confidence', {
                pair: trade.pair,
                reason: l1ConfidenceCheck.reason,
                adx: adx.toFixed(2),
                inferredConfidence,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
            } else {
              if (adx < minAdxL1) {
                logger.debug('L1 pyramid rejected - insufficient trend strength', {
                  pair: trade.pair,
                  adx: adx.toFixed(2),
                  minRequired: minAdxL1,
                  currentProfitPct: currentProfitPct.toFixed(2),
                  note: 'Need strong trend (ADX 35+) for safe pyramiding',
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

          // CHECK L2: Add at L2 trigger % profit (only if L1 exists, requires ADX > PYRAMID_L2_MIN_ADX)
          // Confidence inferred from ADX (same fix as L1 — stale bot-config caused perpetual rejection)
          const l2TriggerPct = env.PYRAMID_L2_TRIGGER_PCT * 100;
          if (!hasL2 && hasL1 && currentProfitPct >= l2TriggerPct) {
            let adxL2 = 0;
            try {
              const indicatorsL2 = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100, trade.exchange || 'binance');
              adxL2 = indicatorsL2.adx || 0;
            } catch (indicatorError) {
              logger.warn('Failed to fetch ADX for L2 pyramid check', {
                pair: trade.pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
              adxL2 = 0;
            }

            const minAdxL2 = env.PYRAMID_L2_MIN_ADX;
            // ADX >= 40 → 92% confidence (above L2 minimum of 90%)
            const inferredConfidenceL2 = adxL2 >= 40 ? 92 : 70;
            const l2ConfidenceCheck = riskManager.canAddPyramidLevel(2, inferredConfidenceL2);

            if (!l2ConfidenceCheck.pass || adxL2 < minAdxL2) {
              logger.debug('L2 pyramid rejected', {
                pair: trade.pair,
                adx: adxL2.toFixed(2),
                minAdxRequired: minAdxL2,
                inferredConfidence: inferredConfidenceL2,
                reason: !l2ConfidenceCheck.pass ? l2ConfidenceCheck.reason : `ADX ${adxL2.toFixed(1)} < ${minAdxL2}`,
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
