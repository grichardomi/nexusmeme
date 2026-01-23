import { query, transaction } from '@/lib/db';
import { logger, logTradeExecution } from '@/lib/logger';
import type { TradeDecision, ExecutionPlan } from '@/types/market';
import DynamicPositionSizer from '@/services/trading/dynamic-position-sizer';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';

interface BotInstance {
  id: string;
  user_id: string;
  exchange: string;
  enabled_pairs: string[];
  config: Record<string, any>;
}

/**
 * Execution Fan-Out
 * Converts one trade decision into per-user execution plans
 * Critical: Respects user constraints (balance, limits, regime)
 */
class ExecutionFanOut {
  /**
   * Fan out trade decision to all active bots
   * Each bot gets a user-specific execution plan
   */
  async fanOutTradeDecision(decision: TradeDecision): Promise<ExecutionPlan[]> {
    logger.info('Starting trade decision fan-out', {
      pair: decision.pair,
      side: decision.side,
      price: decision.price,
      regime: decision.regime.type,
    });

    // IMPORTANT: Trade decision has ALREADY passed 5-stage risk filter in orchestrator:
    // Stage 1: Health Gate (ADX chop detection)
    // Stage 2: Drop Protection (BTC dumps, volume panics, spreads)
    // Stage 3: Entry Quality (no tops, no extreme overbought, requires momentum)
    // Stage 4: AI Validation (confidence threshold)
    // Stage 5: Cost Floor (profit > 3× costs)
    //
    // Fan-out applies regime-based position sizing and validates per-bot constraints

    // Get all active bots that trade this pair
    const activeBots = await this.getActiveBotsForPair(decision.pair);
    logger.info('Found active bots for pair', {
      pair: decision.pair,
      botCount: activeBots.length,
    });

    // Create execution plan for each bot
    const executionPlans: ExecutionPlan[] = [];

    for (const bot of activeBots) {
      try {
        const plan = await this.createExecutionPlan(bot, decision);
        if (plan) {
          executionPlans.push(plan);
        }
      } catch (error) {
        logger.error('Failed to create execution plan for bot', error instanceof Error ? error : null, {
          botId: bot.id,
          userId: bot.user_id,
          pair: decision.pair,
        });
      }
    }

    logger.info('Fan-out complete', {
      pair: decision.pair,
      executionPlansCreated: executionPlans.length,
      botCount: activeBots.length,
    });

    return executionPlans;
  }

  /**
   * Get all active bots that trade the given pair
   */
  private async getActiveBotsForPair(pair: string): Promise<BotInstance[]> {
    try {
      const result = await query<BotInstance>(
        `SELECT id, user_id, exchange, enabled_pairs, config
         FROM bot_instances
         WHERE status = 'running'
         AND $1 = ANY(enabled_pairs)`,
        [pair]
      );

      return result;
    } catch (error) {
      logger.error('Failed to get active bots', error instanceof Error ? error : null, {
        pair,
      });
      return [];
    }
  }

