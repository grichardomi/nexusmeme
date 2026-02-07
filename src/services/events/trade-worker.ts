/**
 * Trade Worker Service
 * Subscribes to price updates via PostgreSQL LISTEN and executes trades for bots
 * Multiple workers can run in parallel for horizontal scaling (zero cost pub/sub)
 */

import { logger } from '@/lib/logger';
import { pgNotifyManager } from './pg-notify-manager';
import { query } from '@/lib/db';
import { riskManager } from '@/services/risk/risk-manager';
import { positionTracker } from '@/services/risk/position-tracker';
import { calculateTechnicalIndicators } from '@/services/ai/market-analysis';
import { executionFanOut } from '@/services/execution/fan-out';
import { fetchOHLC } from '@/services/market-data/ohlc-fetcher';
import type { TradeDecision } from '@/types/market';

const PRICE_CHANNEL = 'price_updates';

interface PriceUpdate {
  pair: string;
  price: number;
  bid?: number;
  ask?: number;
  spread?: number;
  timestamp: number;
}

interface BotInstance {
  id: string;
  user_id: string;
  enabled_pairs: string[];
  status: string;
  exchange: string;
  config: Record<string, any>;
}

class TradeWorkerService {
  private isRunning = false;
  private workerId: string;

  constructor(workerId: string = '1') {
    this.workerId = workerId;
  }

  /**
   * Start the trade worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('TradeWorker: Already running', { workerId: this.workerId });
      return;
    }

    this.isRunning = true;
    logger.info('🚀 TradeWorker: Starting...', { workerId: this.workerId });

    // Connect to PostgreSQL
    await pgNotifyManager.connect();

    // Subscribe to price updates for all trading pairs
    await this.subscribeToChannels();

    logger.info('✅ TradeWorker: Running', {
      workerId: this.workerId,
    });
  }

  /**
   * Stop the trade worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('🛑 TradeWorker: Stopping...', { workerId: this.workerId });
    this.isRunning = false;

    // Unsubscribe from channels (cleanup)
    // Note: Connection close is handled by script, but explicit cleanup is good practice
    logger.info('✅ TradeWorker: Stopped', { workerId: this.workerId });
  }

  /**
   * Subscribe to PostgreSQL NOTIFY channels for all trading pairs
   */
  private async subscribeToChannels(): Promise<void> {
    const commonPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'MATIC/USD'];

    for (const pair of commonPairs) {
      // Sanitize pair name for PostgreSQL channel (no special chars)
      const channel = `${PRICE_CHANNEL}_${pair.replace('/', '_')}`;
      await pgNotifyManager.subscribe(channel, async (_channel, payload) => {
        await this.handlePriceUpdate(payload);
      });
    }

