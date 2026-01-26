/**
 * Trade Signal Orchestrator
 * Converts AI signals into actual trade execution plans
 * This is the missing orchestrator that connects signal analysis to trade execution
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';
import { analyzeMarket } from '@/services/ai/analyzer';
import { executionFanOut } from '@/services/execution/fan-out';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { momentumFailureDetector, type OpenPosition } from '@/services/trading/momentum-failure-detector';
import { calculateTechnicalIndicators } from '@/services/ai/market-analysis';
import { regimeDetector } from '@/services/regime/detector';
import { riskManager } from '@/services/risk/risk-manager';
import { positionTracker } from '@/services/risk/position-tracker';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { fetchKrakenOHLC } from '@/services/market-data/kraken-ohlc';
import type { TradeDecision } from '@/types/market';

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

  // Per-pair loss cooldown tracking (prevents trade churn after losses)
  // Key: pair, Value: timestamp when cooldown expires
  private pairLossCooldowns = new Map<string, number>();

  // Per-pair loss streak tracking
  private pairLossStreaks = new Map<string, number>();

  /**
   * Helper: Parse entry_time correctly (handle string or Date object from database)
   */
  private parseEntryTime(entryTime: any): number {
    if (typeof entryTime === 'number') {
      return entryTime;
    }
    if (entryTime instanceof Date) {
      return entryTime.getTime();
    }
    return new Date(entryTime).getTime();
  }

  /**
   * Check for existing open positions on a pair across all bots (/nexus parity)
   * Returns count of open positions - if > 0, skip signal generation for this pair
   */
  private async checkExistingOpenPositions(pair: string): Promise<number> {
    try {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM trades
         WHERE pair = $1 AND status = 'open'`,
        [pair]
      );
      return parseInt(result[0]?.count || '0', 10);
    } catch (error) {
      logger.error('Failed to check existing positions', error instanceof Error ? error : null, { pair });
      return 0; // Fail open - allow trade if check fails
    }
  }

  /**
   * Check if a pair is in loss cooldown (prevents trade churn after consecutive losses)
   * Returns the cooldown reason if in cooldown, null otherwise
   */
  private isPairInLossCooldown(pair: string): string | null {
    const cooldownExpiry = this.pairLossCooldowns.get(pair);
    if (cooldownExpiry && Date.now() < cooldownExpiry) {
      const remainingMinutes = Math.ceil((cooldownExpiry - Date.now()) / 60000);
      const lossStreak = this.pairLossStreaks.get(pair) || 0;
      return `Loss cooldown active (${lossStreak} consecutive losses, ${remainingMinutes}min remaining)`;
    }
    // Cooldown expired - clear it
    if (cooldownExpiry) {
      this.pairLossCooldowns.delete(pair);
      this.pairLossStreaks.set(pair, 0); // Reset streak after cooldown
    }
    return null;
  }

  /**
   * Record a loss for a pair and apply cooldown if needed
   * Cooldown increases with consecutive losses to prevent churn
   */
  recordPairLoss(pair: string): void {
    const env = getEnvironmentConfig();
    const currentStreak = (this.pairLossStreaks.get(pair) || 0) + 1;
    this.pairLossStreaks.set(pair, currentStreak);

    // Cooldown: 5 minutes base, increases with streak
    // 1st loss: 5 min, 2nd: 10 min, 3rd+: 15 min
    const baseCooldownMs = 5 * 60 * 1000; // 5 minutes
    const cooldownMultiplier = Math.min(currentStreak, 3); // Cap at 3x
    const cooldownMs = baseCooldownMs * cooldownMultiplier;

    const maxLossStreak = env.RISK_MAX_LOSS_STREAK || 5;

    // If exceeded max streak, apply hour-long cooldown
    if (currentStreak >= maxLossStreak) {
      const hourCooldownMs = (env.RISK_LOSS_COOLDOWN_HOURS || 1) * 60 * 60 * 1000;
      this.pairLossCooldowns.set(pair, Date.now() + hourCooldownMs);
      logger.warn('Loss streak limit reached - applying extended cooldown', {
        pair,
        lossStreak: currentStreak,
        maxLossStreak,
        cooldownHours: env.RISK_LOSS_COOLDOWN_HOURS || 1,
      });
    } else {
      this.pairLossCooldowns.set(pair, Date.now() + cooldownMs);
      logger.info('Loss recorded - applying cooldown', {
        pair,
        lossStreak: currentStreak,
        cooldownMinutes: cooldownMs / 60000,
      });
    }
  }

  /**
   * Record a win for a pair (resets loss streak)
   */
  recordPairWin(pair: string): void {
    this.pairLossStreaks.set(pair, 0);
    this.pairLossCooldowns.delete(pair);
  }

  /**
   * Start the orchestrator (runs on configurable interval)
   */
  async start(intervalMs: number = 60000) {
    if (this.isRunning) {
      logger.warn('Trade signal orchestrator already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting trade signal orchestrator', { intervalMs });

    // Initialize position tracker from database (load peak profits from previous session)
    await positionTracker.initializeFromDatabase();

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
    logger.info('Trade signal orchestrator stopped');
  }

  /**
   * Main orchestration loop: fetch bots, analyze signals, execute trades, check momentum failure
   */
  private async analyzeAndExecuteSignals() {
    try {
      // Get all active bots with enabled pairs
      const activeBots = await this.getActiveBots();
      if (activeBots.length === 0) {
        logger.debug('Orchestrator: no active bots found to trade');
        return; // No bots to trade
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

      if (allPairs.length === 0) {
        logger.debug('Orchestrator: no pairs configured on active bots');
        return; // No pairs configured
      }

      logger.debug('Orchestrator: analyzing pairs', { pairs: allPairs, pairCount: allPairs.length });

      // Fetch market data once for all pairs
      await marketDataAggregator.getMarketData(allPairs);

      // ZERO PASS A: Fetch BTC momentum for drop protection (needed by risk manager)
      // Determine BTC pair based on exchange (Kraken uses USD, Binance uses USDT)
      try {
        const primaryExchange = activeBots[0]?.exchange || 'kraken';
        const btcPair = primaryExchange === 'binance' ? 'BTC/USDT' : 'BTC/USD';

        const btcData = await marketDataAggregator.getMarketData([btcPair]);
        const btcMarketData = btcData.get(btcPair);
        if (btcMarketData) {
          // Calculate BTC 1h momentum (needs minimum 26 candles for indicator calculation)
          const btcCandles = await this.fetchAndCalculateIndicators(btcPair, '15m', 100);
          if (btcCandles.momentum1h !== undefined) {
            riskManager.updateBTCMomentum(btcCandles.momentum1h / 100); // Convert percent to decimal
            logger.debug('Orchestrator: BTC momentum updated for risk management', {
              btcPair,
              exchange: primaryExchange,
              btcMomentum1h: (btcCandles.momentum1h / 100).toFixed(4),
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch BTC momentum for risk manager', error instanceof Error ? error : undefined);
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

      // FIRST PASS: Check for momentum failure on open trades (exit)
      // Runs before generating new signals to manage existing positions
      await this.checkOpenTradesForMomentumFailure();

      // SECOND PASS: Check for profit targets and time-based exits
      // Closes trades that have reached profit targets or exceeded time limits
      await this.checkOpenTradesForProfitTargets();

      // THIRD PASS: Add pyramid levels to profitable open trades (safe pyramiding)
      // Runs AFTER profit target check so trades that should exit can exit first
      await this.addPyramidLevelsToOpenTrades(allPairs);

      // FOURTH PASS: Analyze new signals and generate trade decisions
      const tradeDecisions: TradeDecision[] = [];
      const rejectedSignals: Array<Record<string, any>> = [];

      // Log orchestrator cycle summary
      logger.debug('Orchestrator cycle: momentum failure → profit targets → pyramiding → 5-stage risk filter → new signals');

      for (const pair of allPairs) {
        try {
          // LOSS COOLDOWN CHECK: Skip pairs that had recent consecutive losses
          // Prevents trade churn where losing trades keep reopening
          const cooldownReason = this.isPairInLossCooldown(pair);
          if (cooldownReason) {
            console.log(`\n⏳ COOLDOWN: Skipping ${pair} - ${cooldownReason}`);
            logger.info('Orchestrator: skipping pair due to loss cooldown', {
              pair,
              reason: cooldownReason,
            });
            rejectedSignals.push({
              pair,
              reason: 'loss_cooldown',
              details: cooldownReason,
            });
            continue;
          }

          // POSITION CHECK: Skip pairs with existing open positions (/nexus parity)
          // This prevents duplicate entries - check BEFORE generating signals
          const existingPositions = await this.checkExistingOpenPositions(pair);
          if (existingPositions > 0) {
            console.log(`\n📊 POSITION EXISTS: Skipping ${pair} - ${existingPositions} open position(s)`);
            logger.debug('Orchestrator: skipping pair - open position exists', {
              pair,
              openPositions: existingPositions,
            });
            continue; // Don't even analyze - already have a position
          }

          // ============================================
          // 5-STAGE RISK FILTER (/nexus parity - BEFORE AI)
          // This is critical: runs BEFORE AI to prevent entries in bad conditions
          // If momentum is weak, we don't even call AI - saves API costs + prevents churn
          // ============================================
          let indicators;
          try {
            indicators = await this.fetchAndCalculateIndicators(pair, '15m', 100);
          } catch (indicatorError) {
            logger.warn('Failed to fetch indicators for pre-entry risk check', {
              pair,
              error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
            });
            continue; // Skip pair if we can't get indicators
          }

          // Get current price for risk filter
          const marketData = await marketDataAggregator.getMarketData([pair]);
          const currentPriceData = marketData.get(pair);
          if (!currentPriceData) {
            logger.warn('No market data for pre-entry risk check', { pair });
            continue;
          }
          const currentPrice = currentPriceData.price;

          // Run 5-stage risk filter (matching /nexus behavior)
          const profitTarget = currentPrice * 0.05; // 5% target for cost calculation
          const ticker = { spread: currentPrice * 0.001 }; // Estimate spread as 0.1%

          const riskFilter = await riskManager.runFullRiskFilter(
            pair,
            currentPrice,
            indicators,
            ticker,
            profitTarget
          );

          if (!riskFilter.pass) {
            console.log(`\n🚫 RISK FILTER BLOCKED: ${pair} - ${riskFilter.reason}`);
            logger.info('Orchestrator: entry blocked by 5-stage risk filter', {
              pair,
              reason: riskFilter.reason,
              stage: riskFilter.stage,
              momentum1h: indicators.momentum1h?.toFixed(3),
              adx: indicators.adx?.toFixed(1),
            });
            rejectedSignals.push({
              pair,
              reason: 'risk_filter_blocked',
              details: riskFilter.reason,
              stage: riskFilter.stage,
            });
            continue; // Don't call AI - conditions are bad
          }

          console.log(`\n✅ RISK FILTER PASSED: ${pair} - proceeding to AI analysis`);
          logger.debug('Orchestrator: 5-stage risk filter passed', {
            pair,
            momentum1h: indicators.momentum1h?.toFixed(3),
            adx: indicators.adx?.toFixed(1),
          });

          const analysis = await analyzeMarket({
            pair,
            timeframe: '1h',
            includeSignal: true,
            includeRegime: true,
          });

          // DIAGNOSTIC: Log raw analysis result immediately after analyzeMarket returns
          console.log(`\n🔍 DIAGNOSTIC: analyzeMarket returned for ${pair}`, {
            hasSignal: !!analysis.signal,
            hasRegime: !!analysis.regime,
            signalType: analysis.signal?.signal,
            signalConfidence: analysis.signal?.confidence,
            regimeType: analysis.regime?.regime,
          });
          logger.info('Orchestrator: analyzeMarket returned', {
            pair,
            hasSignal: !!analysis.signal,
            hasRegime: !!analysis.regime,
            signalType: analysis.signal?.signal,
            signalConfidence: analysis.signal?.confidence,
            regimeType: analysis.regime?.regime,
          });

          const minConfidenceThreshold = riskManager.getAIConfidenceThreshold();

          logger.info('Orchestrator: AI threshold computed', {
            pair,
            signalConfidence: analysis.signal?.confidence,
            regime: analysis.regime?.regime,
            regimeConfidence: analysis.regime?.confidence,
            minConfidenceThreshold,
          });

          // Check if signal exists and confidence is high enough
          if (
            analysis.signal &&
            analysis.regime &&
            analysis.signal.confidence >= minConfidenceThreshold
          ) {
            // Only execute buy signals (filter out sells and holds)
            if (analysis.signal.signal !== 'buy') {
              rejectedSignals.push({
                pair,
                reason: 'not_buy',
                signal: analysis.signal.signal,
                confidence: analysis.signal.confidence,
              });
              continue;
            }

            // ============================================
            // CREATE TRADE DECISION (AI signal is gatekeeper)
            // /nexus parity: No BEARISH TREND BLOCKER - AI confidence is the gatekeeper
            // ============================================

            const decision: TradeDecision = {
              pair,
              side: 'buy',
              price: analysis.signal.entryPrice,
              amount: 1, // Base amount - will be adjusted per-bot
              stopLoss: analysis.signal.stopLoss, // Risk management: 2% default
              takeProfit: analysis.signal.takeProfit, // Dynamic profit target based on regime
              reason: `AI signal (strength: ${analysis.signal.strength}, confidence: ${analysis.signal.confidence}%, regime: ${analysis.regime.regime}) - matching /nexus`,
              timestamp: new Date(),
              regime: {
                type: analysis.regime.regime as any,
                confidence: analysis.regime.confidence / 100, // Convert 0-100 to 0-1
                reason: analysis.regime.analysis,
                timestamp: analysis.regime.timestamp,
              },
            };

            tradeDecisions.push(decision);

            console.log(`\n✅ TRADE DECISION CREATED for ${pair}!`, {
              confidence: analysis.signal.confidence,
              minThreshold: minConfidenceThreshold,
              regime: analysis.regime.regime,
            });
            logger.info('Orchestrator: TRADE DECISION CREATED (5-stage filter passed)', {
              pair,
              signalStrength: analysis.signal.strength,
              confidence: analysis.signal.confidence,
              minConfidenceThreshold,
              entryPrice: analysis.signal.entryPrice,
              stopLoss: analysis.signal.stopLoss,
              takeProfit: analysis.signal.takeProfit,
              regime: analysis.regime.regime,
            });
          } else if (analysis.signal && analysis.signal.confidence < minConfidenceThreshold) {
            logger.warn('Orchestrator: signal generated but rejected due to low confidence', {
              pair,
              signal: analysis.signal.signal,
              confidence: analysis.signal.confidence,
              minThreshold: minConfidenceThreshold,
              gap: minConfidenceThreshold - analysis.signal.confidence,
            });
            rejectedSignals.push({
              pair,
              reason: 'low_confidence',
              signal: analysis.signal.signal,
              confidence: analysis.signal.confidence,
              minThreshold: minConfidenceThreshold,
              gap: minConfidenceThreshold - analysis.signal.confidence,
            });
          } else if (analysis.signal === undefined) {
            logger.warn('Orchestrator: no signal generated for pair', {
              pair,
              hasRegime: !!analysis.regime,
              regimeType: analysis.regime?.regime,
            });
          } else {
            // DIAGNOSTIC: Catch-all for any other rejection reason
            console.log(`\n❌ SIGNAL REJECTED for ${pair}:`, {
              hasSignal: !!analysis.signal,
              hasRegime: !!analysis.regime,
              signalType: analysis.signal?.signal,
              signalConfidence: analysis.signal?.confidence,
              minThreshold: minConfidenceThreshold,
              passesConfidence: analysis.signal ? analysis.signal.confidence >= minConfidenceThreshold : false,
            });
            logger.warn('Orchestrator: signal rejected - unknown reason', {
              pair,
              hasSignal: !!analysis.signal,
              hasRegime: !!analysis.regime,
              signalType: analysis.signal?.signal,
              signalConfidence: analysis.signal?.confidence,
              minConfidenceThreshold,
              passesConfidenceCheck: analysis.signal ? analysis.signal.confidence >= minConfidenceThreshold : false,
            });
          }
        } catch (error) {
          logger.error(`Orchestrator: failed to analyze ${pair}`, error instanceof Error ? error : null);
        }
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
  private async fetchAndCalculateIndicators(pair: string, timeframe: string = '15m', limit: number = 100) {
    // Fetch real OHLC data from Kraken API (parity with /nexus)
    // Uses 15m candles so momentum calculations match /nexus exactly
    // Throws if Kraken unavailable - caller must handle
    const candles = await fetchKrakenOHLC(pair, limit, timeframe);

    if (candles.length < 26) {
      throw new Error(
        `Insufficient market data for ${pair}: ${candles.length} candles < 26 required`
      );
    }

    // Calculate technical indicators from real Kraken candles
    return calculateTechnicalIndicators(candles);
  }

  /**
   * Calculate early loss threshold based on trade age
   * Implements philosophy: More aggressive exits on young losing trades
   * Philosophy: EARLY_LOSS_MINUTE_1_5 -> MINUTE_15_30 -> HOUR_1_3 -> HOUR_4_PLUS -> DAILY
   */
  private getEarlyLossThreshold(tradeAgeMinutes: number): number {
    const env = getEnvironmentConfig();
    // Returns threshold as decimal (e.g., -0.015 for -1.5%)
    if (tradeAgeMinutes <= 5) {
      return env.EARLY_LOSS_MINUTE_1_5; // -1.5% by default
    } else if (tradeAgeMinutes <= 30) {
      return env.EARLY_LOSS_MINUTE_15_30; // -2.5% by default
    } else if (tradeAgeMinutes <= 180) { // 3 hours
      return env.EARLY_LOSS_HOUR_1_3; // -3.5% by default
    } else if (tradeAgeMinutes <= 1440) { // 24 hours
      return env.EARLY_LOSS_HOUR_4_PLUS; // -4.5% by default
    } else {
      return env.EARLY_LOSS_DAILY; // -5.5% by default (1+ day)
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
          t.price as entry_price,
          t.amount as quantity,
          t.entry_time,
          t.profit_loss,
          t.profit_loss_percent,
          b.user_id
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
          // Get current market price from aggregator
          const marketData = await marketDataAggregator.getMarketData([trade.pair]);
          const currentPriceData = marketData.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair', { pair: trade.pair });
            continue;
          }

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));
          const profitPct = ((currentPrice - entryPrice) / entryPrice) * 100;

          // Update profit metrics in database
          const profitLoss = (currentPrice - entryPrice) * quantity;
          try {
            await query(
              `UPDATE trades
               SET profit_loss = $1, profit_loss_percent = $2
               WHERE id = $3`,
              [profitLoss, profitPct, trade.id]
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
          const trackedPositionsMF = positionTracker.getTrackedPositions();
          if (!trackedPositionsMF.includes(trade.id)) {
            await positionTracker.recordPeak(trade.id, profitPct);
          } else {
            await positionTracker.updatePeakIfHigher(trade.id, profitPct);
          }

          // Fetch and calculate real technical indicators
          const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100);

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
              // Call trade close endpoint
              const closeResponse = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bots/trades/close`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    botInstanceId: trade.bot_instance_id,
                    tradeId: trade.id,
                    pair: trade.pair,
                    exitTime: new Date().toISOString(),
                    exitPrice,
                    profitLoss,
                    profitLossPercent,
                    exitReason: momExitType,
                  }),
                }
              );

              if (closeResponse.ok) {
                logger.info('Trade successfully closed by momentum failure detector', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  exitPrice,
                  profitLoss: profitLoss.toFixed(2),
                  profitLossPercent: profitLossPercent.toFixed(2),
                });
                // Clear position tracking when trade closes
                positionTracker.clearPosition(trade.id);
                exitCount++;

                // Record loss/win for cooldown tracking (prevents trade churn)
                if (profitLoss < 0) {
                  this.recordPairLoss(trade.pair);
                } else {
                  this.recordPairWin(trade.pair);
                }
              } else {
                const errorText = await closeResponse.text();
                logger.error('Failed to close trade', new Error(errorText), {
                  tradeId: trade.id,
                  pair: trade.pair,
                  status: closeResponse.status,
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
    const env = getEnvironmentConfig();
    try {
      // Get ALL open trades (not just from active bots) to manage risk
      // Matches /nexus behavior: all open positions must be monitored for exits
      const openTrades = await query<any>(
        `SELECT
          t.id,
          t.bot_instance_id,
          t.pair,
          t.price as entry_price,
          t.amount as quantity,
          t.entry_time,
          t.profit_loss,
          t.profit_loss_percent,
          t.stop_loss,
          b.user_id,
          b.config
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

      let exitCount = 0;
      for (const trade of openTrades) {
        try {
          // Get current market price
          const marketData = await marketDataAggregator.getMarketData([trade.pair]);
          const currentPriceData = marketData.get(trade.pair);
          if (!currentPriceData) {
            logger.warn('No market data for pair - skipping trade', { pair: trade.pair, tradeId: trade.id });
            continue;
          }

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const quantity = parseFloat(String(trade.quantity));
          const currentProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;

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

          // CRITICAL: Persist current profit metrics to database for monitoring
          // This ensures profit_loss and profit_loss_percent are always up-to-date
          const currentProfitLoss = (currentPrice - entryPrice) * quantity;
          try {
            await query(
              `UPDATE trades
               SET profit_loss = $1, profit_loss_percent = $2
               WHERE id = $3`,
              [currentProfitLoss, currentProfitPct, trade.id]
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

          // Parse bot config for profit targets
          const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
          const profitTargetConservative = parseFloat(botConfig?.profitTargetConservative || '0.02');
          const profitTargetModerate = parseFloat(botConfig?.profitTargetModerate || '0.05');
          const profitTargetAggressive = parseFloat(botConfig?.profitTargetAggressive || '0.12');
          const profitTargetModerateThreshold = parseFloat(botConfig?.profitTargetModerateThreshold || '0.03'); // 3% threshold
          const profitTargetAggressiveThreshold = parseFloat(botConfig?.profitTargetAggressiveThreshold || '0.08'); // 8% threshold
          const maxHoldHours = parseFloat(botConfig?.maxHoldHours || '336'); // 14 days default
          const emergencyLossLimit = parseFloat(botConfig?.emergencyLossLimit || '-0.06'); // -6% emergency exit
          const regime = botConfig?.regime || 'moderate';

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
            await positionTracker.recordPeak(trade.id, currentProfitPct, entryTimeMs);
            logger.debug('Position peak profit recorded', {
              tradeId: trade.id,
              pair: trade.pair,
              initialProfitPct: currentProfitPct.toFixed(2),
              entryTime: trade.entry_time,
            });
          } else {
            // Update peak if current profit exceeds previous peak
            await positionTracker.updatePeakIfHigher(trade.id, currentProfitPct);
            logger.debug('Position peak updated if higher', {
              tradeId: trade.id,
              currentProfitPct: currentProfitPct.toFixed(2),
            });
          }

          // Determine which profit target to use based on profit level (dynamic thresholds from config)
          let profitTarget = profitTargetConservative;
          if (currentProfitPct > profitTargetAggressiveThreshold * 100) {
            profitTarget = profitTargetAggressive;
          } else if (currentProfitPct > profitTargetModerateThreshold * 100) {
            profitTarget = profitTargetModerate;
          }

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

          // CHECK 1: Underwater Exit (from /nexus - close trades that never profited)
          // Only applies to positions that never went positive
          if (!shouldClose && currentProfitPct < 0) {
            // Read minimum time threshold from bot config, but use time-based escalation for actual loss threshold
            const minTimeMinutes = parseFloat(botConfig?.underwaterExitMinTimeMinutes || '15');
            const ageMinutes = tradeAgeMinutes;

            // Use environment-based time-escalated thresholds (philosophy: more aggressive on young trades)
            const underwaterThresholdPct = this.getEarlyLossThreshold(ageMinutes);

            // CRITICAL: Ensure peak is recorded before checking underwater timeout
            // This prevents false negatives when trade is too new to have recorded peak
            const trackedPositions = positionTracker.getTrackedPositions();
            if (!trackedPositions.includes(trade.id)) {
              const entryTimeMs = this.parseEntryTime(trade.entry_time);
              await positionTracker.recordPeak(trade.id, currentProfitPct, entryTimeMs);
              logger.debug('Peak profit initialized for underwater check', {
                tradeId: trade.id,
                pair: trade.pair,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
            }

            // Check if trade never went positive
            const entryDate = trade.entry_time instanceof Date ? trade.entry_time : new Date(String(trade.entry_time));
            const peakProfitData = positionTracker.checkUnderwaterTimeout(
              trade.id,
              trade.pair,
              currentProfitPct,
              entryDate,
              underwaterThresholdPct,
              minTimeMinutes
            );

            logger.debug('Underwater timeout check result', {
              tradeId: trade.id,
              pair: trade.pair,
              shouldExit: peakProfitData.shouldExit,
              currentProfitPct: currentProfitPct.toFixed(2),
              currentProfitAsDecimal: (currentProfitPct / 100).toFixed(4),
              peakProfitPct: peakProfitData.peakProfitPct.toFixed(4),
              underwaterThresholdPct: `${(underwaterThresholdPct * 100).toFixed(1)}%`,
              underwaterThresholdDecimal: underwaterThresholdPct.toFixed(4),
              ageMinutes: ageMinutes.toFixed(1),
              minTimeMinutes,
              entryTime: trade.entry_time,
              comparisonResult: `${(currentProfitPct / 100).toFixed(4)} < ${underwaterThresholdPct.toFixed(4)} = ${currentProfitPct / 100 < underwaterThresholdPct}`,
              reason: peakProfitData.reason,
            });

            if (peakProfitData.shouldExit) {
              shouldClose = true;
              const peakProfitPctNumeric = typeof peakProfitData.peakProfitPct === 'number'
                ? peakProfitData.peakProfitPct
                : parseFloat(String(peakProfitData.peakProfitPct));
              const exitType = peakProfitPctNumeric > 0 ? 'underwater_profitable_collapse' : 'underwater_never_profited';
              exitReason = exitType;

              logger.info(`Underwater exit triggered (${exitType})`, {
                tradeId: trade.id,
                pair: trade.pair,
                exitType,
                currentProfitPct: typeof currentProfitPct === 'number' ? currentProfitPct.toFixed(2) : currentProfitPct,
                peakProfitPct: typeof peakProfitPctNumeric === 'number' ? peakProfitPctNumeric.toFixed(4) : peakProfitPctNumeric,
                ageMinutes: typeof ageMinutes === 'number' ? ageMinutes.toFixed(1) : ageMinutes,
              });
            }
          }

          // CHECK 1A: Momentum-Based Underwater Exit (exit when momentum collapses)
          // If underwater AND momentum has dropped below threshold, exit
          // UNDERWATER_MOMENTUM_THRESHOLD must be LOWER than entry momentum (RISK_MIN_MOMENTUM_1H)
          // Entry requires > 0.5%, so only exit if momentum drops to < 0.3% (collapsed)
          // CRITICAL: Only fires when loss is meaningful (not spread noise like -0.02%)
          // PARITY WITH /NEXUS: Require minimum 15 minutes before underwater exits trigger
          const underwaterMomentumMinLossPct = (env.UNDERWATER_MOMENTUM_MIN_LOSS_PCT || 0.001) * 100; // decimal to % (default -0.1%)
          const underwaterMinTimeMinutes = env.UNDERWATER_EXIT_MIN_TIME_MINUTES || 15; // Match /nexus: 15 min minimum

          // Skip underwater momentum check if trade is too young (parity with /nexus)
          if (!shouldClose && currentProfitPct < -underwaterMomentumMinLossPct && tradeAgeMinutes < underwaterMinTimeMinutes) {
            logger.debug('Underwater momentum check skipped - trade too young', {
              tradeId: trade.id,
              pair: trade.pair,
              tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
              minRequired: underwaterMinTimeMinutes,
              currentProfitPct: currentProfitPct.toFixed(2),
            });
          }

          if (!shouldClose && tradeAgeMinutes >= underwaterMinTimeMinutes && currentProfitPct < -underwaterMomentumMinLossPct) {
            try {
              const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100);
              const momentum1h = indicators.momentum1h ?? 0; // percent
              const underwaterMomentumThreshold = env.UNDERWATER_MOMENTUM_THRESHOLD * 100; // env is decimal, convert to %

              if (momentum1h < underwaterMomentumThreshold) {
                shouldClose = true;
                exitReason = 'momentum_failure_underwater';
                logger.info('Underwater momentum breakdown - closing trade', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  currentProfitPct: currentProfitPct.toFixed(2),
                  momentum1h: momentum1h.toFixed(2),
                  underwaterThreshold: underwaterMomentumThreshold.toFixed(2),
                  minLossRequired: `-${underwaterMomentumMinLossPct.toFixed(2)}%`,
                  note: 'Momentum too weak to support recovery',
                });
              }
            } catch (indicatorError) {
              logger.warn('Failed to fetch indicators for underwater momentum check', {
                tradeId: trade.id,
                pair: trade.pair,
                error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
              });
            }
          }

          // CHECK 1B: Erosion Cap Exceeded (from /nexus - protect pyramid profits)
          // Check BEFORE profit target so erosion exits take priority
          // CRITICAL: Check if peak was profitable (not current), so trades that were profitable
          // but turned into losses are exited when erosion cap is exceeded
          if (!shouldClose) {
            const erosionCheck = positionTracker.checkErosionCap(
              trade.id,
              trade.pair,
              currentProfitPct,
              regime
            );

            logger.debug('Erosion cap check result', {
              tradeId: trade.id,
              pair: trade.pair,
              shouldExit: erosionCheck.shouldExit,
              peakProfitPct: erosionCheck.peakProfitPct?.toFixed(4),
              currentProfitPct: currentProfitPct.toFixed(2),
              regime,
            });

            // Only apply erosion cap if peak profit was positive (trade was ever profitable)
            if (erosionCheck.shouldExit && erosionCheck.peakProfitPct > 0) {
              shouldClose = true;
              exitReason = 'erosion_cap_protected'; // Protecting winner from eroding away
              logger.info('Erosion cap triggered - exiting to protect peak profit', {
                tradeId: trade.id,
                pair: trade.pair,
                peakProfitPct: erosionCheck.peakProfitPct.toFixed(4),
                currentProfitPct: erosionCheck.currentProfitPct.toFixed(4),
                erosionUsed: erosionCheck.erosionUsed.toFixed(4),
                erosionCap: erosionCheck.erosionCap.toFixed(4),
                erosionUsedPct: (erosionCheck.erosionUsedPct * 100).toFixed(2),
                status: `Trade peaked at +${(erosionCheck.peakProfitPct * 100).toFixed(2)}% but eroded ${(erosionCheck.erosionUsed * 100).toFixed(2)}% - exiting`,
              });
            }
          }


          // CHECK 2: Profit target reached
          if (!shouldClose && currentProfitPct >= profitTarget * 100) {
            shouldClose = true;
            exitReason = 'profit_target_hit'; // Generic reason, actual profit % logged separately
          }

          // CHECK 2.5: Stale flat trade exit - trade running for hours with ~0% P&L
          // Prevents trades from being stuck indefinitely when no other exit triggers
          if (!shouldClose) {
            const { getEnvironmentConfig } = require('@/config/environment');
            const envConfig = getEnvironmentConfig();
            const staleFlatHours = envConfig.STALE_FLAT_TRADE_HOURS || 6;
            const staleFlatBandPct = envConfig.STALE_FLAT_TRADE_BAND_PCT || 0.5;
            if (tradeAgeMinutes >= staleFlatHours * 60 &&
                Math.abs(currentProfitPct) < staleFlatBandPct) {
              shouldClose = true;
              exitReason = 'stale_flat_trade';
              logger.info('Stale flat trade exit triggered - trade has been near-zero P&L too long', {
                tradeId: trade.id,
                pair: trade.pair,
                tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
                staleFlatHours,
                currentProfitPct: currentProfitPct.toFixed(2),
                staleFlatBandPct,
              });
            }
          }

          // CHECK 3: Maximum hold time exceeded
          if (!shouldClose && tradeAgeMinutes >= maxHoldHours * 60) {
            shouldClose = true;
            exitReason = `time_exit_${maxHoldHours}_hours`;
          }

          // CHECK 4: Significant unrealized loss (emergency exit - from config)
          if (!shouldClose && currentProfitPct < emergencyLossLimit * 100) {
            shouldClose = true;
            exitReason = 'emergency_loss_limit';
            logger.info('Emergency loss limit triggered for trade', {
              tradeId: trade.id,
              pair: trade.pair,
              currentProfitPct: currentProfitPct.toFixed(2),
              emergencyLossLimit: `${(emergencyLossLimit * 100).toFixed(1)}%`,
            });
          }

          if (shouldClose) {
            const exitPrice = currentPrice;
            const profitLoss = (currentPrice - entryPrice) * quantity;
            const profitLossPercent = currentProfitPct;

            logger.info('Profit target/time-based exit triggered - closing trade', {
              tradeId: trade.id,
              pair: trade.pair,
              entryPrice,
              exitPrice,
              profitPct: currentProfitPct.toFixed(2),
              tradeAgeMinutes: tradeAgeMinutes.toFixed(1),
              exitReason,
            });

            try {
              // Call trade close endpoint
              const closeResponse = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bots/trades/close`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    botInstanceId: trade.bot_instance_id,
                    tradeId: trade.id,
                    pair: trade.pair,
                    exitTime: new Date().toISOString(),
                    exitPrice,
                    profitLoss,
                    profitLossPercent,
                    exitReason,
                  }),
                }
              );

              if (closeResponse.ok) {
                logger.info('Trade successfully closed by profit target', {
                  tradeId: trade.id,
                  pair: trade.pair,
                  exitPrice,
                  profitLoss: profitLoss.toFixed(2),
                  profitLossPercent: profitLossPercent.toFixed(2),
                  exitReason,
                });
                // Clear position tracking when trade closes
                positionTracker.clearPosition(trade.id);
                exitCount++;

                // Record loss/win for cooldown tracking (prevents trade churn)
                if (profitLoss < 0) {
                  this.recordPairLoss(trade.pair);
                } else {
                  this.recordPairWin(trade.pair);
                }
              } else {
                const errorText = await closeResponse.text();
                logger.error('Failed to close profitable trade', new Error(errorText), {
                  tradeId: trade.id,
                  pair: trade.pair,
                  status: closeResponse.status,
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
  private async addPyramidLevelsToOpenTrades(allPairs: string[]): Promise<void> {
    const env = getEnvironmentConfig();
    try {
      // Get all open trades (excluding ones marked for closing)
      const openTrades = await query<any>(
        `SELECT
          t.id,
          t.bot_instance_id,
          t.pair,
          t.price as entry_price,
          t.amount as quantity,
          t.entry_time,
          t.profit_loss_percent,
          t.pyramid_levels,
          b.user_id,
          b.config
        FROM trades t
        INNER JOIN bot_instances b ON t.bot_instance_id = b.id
        WHERE t.status = 'open'
          AND t.pair = ANY($1)
        ORDER BY t.entry_time ASC`,
        [allPairs]
      );

      if (openTrades.length === 0) {
        logger.debug('No open trades to add pyramid levels to');
        return;
      }

      let pyramidCount = 0;
      for (const trade of openTrades) {
        try {
          // Get current market price
          const marketData = await marketDataAggregator.getMarketData([trade.pair]);
          const currentPriceData = marketData.get(trade.pair);
          if (!currentPriceData) continue;

          const currentPrice = currentPriceData.price;
          const entryPrice = parseFloat(String(trade.entry_price));
          const currentProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;

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
          const profitTargetAggressive = 12; // 12% from /nexusmeme config
          if (currentProfitPct >= profitTargetAggressive) {
            logger.debug('Trade approaching profit target - skip pyramid add', {
              pair: trade.pair,
              profitPct: currentProfitPct.toFixed(2),
              targetPct: profitTargetAggressive,
            });
            continue;
          }

          // CHECK L1: Add at 4.5% profit (requires 85% AI confidence minimum + ADX > 25)
          if (!hasL1 && currentProfitPct >= 4.5) {
            // Parse bot config for AI confidence (for pyramid gating)
            const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
            const aiConfidence = botConfig?.aiConfidence || 70; // Default to config value

            // Check pyramid confidence threshold (from /nexus)
            const l1ConfidenceCheck = riskManager.canAddPyramidLevel(1, aiConfidence);
            if (!l1ConfidenceCheck.pass) {
              logger.debug('L1 pyramid rejected - insufficient confidence', {
                pair: trade.pair,
                reason: l1ConfidenceCheck.reason,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
              // Don't add L1 if confidence too low
            } else {
              // Also check ADX for trend strength (philosophy requirement)
              let adx = 0;
              try {
                const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100);
                adx = indicators.adx || 0;
              } catch (indicatorError) {
                logger.warn('Failed to fetch ADX for pyramid check', {
                  pair: trade.pair,
                  error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
                });
                // If we can't get ADX, skip pyramid to be safe
                adx = 0;
              }

              const minAdxL1 = env.PYRAMID_L1_MIN_ADX;
              if (adx < minAdxL1) {
                logger.debug('L1 pyramid rejected - insufficient trend strength', {
                  pair: trade.pair,
                  adx: adx.toFixed(2),
                  minRequired: minAdxL1,
                  currentProfitPct: currentProfitPct.toFixed(2),
                  note: 'Need moderate trend (ADX 35+) for safe pyramiding',
                });
              } else {
                const l1Quantity = parseFloat(String(trade.quantity)) * 0.35; // 35% add (from /nexus)
                const l1Entry = {
                  level: 1,
                  entryPrice: currentPrice,
                  quantity: l1Quantity,
                  entryTime: new Date().toISOString(),
                  triggerProfitPct: 0.045,
                  status: 'pending_execution', // Mark as waiting for order
                  aiConfidence,
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
                    triggerProfitPct: 0.045,
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

          // CHECK L2: Add at 8% profit (only if L1 exists, requires 90% AI confidence minimum + ADX > 25)
          if (!hasL2 && hasL1 && currentProfitPct >= 8) {
            // Parse bot config for AI confidence (for pyramid gating)
            const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
            const aiConfidence = botConfig?.aiConfidence || 70; // Default to config value

            // Check pyramid confidence threshold (from /nexus)
            const l2ConfidenceCheck = riskManager.canAddPyramidLevel(2, aiConfidence);
            if (!l2ConfidenceCheck.pass) {
              logger.debug('L2 pyramid rejected - insufficient confidence', {
                pair: trade.pair,
                reason: l2ConfidenceCheck.reason,
                currentProfitPct: currentProfitPct.toFixed(2),
              });
              // Don't add L2 if confidence too low
            } else {
              // Also check ADX for trend strength (philosophy requirement)
              let adx = 0;
              try {
                const indicators = await this.fetchAndCalculateIndicators(trade.pair, '15m', 100);
                adx = indicators.adx || 0;
              } catch (indicatorError) {
                logger.warn('Failed to fetch ADX for pyramid check', {
                  pair: trade.pair,
                  error: indicatorError instanceof Error ? indicatorError.message : String(indicatorError),
                });
                // If we can't get ADX, skip pyramid to be safe
                adx = 0;
              }

              const minAdxL2 = env.PYRAMID_L2_MIN_ADX;
              if (adx < minAdxL2) {
                logger.debug('L2 pyramid rejected - insufficient trend strength', {
                  pair: trade.pair,
                  adx: adx.toFixed(2),
                  minRequired: minAdxL2,
                  currentProfitPct: currentProfitPct.toFixed(2),
                  note: 'Need strong trend (ADX 40+) for L2 pyramiding',
                });
              } else {
                const l2Quantity = parseFloat(String(trade.quantity)) * 0.50; // 50% add (from /nexus)
                const l2Entry = {
                  level: 2,
                  entryPrice: currentPrice,
                  quantity: l2Quantity,
                  entryTime: new Date().toISOString(),
                  triggerProfitPct: 0.08,
                  status: 'pending_execution', // Mark as waiting for order
                  aiConfidence,
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
                    triggerProfitPct: 0.08,
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
   * Get all active bots with enabled pairs
   */
  private async getActiveBots(): Promise<BotInstance[]> {
    try {
      // First, get all bots for debugging
      const allBots = await query<any>(
        `SELECT id, user_id, enabled_pairs, status, exchange, config
         FROM bot_instances
         ORDER BY created_at DESC`
      );

      // Filter for bots that are ready to trade
      const activeBots = (allBots || []).filter(bot => {
        const hasEnabledPairs = bot.enabled_pairs && Array.isArray(bot.enabled_pairs) && bot.enabled_pairs.length > 0;
        const isRunning = bot.status === 'running';

        // Debug log skipped bots
        if (!isRunning) {
          logger.debug('Orchestrator: skipping bot - not running', {
            botId: bot.id,
            status: bot.status
          });
        }
        if (!hasEnabledPairs) {
          logger.debug('Orchestrator: skipping bot - no enabled pairs', {
            botId: bot.id,
            pairs: bot.enabled_pairs
          });
        }

        return isRunning && hasEnabledPairs;
      });

      return activeBots as BotInstance[];
    } catch (error) {
      logger.error('Failed to fetch active bots', error instanceof Error ? error : null);
      return [];
    }
  }
}

export const tradeSignalOrchestrator = new TradeSignalOrchestrator();