  /**
   * Create user-specific execution plan
   * Validates user constraints before returning plan
   */
  private async createExecutionPlan(
    bot: BotInstance,
    decision: TradeDecision
  ): Promise<ExecutionPlan | null> {
    // Validate bot has pair enabled
    if (!bot.enabled_pairs.includes(decision.pair)) {
      return null;
    }

    // Check if bot already has an open position on this pair
    const existingPosition = await query<{ id: string }>(
      `SELECT id FROM trades
       WHERE bot_instance_id = $1
       AND pair = $2
       AND status = 'open'
       LIMIT 1`,
      [bot.id, decision.pair]
    );

    if (existingPosition.length > 0) {
      logger.info('Skipping trade: bot already has open position on pair', {
        botId: bot.id,
        pair: decision.pair,
      });
      return null;
    }

    // Calculate position size using DynamicPositionSizer (ported from /nexus)
    // Supports fixed capital (e.g., 1000) or unlimited (0 = fetches from exchange with 95% buffer)
    const hasInitialCapital = bot.config?.initialCapital !== undefined;
    const configuredCapital = bot.config?.initialCapital ?? 1000; // Fallback to $1k if not set (parity with nexus)

    // Log when fallback capital is used (improved parity with nexus)
    if (!hasInitialCapital && configuredCapital === 1000) {
      logger.warn('Using fallback initial capital - bot config missing initialCapital', {
        botId: bot.id,
        pair: decision.pair,
        fallbackCapital: 1000,
      });
    }

    const aiConfidence = decision.regime?.confidence ?? 70; // AI confidence already in 0-100 range

    let effectiveBalance = 0;

    // UNLIMITED MODE: 0 or "unlimited" (string) means fetch real exchange balance for pyramiding
    // Backward compatible: support both new numeric 0 and legacy "unlimited" string
    const isUnlimitedMode = configuredCapital === 0 || (typeof configuredCapital === 'string' && configuredCapital.toLowerCase() === 'unlimited');

    if (isUnlimitedMode) {
      try {
        // Fetch balance from exchange adapter (same as dashboard endpoint)
        const realBalance = await this.fetchRealExchangeBalance(bot.id, bot.user_id, bot.exchange);

        if (realBalance <= 0) {
          logger.error('Failed to fetch unlimited balance - got zero or negative', null, {
            botId: bot.id,
            exchange: bot.exchange,
            balance: realBalance,
          });
          return null; // Cannot execute trade without knowing balance
        }

        // Apply 95% buffer to prevent "insufficient balance" errors from fluctuations
        effectiveBalance = realBalance * 0.95;
        logger.info('Using unlimited capital with 95% buffer', {
          botId: bot.id,
          realBalance,
          bufferedBalance: effectiveBalance,
          buffer: '5%',
          mode: typeof configuredCapital === 'string' ? 'legacy-string' : 'numeric-0',
        });
      } catch (error) {
        logger.error('Error fetching unlimited exchange balance', error instanceof Error ? error : null, {
          botId: bot.id,
          exchange: bot.exchange,
        });
        return null; // Cannot execute trade without knowing balance
      }
    } else if (typeof configuredCapital === 'number' && configuredCapital > 0 && Number.isFinite(configuredCapital)) {
      // FIXED CAPITAL MODE: Use configured amount (no balance fetch needed)
      effectiveBalance = Number(configuredCapital);
    } else if (typeof configuredCapital === 'string' && !isUnlimitedMode) {
      // Try to parse string number (backward compatibility for "1000" stored as string)
      const parsed = parseFloat(configuredCapital);
      if (Number.isFinite(parsed) && parsed > 0) {
        effectiveBalance = parsed;
      } else {
        logger.error('Bot has invalid capital configuration', null, {
          botId: bot.id,
          configuredCapital,
          type: typeof configuredCapital,
        });
        return null;
      }
    } else {
      logger.error('Bot has invalid capital configuration', null, {
        botId: bot.id,
        configuredCapital,
        type: typeof configuredCapital,
      });
      return null;
    }

    // Initialize position sizer with actual balance (enables pyramiding via compounding)
    const positionSizer = new DynamicPositionSizer(effectiveBalance);

    // Update position sizer with actual trade history for Kelly Criterion calibration
    // This enables aggressive pyramiding on proven strategies and conservative sizing on untested strategies
    try {
      const closedTrades = await query<{ profit_loss: number; status: string }>(
        `SELECT profit_loss, status FROM trades
         WHERE bot_instance_id = $1 AND status = 'closed'
         ORDER BY exit_time DESC LIMIT 100`,
        [bot.id]
      );

      if (closedTrades && closedTrades.length > 0) {
        const totalTrades = closedTrades.length;
        const winningTrades = closedTrades.filter(t => (Number(t.profit_loss) || 0) > 0);
        const losingTrades = closedTrades.filter(t => (Number(t.profit_loss) || 0) < 0);
        const totalProfit = winningTrades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0));

        positionSizer.updatePerformance(totalTrades, winningTrades.length, losingTrades.length, totalProfit, totalLoss);

        logger.debug('Position sizer updated with trade history', {
          botId: bot.id,
          totalTrades,
          winRate: `${((winningTrades.length / totalTrades) * 100).toFixed(1)}%`,
          totalProfit: `$${totalProfit.toFixed(2)}`,
        });
      }
    } catch (error) {
      logger.warn('Failed to update position sizer with trade history', {
        botId: bot.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue anyway - position sizer will use defaults without history
    }

    // Calculate the actual stop loss percentage from the decision
    // Decision provides stopLoss from signal generation (5% per Nexus parity)
    let stopLossPct = 0.05; // Default to 5% stop loss (parity with Nexus)
    if (decision.stopLoss && Math.abs(decision.stopLoss - decision.price) > 0.01) {
      // Only override if stopLoss is meaningfully different from price
      stopLossPct = Math.abs((decision.stopLoss - decision.price) / decision.price);
    }

    // Calculate position size using Kelly Criterion + AI confidence
    // This is what makes pyramiding work: as balance grows, positions grow automatically
    const positionSize = positionSizer.calculatePositionSize(
      aiConfidence,
      decision.price,
      stopLossPct // Use actual stop loss from decision, not hardcoded 2%
    );

    const quantity = positionSize.sizeAsset;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      logger.warn('Position sizing produced invalid quantity, skipping trade', {
        botId: bot.id,
        effectiveBalance,
        riskUSD: positionSize.riskUSD,
        price: decision.price,
        quantity,
      });
      return null;
    }

    logger.info('Position size calculated', {
      botId: bot.id,
      effectiveBalance: `$${effectiveBalance.toFixed(2)}`,
      riskUSD: `$${positionSize.riskUSD.toFixed(2)}`,
      sizeUSD: `$${positionSize.sizeUSD.toFixed(2)}`,
      price: decision.price,
      quantity: quantity.toFixed(8),
      aiConfidence: `${aiConfidence.toFixed(0)}%`,
    });

    // TODO: Check user balance (Phase 3 - exchange integration)
    // TODO: Apply pyramiding rules

    const plan: ExecutionPlan = {
      userId: bot.user_id,
      botInstanceId: bot.id,
      pair: decision.pair,
      side: decision.side,
      amount: quantity, // FIX: Use calculated amount based on capital
      price: decision.price,
      stopLoss: decision.stopLoss, // Risk management: passed from signal
      takeProfit: decision.takeProfit, // Dynamic profit target: passed from signal
      reason: decision.reason,
      timestamp: new Date(),
    };

    logTradeExecution(bot.user_id, decision.pair, {
      side: decision.side,
      amount: quantity,
      price: decision.price,
      regime: decision.regime.type,
    });

    return plan;
  }

  /**
   * Queue execution plans for async processing (mgpg)
   */
  async queueExecutionPlans(plans: ExecutionPlan[]): Promise<void> {
    if (plans.length === 0) return;

    try {
      await transaction(async client => {
        for (const plan of plans) {
          await client.query(
            `INSERT INTO job_queue (id, type, data, status, retries, max_retries, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
            ['execute_trade', JSON.stringify(plan), 'pending', 0, 3]
          );
        }
      });

      logger.info('Queued execution plans', {
        count: plans.length,
      });
    } catch (error) {
      logger.error('Failed to queue execution plans', error instanceof Error ? error : null, {
        count: plans.length,
      });
      throw error;
    }
  }

  /**
   * Process a single execution plan (called by job queue worker)
   */
  async processExecutionPlan(plan: ExecutionPlan): Promise<void> {
    // Idempotency check: verify this execution hasn't already been processed
    const existing = await query<{ id: string }>(
      `SELECT id FROM trades WHERE id = $1`,
      [plan.userId + '_' + plan.pair + '_' + plan.timestamp.getTime()]
    );

    if (existing.length > 0) {
      logger.info('Execution already processed (idempotent)', {
        userId: plan.userId,
        pair: plan.pair,
      });
      return;
    }

    logger.info('Processing execution plan', {
      userId: plan.userId,
      pair: plan.pair,
      side: plan.side,
      amount: plan.amount,
    });

    // TODO: Call exchange adapter to place order (Phase 3)
    // TODO: Record trade in database
  }

  /**
   * Fetch real exchange balance for unlimited capital bots
   * Uses same approach as /api/bots/[id]/balance endpoint
   * @returns Total available USD/USDT balance
   * @throws Error if balance cannot be fetched
   */
  private async fetchRealExchangeBalance(
    botId: string,
    userId: string,
    exchange: string
  ): Promise<number> {
    try {
      // Get API keys for this exchange
      const keysResult = await query(
        `SELECT encrypted_public_key, encrypted_secret_key
         FROM exchange_api_keys
         WHERE user_id = $1 AND exchange = $2`,
        [userId, exchange.toLowerCase()]
      );

      if (keysResult.length === 0) {
        throw new Error(`No API keys configured for ${exchange}`);
      }

      const keys = keysResult[0];

      // Decrypt API keys
      let publicKey: string;
      let secretKey: string;

      try {
        publicKey = decrypt(keys.encrypted_public_key);
        secretKey = decrypt(keys.encrypted_secret_key);
      } catch (decryptError) {
        // Fallback: try base64 decoding for legacy keys
        try {
          logger.warn('AES decryption failed, trying base64 fallback for unlimited balance', {
            botId,
            exchange,
          });
          publicKey = Buffer.from(keys.encrypted_public_key, 'base64').toString('utf-8');
          secretKey = Buffer.from(keys.encrypted_secret_key, 'base64').toString('utf-8');
        } catch (fallbackError) {
          throw new Error('Failed to decrypt API keys - they may be corrupted');
        }
      }

      // Connect to exchange and fetch balance
      const adapter = getExchangeAdapter(exchange);

      try {
        await adapter.connect({
          publicKey,
          secretKey,
        });
      } catch (connectError) {
        const errorMsg = connectError instanceof Error ? connectError.message : String(connectError);
        throw new Error(`Failed to authenticate with ${exchange}: ${errorMsg}`);
      }

      // Get all balances
      let balances;
      try {
        balances = await adapter.getBalances();
      } catch (balanceError) {
        const errorMsg = balanceError instanceof Error ? balanceError.message : String(balanceError);
        throw new Error(`Failed to fetch balance from ${exchange}: ${errorMsg}`);
      }

      // Calculate total USDT/USD value
      let totalAvailable = 0;
      for (const balance of balances) {
        const asset = balance.asset.toUpperCase();

        // Sum USD and USDT (and ZUSD for Kraken)
        if (asset === 'USD' || asset === 'USDT' || asset === 'ZUSD') {
          totalAvailable += balance.total;
        }
      }

      logger.info('Fetched real exchange balance for unlimited capital bot', {
        botId,
        exchange,
        available: totalAvailable,
        currencyCount: balances.length,
      });

      return totalAvailable;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch real exchange balance', error instanceof Error ? error : null, {
        botId,
        exchange,
        errorMsg,
      });
      throw error;
    }
  }
}

// Singleton instance
export const executionFanOut = new ExecutionFanOut();