    logger.info('TradeWorker: Subscribed to channels', {
      pairs: commonPairs,
    });
  }

  /**
   * Handle incoming price update notification
   */
  private async handlePriceUpdate(update: PriceUpdate): Promise<void> {
    const { pair, price } = update;

    logger.debug('TradeWorker: Price update received', {
      workerId: this.workerId,
      pair,
      price,
    });

    // FIRST: Check exits for open positions on this pair (critical - prevent profit slippage)
    await this.checkExitsForPair(pair, price);

    // SECOND: Get all active bots trading this pair
    const bots = await this.getActiveBotsForPair(pair);

    if (bots.length === 0) {
      logger.debug('TradeWorker: No active bots for pair', { pair });
      return;
    }

    logger.debug('TradeWorker: Processing bots', {
      pair,
      botCount: bots.length,
    });

    // THIRD: Process bots for entry signals (in parallel)
    await Promise.all(
      bots.map((bot) => this.processBotForPair(bot, pair, price).catch((err) => {
        logger.error('TradeWorker: Bot processing failed', err, {
          botId: bot.id,
          pair,
        });
      }))
    );
  }

  /**
   * Get all active bots trading a specific pair
   */
  private async getActiveBotsForPair(pair: string): Promise<BotInstance[]> {
    try {
      const result = await query<BotInstance>(
        `SELECT id, user_id, enabled_pairs, status, exchange, config
         FROM bot_instances
         WHERE status = 'running'
         AND $1 = ANY(enabled_pairs)`,
        [pair]
      );

      return result;
    } catch (error) {
      logger.error('TradeWorker: Failed to get active bots', error instanceof Error ? error : null, {
        pair,
      });
      return [];
    }
  }

  /**
   * Check exit conditions for all open positions on this pair
   * Runs erosion cap, profit target, and early loss checks
   */
  private async checkExitsForPair(pair: string, currentPrice: number): Promise<void> {
    try {
      // Get all open trades for this pair
      const openTrades = await query<{
        id: string;
        bot_instance_id: string;
        pair: string;
        entry_price: string;
        quantity: string;
        entry_time: string;
        stop_loss: string | null;
        take_profit: string | null;
      }>(
        `SELECT id, bot_instance_id, pair, entry_price, quantity, entry_time, stop_loss, take_profit
         FROM trades
         WHERE pair = $1 AND status = 'open'`,
        [pair]
      );

      if (openTrades.length === 0) {
        return;
      }

      logger.debug('TradeWorker: Checking exits for open trades', {
        pair,
        tradeCount: openTrades.length,
        currentPrice,
      });

      // Check each trade for exit conditions
      for (const trade of openTrades) {
        const entryPrice = parseFloat(trade.entry_price);
        const quantity = parseFloat(trade.quantity);
        const currentProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const entryTimeMs = new Date(trade.entry_time).getTime();

        // Update peak tracking (needed for erosion calculation)
        // CRITICAL: recordPeak on first encounter, updatePeakIfHigher on subsequent
        // recordPeak OVERWRITES data, so only call it once to initialize
        const isTracked = positionTracker.getTrackedPositions().includes(trade.id);
        if (!isTracked) {
          await positionTracker.recordPeak(
            trade.id,
            currentProfitPct,
            entryTimeMs,
            entryPrice,
            quantity,
            currentPrice
          );
        } else {
          await positionTracker.updatePeakIfHigher(trade.id, currentProfitPct, currentPrice);
        }

        // Determine regime based on ADX (fetch from indicators or use default)
        // TODO: Cache indicators per pair to avoid redundant OHLC fetches
        const regime = 'moderate'; // Default regime for now

        // Check erosion cap (primary exit)
        const erosionCheck = positionTracker.checkErosionCap(
          trade.id,
          trade.pair,
          currentProfitPct,
          regime,
          currentPrice
        );
        if (erosionCheck.shouldExit) {
          logger.info('TradeWorker: Erosion cap triggered - closing position', {
            tradeId: trade.id,
            pair: trade.pair,
            reason: erosionCheck.reason,
            currentPrice,
            entryPrice,
            currentProfitPct: currentProfitPct.toFixed(2) + '%',
          });
          await this.closePosition(
            trade.id,
            trade.bot_instance_id,
            trade.pair,
            entryPrice,
            quantity,
            currentPrice,
            erosionCheck.reason || 'erosion_cap'
          );
          continue;
        }

        // Check profit target
        const profitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const takeProfit = trade.take_profit ? parseFloat(trade.take_profit) : null;
        if (takeProfit && currentPrice >= takeProfit) {
          logger.info('TradeWorker: Profit target hit - closing position', {
            tradeId: trade.id,
            pair: trade.pair,
            currentPrice,
            takeProfit,
            profitPct: profitPct.toFixed(2) + '%',
          });
          await this.closePosition(
            trade.id,
            trade.bot_instance_id,
            trade.pair,
            entryPrice,
            quantity,
            currentPrice,
            'profit_target'
          );
          continue;
        }

        // Check early loss (for underwater trades)
        const entryTime = new Date(trade.entry_time).getTime();
        const ageMinutes = (Date.now() - entryTime) / 60000;
        if (profitPct < 0) {
          const earlyLossThreshold = this.getEarlyLossThreshold(ageMinutes);
          if (profitPct <= earlyLossThreshold) {
            logger.info('TradeWorker: Early loss threshold hit - closing position', {
              tradeId: trade.id,
              pair: trade.pair,
              profitPct: profitPct.toFixed(2) + '%',
              threshold: earlyLossThreshold.toFixed(2) + '%',
              ageMinutes: ageMinutes.toFixed(1),
            });
            await this.closePosition(
              trade.id,
              trade.bot_instance_id,
              trade.pair,
              entryPrice,
              quantity,
              currentPrice,
              'early_loss'
            );
            continue;
          }
        }
      }
    } catch (error) {
      logger.error('TradeWorker: Exit check failed', error instanceof Error ? error : null, { pair });
    }
  }

  /**
   * Get early loss threshold based on trade age (matches orchestrator logic)
   */
  private getEarlyLossThreshold(ageMinutes: number): number {
    if (ageMinutes <= 5) return -1.5;
    if (ageMinutes <= 15) return -2.0;
    if (ageMinutes <= 30) return -2.5;
    if (ageMinutes <= 180) return -3.5; // 3 hours
    return -4.5; // 4+ hours
  }

  /**
   * Close a position
   */
  private async closePosition(
    tradeId: string,
    botInstanceId: string,
    pair: string,
    entryPrice: number,
    quantity: number,
    exitPrice: number,
    reason: string
  ): Promise<void> {
    try {
      // Calculate P&L
      const profitLoss = (exitPrice - entryPrice) * quantity;
      const profitLossPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

      // Call the close API endpoint
      const response = await fetch(`http://localhost:3000/api/bots/trades/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId,
          botInstanceId,
          pair,
          exitTime: new Date().toISOString(),
          exitPrice,
          profitLoss,
          profitLossPercent,
          exitReason: reason,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('TradeWorker: Failed to close position', null, {
          tradeId,
          pair,
          exitPrice,
          reason,
          status: response.status,
          error,
        });
      } else {
        logger.info('TradeWorker: Position closed successfully', {
          tradeId,
          pair,
          exitPrice,
          profitLoss: profitLoss.toFixed(2),
          profitLossPercent: profitLossPercent.toFixed(2) + '%',
          reason,
        });
      }
    } catch (error) {
      logger.error('TradeWorker: Error closing position', error instanceof Error ? error : null, {
        tradeId,
        pair,
        exitPrice,
        reason,
      });
    }
  }

  /**
   * Process a single bot for a pair (check entry conditions)
   */
  private async processBotForPair(bot: BotInstance, pair: string, currentPrice: number): Promise<void> {
    // Check if bot already has an open position on this pair
    const existingPosition = await query<{ id: string }>(
      `SELECT id FROM trades
       WHERE bot_instance_id = $1
       AND pair = $2
       AND status = 'open'
       LIMIT 1`,
      [bot.id, pair]
    );

    if (existingPosition.length > 0) {
      logger.debug('TradeWorker: Bot has open position, skipping', {
        botId: bot.id,
        pair,
      });
      return;
    }

    // Fetch OHLC data for technical indicators
    const candles = await fetchOHLC(pair, 100, '15m');
    if (!candles || candles.length === 0) {
      logger.warn('TradeWorker: No OHLC data available', { pair });
      return;
    }

    // Calculate technical indicators
    const indicators = calculateTechnicalIndicators(candles);

    if (!indicators.adx) {
      logger.warn('TradeWorker: Missing ADX indicator', { pair });
      return;
    }

    // Calculate intrabar momentum (current price vs current candle open)
    // CRITICAL: This shows if price is currently rising (green candle) or falling (red candle)
    const currentCandleOpen = candles[candles.length - 1].open;
    const intrabarMomentum = ((currentPrice - currentCandleOpen) / currentCandleOpen) * 100;
    indicators.intrabarMomentum = intrabarMomentum;

    // Initialize risk manager with bot config
    riskManager.initializeFromBotConfig(bot.config, bot.exchange);

    // Update BTC momentum (for drop protection)
    riskManager.updateBTCMomentum(pair === 'BTC/USD' ? (indicators.momentum1h || 0) : 0);

    // Run 5-stage risk filter
    const healthGate = riskManager.checkHealthGate(indicators.adx || 0);
    if (!healthGate.pass) {
      logger.debug('TradeWorker: Health gate blocked', {
        botId: bot.id,
        pair,
        reason: healthGate.reason,
      });
      return;
    }

    const ticker = { bid: 0, ask: 0, last: currentPrice };
    const dropProtection = riskManager.checkDropProtection(pair, ticker, indicators);
    if (!dropProtection.pass) {
      logger.debug('TradeWorker: Drop protection blocked', {
        botId: bot.id,
        pair,
        reason: dropProtection.reason,
      });
      return;
    }

    const entryQuality = riskManager.checkEntryQuality(pair, currentPrice, indicators);
    if (!entryQuality.pass) {
      logger.debug('TradeWorker: Entry quality blocked', {
        botId: bot.id,
        pair,
        reason: entryQuality.reason,
      });
      return;
    }

    // All filters passed - create trade decision
    const adxValue = indicators.adx || 0;
    const regimeType = adxValue >= 40 ? 'strong' : adxValue >= 25 ? 'moderate' : 'weak';
    const decision: TradeDecision = {
      pair,
      side: 'buy',
      price: currentPrice,
      amount: 0, // Will be calculated by fan-out
      stopLoss: currentPrice * 0.95,
      takeProfit: currentPrice * 1.05,
      reason: 'Event-driven entry signal',
      signalConfidence: 75,
      timestamp: new Date(),
      regime: {
        type: regimeType,
        confidence: 75,
        reason: `ADX ${adxValue.toFixed(1)} indicates ${regimeType} trend`,
        timestamp: new Date(),
      },
    };

    // Execute trade via fan-out
    const plans = await executionFanOut.fanOutTradeDecision(decision);
    const result = await executionFanOut.executeTradesDirect(plans);

    logger.info('TradeWorker: Trade execution complete', {
      botId: bot.id,
      pair,
      executed: result.executed,
      skipped: result.skipped,
    });
  }
}

// Export class for creating multiple workers
export { TradeWorkerService };

// Singleton instance (can create multiple for different workers)
export const tradeWorkerService = new TradeWorkerService(
  process.env.WORKER_ID || '1'
);
