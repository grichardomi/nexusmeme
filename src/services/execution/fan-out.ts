import { query, transaction } from '@/lib/db';
import { logger, logTradeExecution } from '@/lib/logger';
import type { TradeDecision, ExecutionPlan } from '@/types/market';
import DynamicPositionSizer from '@/services/trading/dynamic-position-sizer';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { getExchangeTakerFee, getEnvironmentConfig } from '@/config/environment';
import { capitalPreservation } from '@/services/risk/capital-preservation';

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
      botIds: activeBots.map(b => b.id),
      botStatuses: activeBots.map(b => ({ id: b.id, exchange: b.exchange })),
    });

    if (activeBots.length === 0) {
      logger.warn('Fan-out: NO active bots found for pair - trade will not execute', {
        pair: decision.pair,
        reason: 'Query requires status=running AND pair in enabled_pairs',
      });
    }

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
      // Only return bots for users with valid subscription (active or trialing)
      // This is a second layer of defense after the orchestrator check
      const result = await query<BotInstance>(
        `SELECT bi.id, bi.user_id, bi.exchange, bi.enabled_pairs, bi.config
         FROM bot_instances bi
         INNER JOIN subscriptions s ON s.user_id = bi.user_id
         WHERE bi.status = 'running'
           AND s.status IN ('active', 'trialing')
           AND $1 = ANY(bi.enabled_pairs)`,
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

    // Use signal confidence (0-100) for position sizing, NOT regime confidence
    // Signal confidence = AI's confidence in the trade signal (72% = bigger position)
    // Regime confidence = confidence in market regime detection (separate concern)
    const aiConfidence = decision.signalConfidence ?? 70; // 0-100 scale

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

    // CAPITAL PRESERVATION: Per-bot Layer 2 (drawdown) + Layer 3 (loss streak)
    // Layer 1 (BTC trend gate) is already in decision.capitalPreservationMultiplier from orchestrator
    let cpMultiplier = decision.capitalPreservationMultiplier ?? 1.0;
    try {
      const botCp = await capitalPreservation.evaluateBot(bot.id, effectiveBalance);
      if (!botCp.allowTrading) {
        logger.info('Capital preservation: bot paused, skipping trade', {
          botId: bot.id,
          reason: botCp.reason,
          layer: botCp.layer,
        });
        return null;
      }
      cpMultiplier = Math.max(0.25, cpMultiplier * botCp.sizeMultiplier); // Floor at 0.25
      if (cpMultiplier < 1.0) {
        logger.info('Capital preservation: reducing position size for bot', {
          botId: bot.id,
          globalMultiplier: decision.capitalPreservationMultiplier ?? 1.0,
          botMultiplier: botCp.sizeMultiplier,
          combinedMultiplier: cpMultiplier,
          reason: botCp.reason,
        });
      }
    } catch (error) {
      logger.warn('Capital preservation: per-bot check error, using global multiplier only', {
        botId: bot.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // REGIME-BASED POSITION SIZING: Scale positions based on market regime
    // Strong trends = bigger positions (ride the wave)
    // Weak/choppy = smaller positions (reduce risk in uncertain markets)
    const env = getEnvironmentConfig();
    const transitionSizeMultiplier = env.ADX_TRANSITION_SIZE_MULTIPLIER; // 0.5 default
    const regimeMultipliers: Record<string, number> = {
      strong: 1.5,                          // 50% larger in strong trends
      moderate: 1.0,                        // Normal sizing
      weak: 0.75,                           // 25% smaller in weak trends
      transitioning: transitionSizeMultiplier, // From env (default 50% smaller)
      choppy: 0.5,                          // 50% smaller in choppy markets
    };
    const regimeType = decision.regime?.type || 'moderate';
    const regimeMultiplier = regimeMultipliers[regimeType] ?? 1.0;

    const baseQuantity = positionSize.sizeAsset;
    const quantity = baseQuantity * regimeMultiplier * cpMultiplier;

    logger.info('Position size with regime + capital preservation', {
      botId: bot.id,
      regime: regimeType,
      regimeMultiplier: `${regimeMultiplier}x`,
      cpMultiplier: `${cpMultiplier}x`,
      baseQuantity: baseQuantity.toFixed(8),
      adjustedQuantity: quantity.toFixed(8),
    });

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
   * Queue execution plans for async processing (DEPRECATED - use executeTradesDirect for /nexus parity)
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
   * Execute trades directly (synchronously) - /nexus parity
   * Prevents race conditions by executing one at a time with duplicate check
   */
  async executeTradesDirect(plans: ExecutionPlan[]): Promise<{ executed: number; skipped: number }> {
    if (plans.length === 0) return { executed: 0, skipped: 0 };

    let executed = 0;
    let skipped = 0;

    for (const plan of plans) {
      try {
        const result = await this.executeSingleTrade(plan);
        if (result.executed) {
          executed++;
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error('Direct trade execution failed', error instanceof Error ? error : null, {
          botId: plan.botInstanceId,
          pair: plan.pair,
        });
        skipped++;
      }
    }

    if (executed > 0) {
      console.log(`\n🎯 EXECUTION SUMMARY: ${executed} executed, ${skipped} skipped (of ${plans.length} plans)`);
    }
    logger.info('Direct execution complete', {
      executed,
      skipped,
      total: plans.length,
    });

    return { executed, skipped };
  }

  /**
   * Execute a single trade directly with duplicate prevention
   * This is the /nexus parity execution path - no job queue
   */
  private async executeSingleTrade(plan: ExecutionPlan): Promise<{ executed: boolean; tradeId?: string; reason?: string }> {
    const { userId, botInstanceId, pair, side, amount, stopLoss, takeProfit } = plan;
    // Note: plan.price is the AI signal's suggested price (may be stale from candle close)

    // DUPLICATE CHECK: Verify no open trade on same bot+pair exists
    // This runs synchronously so no race condition possible
    const existing = await query<{ id: string }>(
      `SELECT id FROM trades WHERE bot_instance_id = $1 AND pair = $2
       AND status = 'open'
       LIMIT 1`,
      [botInstanceId, pair]
    );

    if (existing && existing.length > 0) {
      console.log(`\n🚫 DUPLICATE BLOCKED: ${pair} - open position already exists (trade: ${existing[0].id})`);
      logger.info('Skipping trade: open position already exists (direct execution)', {
        botId: botInstanceId,
        pair,
        existingTradeId: existing[0].id,
      });
      return { executed: false, reason: 'open_position_exists' };
    }

    // Get bot instance to determine exchange and trading mode
    const botResult = await query<{ user_id: string; exchange: string; config: any; trading_mode: string }>(
      `SELECT user_id, exchange, config, trading_mode FROM bot_instances WHERE id = $1`,
      [botInstanceId]
    );

    if (!botResult || botResult.length === 0) {
      logger.error('Bot instance not found for direct execution', null, { botId: botInstanceId });
      return { executed: false, reason: 'bot_not_found' };
    }

    const bot = botResult[0];
    const exchange = bot.exchange;
    const tradingMode = bot.trading_mode || 'paper';

    // CRITICAL FIX (/nexus parity): Use LIVE market price at execution time, not stale signal price
    // The AI signal's entryPrice comes from candle close (can be up to 1 hour old for 1h candles)
    // For accurate P&L tracking, we must use the current live market price
    let executionPrice = plan.price; // Fallback to signal price

    try {
      const liveMarketData = await marketDataAggregator.getMarketData([pair]);
      const liveData = liveMarketData.get(pair);
      if (liveData && liveData.price > 0) {
        const priceDiff = Math.abs(liveData.price - plan.price) / plan.price * 100;
        executionPrice = liveData.price;

        if (priceDiff > 0.1) { // Log if difference is > 0.1%
          logger.info('Using live market price instead of signal price (/nexus parity)', {
            pair,
            signalPrice: plan.price.toFixed(2),
            livePrice: liveData.price.toFixed(2),
            diffPct: priceDiff.toFixed(2),
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch live market price, using signal price', {
        pair,
        signalPrice: plan.price,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Calculate stop loss and take profit based on execution price (not signal price)
    const calculatedStopLoss = stopLoss || (side === 'buy' ? executionPrice * 0.95 : executionPrice * 1.05);
    const calculatedTakeProfit = takeProfit || (side === 'buy' ? executionPrice * 1.05 : executionPrice * 0.95);

    let orderId = `paper_${Date.now()}`;
    let entryFee = 0; // Track entry fee for NET profit calculations

    // Execute on exchange (paper or live)
    if (tradingMode === 'live') {
      try {
        // Get API keys
        const keysResult = await query<{ encrypted_public_key: string; encrypted_secret_key: string }>(
          `SELECT encrypted_public_key, encrypted_secret_key
           FROM exchange_api_keys
           WHERE user_id = $1 AND exchange = $2`,
          [userId, exchange.toLowerCase()]
        );

        if (keysResult.length === 0) {
          throw new Error(`No API keys configured for ${exchange}`);
        }

        const keys = keysResult[0];
        let publicKey: string;
        let secretKey: string;

        try {
          publicKey = decrypt(keys.encrypted_public_key);
          secretKey = decrypt(keys.encrypted_secret_key);
        } catch {
          // Fallback: try base64 decoding for legacy keys
          publicKey = Buffer.from(keys.encrypted_public_key, 'base64').toString('utf-8');
          secretKey = Buffer.from(keys.encrypted_secret_key, 'base64').toString('utf-8');
        }

        const adapter = getExchangeAdapter(exchange);
        await adapter.connect({ publicKey, secretKey });

        // Place limit order at current market price
        const orderResult = await adapter.placeOrder({
          pair, side, amount, price: executionPrice,
        });

        orderId = orderResult.orderId;
        // For live trades, use actual fill price from exchange if available
        if (orderResult.avgPrice && orderResult.avgPrice > 0) {
          executionPrice = orderResult.avgPrice;
        }

        // Capture entry fee from exchange (or estimate as fallback)
        if ((orderResult as any).feeQuote && (orderResult as any).feeQuote > 0) {
          entryFee = (orderResult as any).feeQuote;
        } else if (orderResult.fee && orderResult.fee > 0) {
          entryFee = orderResult.fee;
        } else {
          // Estimate using taker fee rate for the exchange
          const feeRate = getExchangeTakerFee(exchange);
          entryFee = executionPrice * amount * feeRate;
        }

        console.log(`\n💰 LIVE TRADE EXECUTED: ${side.toUpperCase()} ${amount.toFixed(6)} ${pair} @ $${executionPrice.toFixed(2)} (fee: $${entryFee.toFixed(4)})`);
        logger.info('Trade executed on LIVE exchange (direct)', {
          orderId,
          pair,
          side,
          amount,
          executionPrice,
          entryFee,
          feeAsset: (orderResult as any).feeAsset,
          exchange,
          tradingMode: 'live',
        });
      } catch (error) {
        console.log(`\n❌ LIVE TRADE FAILED: ${pair} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.error('Live trade execution failed', error instanceof Error ? error : null, {
          botId: botInstanceId,
          pair,
          exchange,
        });
        return { executed: false, reason: 'exchange_error' };
      }
    } else {
      // Paper trade: estimate entry fee using taker rate for the exchange
      const feeRate = getExchangeTakerFee(exchange);
      entryFee = executionPrice * amount * feeRate;

      console.log(`\n📋 PAPER TRADE: ${side.toUpperCase()} ${amount.toFixed(6)} ${pair} @ $${executionPrice.toFixed(2)} (est fee: $${entryFee.toFixed(4)})`);
      logger.info('Paper trade executed (direct)', {
        orderId,
        pair,
        side,
        amount,
        executionPrice,
        entryFee,
        exchange,
        signalPrice: plan.price,
        tradingMode: 'paper',
      });
    }

    // Record trade in database with live execution price (/nexus parity)
    // CRITICAL: Save entry fee so NET profit can be calculated accurately
    const idempotencyKey = `direct_${botInstanceId}_${pair}_${side}_${Date.now()}`;
    const recordResult = await query<{ id: string }>(
      `INSERT INTO trades (id, bot_instance_id, pair, side, price, amount, entry_price, quantity,
                          entry_time, status, idempotency_key, stop_loss, take_profit, trading_mode, fee)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [botInstanceId, pair, side, executionPrice, amount, executionPrice, amount, 'open', idempotencyKey, calculatedStopLoss, calculatedTakeProfit, tradingMode, entryFee]
    );

    if (!recordResult || recordResult.length === 0) {
      console.log(`\n⚠️ IDEMPOTENCY CONFLICT: ${pair} - trade already recorded`);
      logger.warn('Trade already exists (idempotency conflict in direct execution)', {
        botId: botInstanceId,
        pair,
      });
      return { executed: false, reason: 'idempotency_conflict' };
    }

    console.log(`\n✅ TRADE RECORDED: ${pair} @ $${executionPrice.toFixed(2)} | ID: ${recordResult[0].id} | Mode: ${tradingMode.toUpperCase()}`);
    logger.info('Trade recorded (direct execution)', {
      tradeId: recordResult[0].id,
      orderId,
      pair,
      side,
      amount,
      executionPrice,
      signalPrice: plan.price,
      tradingMode,
    });

    return { executed: true, tradeId: recordResult[0].id };
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
