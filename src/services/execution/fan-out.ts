import { query, transaction } from '@/lib/db';
import { logger, logTradeExecution } from '@/lib/logger';
import { sendTradeAlertEmail, sendLowBalanceEmail } from '@/services/email/triggers';
import type { TradeDecision, ExecutionPlan } from '@/types/market';
import DynamicPositionSizer from '@/services/trading/dynamic-position-sizer';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { getEnvironmentConfig } from '@/config/environment';
import { getExchangeFeeRates, getCachedTakerFee } from '@/services/billing/fee-rate';
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
// Per-bot low balance email cooldown — at most once per 24h
const lowBalanceAlertSentAt = new Map<string, number>();
const LOW_BALANCE_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
    // Stage 1: Health Gate (momentum gate)
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

    // Check if bot already has an open position on this BASE asset (BTC, ETH, etc.)
    // Match on base currency only — BTC/USD, BTC/USDT, BTC/USDC all count as "BTC position"
    const baseAsset = decision.pair.split('/')[0];
    const existingPosition = await query<{ id: string; pair: string }>(
      `SELECT id, pair FROM trades
       WHERE bot_instance_id = $1
       AND pair LIKE $2
       AND status = 'open'
       LIMIT 1`,
      [bot.id, `${baseAsset}/%`]
    );

    if (existingPosition.length > 0) {
      logger.info('Skipping trade: bot already has open position on base asset', {
        botId: bot.id,
        baseAsset,
        existingPair: existingPosition[0].pair,
        signalPair: decision.pair,
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
    let totalFreeStable = 0; // Total free stablecoins across all quote currencies
    let dominantQuote = 'USDT'; // Default — overridden when we fetch real balance

    // UNLIMITED MODE: 0 or "unlimited" (string) means fetch real exchange balance for pyramiding
    // Backward compatible: support both new numeric 0 and legacy "unlimited" string
    const isUnlimitedMode = configuredCapital === 0 || (typeof configuredCapital === 'string' && configuredCapital.toLowerCase() === 'unlimited');

    if (isUnlimitedMode) {
      // Paper mode: never touch the exchange API — unlimited capital bots simulate with a large fixed balance.
      if ((bot.config?.tradingMode as string) !== 'live') {
        effectiveBalance = 100000; // Simulated unlimited balance for paper trading
        logger.debug('Unlimited paper bot using simulated balance', { botId: bot.id });
      } else
      try {
        // Live mode only: fetch real balance from exchange
        const [result, openTradesResultUnlimited] = await Promise.all([
          this.fetchRealExchangeBalance(bot.id, bot.user_id, bot.exchange),
          query<{ total_value: string }>(
            `SELECT COALESCE(SUM(price * amount), 0) AS total_value
             FROM trades WHERE bot_instance_id = $1 AND status = 'open'`,
            [bot.id]
          ),
        ]);

        if (result.available <= 0) {
          logger.error('Failed to fetch unlimited balance - got zero or negative', null, {
            botId: bot.id,
            exchange: bot.exchange,
            balance: result.available,
          });
          return null;
        }

        const openTradesValueUnlimited = parseFloat(String(openTradesResultUnlimited[0]?.total_value ?? '0'));
        const freeAfterOpenUnlimited = Math.max(0, result.available - openTradesValueUnlimited);
        effectiveBalance = freeAfterOpenUnlimited * 0.95;
        totalFreeStable = result.totalFreeStable;
        dominantQuote = result.dominantQuote;
        logger.info('Using unlimited capital with 95% buffer', {
          botId: bot.id,
          realBalance: result.available,
          openTradesValue: openTradesValueUnlimited,
          bufferedBalance: effectiveBalance,
          dominantQuote,
          mode: typeof configuredCapital === 'string' ? 'legacy-string' : 'numeric-0',
        });
      } catch (error) {
        logger.error('Error fetching unlimited exchange balance', error instanceof Error ? error : null, {
          botId: bot.id,
          exchange: bot.exchange,
        });
        return null;
      }
    } else if (typeof configuredCapital === 'number' && configuredCapital > 0 && Number.isFinite(configuredCapital)) {
      // FIXED CAPITAL MODE: Cap to real free balance so we never over-order
      const configured = Number(configuredCapital);
      const isLive = (bot.config?.tradingMode as string) === 'live';

      if (!isLive) {
        // Paper mode: never call the exchange API — use configured capital directly.
        // Paper trades are simulated; touching the real exchange account is outside our authority.
        // Safety net: silently cap trial users to TRIAL_MAX_CAPITAL even if DB allows more.
        const trialCapResult = await query<{ plan_tier: string }>(
          `SELECT plan_tier FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [bot.user_id]
        );
        const planTier = trialCapResult[0]?.plan_tier ?? 'live_trial';
        const trialMax = getEnvironmentConfig().TRIAL_MAX_CAPITAL;
        if (planTier === 'live_trial' && configured > trialMax) {
          logger.warn('Trial user capital capped at TRIAL_MAX_CAPITAL', {
            botId: bot.id,
            userId: bot.user_id,
            configuredCapital: configured,
            trialMax,
            trialCapCapped: true,
          });
          effectiveBalance = trialMax;
        } else {
          effectiveBalance = configured;
        }
      } else {
        try {
          // Live mode only: fetch real balance to prevent over-ordering
          const [result, openTradesResult] = await Promise.all([
            this.fetchRealExchangeBalance(bot.id, bot.user_id, bot.exchange),
            query<{ total_value: string }>(
              `SELECT COALESCE(SUM(price * amount), 0) AS total_value
               FROM trades WHERE bot_instance_id = $1 AND status = 'open'`,
              [bot.id]
            ),
          ]);
          if (result.available > 0) {
            const openTradesValue = parseFloat(String(openTradesResult[0]?.total_value ?? '0'));
            const freeAfterOpenTrades = Math.max(0, result.available - openTradesValue);
            effectiveBalance = Math.min(configured, freeAfterOpenTrades * 0.95);
            totalFreeStable = result.totalFreeStable;
            dominantQuote = result.dominantQuote;
            if (effectiveBalance < configured) {
              logger.warn('Fixed capital capped to actual exchange balance (open trades deducted)', {
                botId: bot.id,
                configuredCapital: configured,
                realBalance: result.available,
                openTradesValue,
                freeAfterOpenTrades,
                effectiveBalance,
                dominantQuote,
              });
            }
          } else {
            // Live mode: real balance is 0 or unavailable — skip trade, never use configured capital.
            // Using configured capital would place orders exceeding actual funds → -2010 errors.
            logger.warn('Live trade skipped: real exchange balance is 0 or unavailable', {
              botId: bot.id,
              configuredCapital: configured,
            });
            return null;
          }
        } catch (err) {
          logger.warn('Live trade skipped: could not fetch real exchange balance', {
            botId: bot.id,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      }
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

    // Live trading: enforce minimum free cash threshold before sizing.
    // Check total stablecoins (USDT + USDC + USD) — user may hold across multiple quote assets.
    // Sizing still uses only the dominant quote; the gate just validates total liquidity.
    const isLiveMode = (bot.config?.tradingMode as string) === 'live';
    if (isLiveMode && !isUnlimitedMode) {
      const envCfg = getEnvironmentConfig();
      const minUsdt = envCfg.LIVE_TRADING_MIN_USDT_USD;
      // Use totalFreeStable when available (fetched from exchange); fall back to effectiveBalance
      const stableForMinCheck = totalFreeStable > 0 ? totalFreeStable : effectiveBalance;
      if (stableForMinCheck < minUsdt) {
        logger.warn('Live trade skipped: effective balance below minimum USDT threshold', {
          botId: bot.id,
          effectiveBalance,
          totalFreeStable,
          minUsdt,
        });
        // Email user once per 24h
        const lastSent = lowBalanceAlertSentAt.get(bot.id) ?? 0;
        if (Date.now() - lastSent > LOW_BALANCE_ALERT_COOLDOWN_MS) {
          lowBalanceAlertSentAt.set(bot.id, Date.now());
          query(
            `SELECT u.email, u.name, b.config->>'name' AS bot_name
             FROM users u JOIN bot_instances b ON b.user_id = u.id
             WHERE b.id = $1`,
            [bot.id]
          ).then(rows => {
            if (!rows.length || !rows[0].email) return;
            const { email, name, bot_name } = rows[0];
            return sendLowBalanceEmail(email, name, bot.id, bot_name || 'Trading Bot', bot.exchange, effectiveBalance, minUsdt);
          }).catch(err => logger.warn('Failed to send low balance email', { botId: bot.id, error: err instanceof Error ? err.message : String(err) }));
        }
        return null;
      }
    }

    // Initialize position sizer with actual balance (enables pyramiding via compounding)
    const positionSizer = new DynamicPositionSizer(effectiveBalance);

    // Fetch closed trade history + capital preservation in parallel (independent)
    const env = getEnvironmentConfig();
    let stopLossPct = env.DEFAULT_STOP_LOSS_PCT;
    if (decision.stopLoss && Math.abs(decision.stopLoss - decision.price) > 0.01) {
      stopLossPct = Math.abs((decision.stopLoss - decision.price) / decision.price);
    }

    const [closedTrades, botCpResult] = await Promise.allSettled([
      query<{ profit_loss: number; status: string }>(
        `SELECT profit_loss, status FROM trades
         WHERE bot_instance_id = $1 AND status = 'closed'
         ORDER BY exit_time DESC LIMIT 100`,
        [bot.id]
      ),
      capitalPreservation.evaluateBot(bot.id, effectiveBalance),
    ]);

    // Update position sizer with trade history for Kelly Criterion calibration
    if (closedTrades.status === 'fulfilled' && closedTrades.value.length > 0) {
      try {
        const trades = closedTrades.value;
        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => (Number(t.profit_loss) || 0) > 0);
        const losingTrades = trades.filter(t => (Number(t.profit_loss) || 0) < 0);
        const totalProfit = winningTrades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (Number(t.profit_loss) || 0), 0));
        positionSizer.updatePerformance(totalTrades, winningTrades.length, losingTrades.length, totalProfit, totalLoss);
        logger.debug('Position sizer updated with trade history', {
          botId: bot.id,
          totalTrades,
          winRate: `${((winningTrades.length / totalTrades) * 100).toFixed(1)}%`,
          totalProfit: `$${totalProfit.toFixed(2)}`,
        });
      } catch (error) {
        logger.warn('Failed to update position sizer with trade history', {
          botId: bot.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Calculate position size using Kelly Criterion + AI confidence
    const positionSize = positionSizer.calculatePositionSize(aiConfidence, decision.price, stopLossPct);

    // CAPITAL PRESERVATION: Per-bot Layer 2 (drawdown) + Layer 3 (loss streak)
    let cpMultiplier = decision.capitalPreservationMultiplier ?? 1.0;
    try {
      const botCp = botCpResult.status === 'fulfilled' ? botCpResult.value : await capitalPreservation.evaluateBot(bot.id, effectiveBalance);
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
    const regimeMultipliers: Record<string, number> = {
      strong: env.REGIME_SIZE_STRONG,
      moderate: env.REGIME_SIZE_MODERATE,
      weak: env.REGIME_SIZE_WEAK,
      transitioning: env.REGIME_SIZE_TRANSITIONING,
      choppy: env.REGIME_SIZE_CHOPPY,
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

    // MIN_NOTIONAL check — order value must meet exchange minimum (typically $10 on Binance)
    const orderValueUSD = quantity * decision.price;
    try {
      const adapter = getExchangeAdapter(bot.exchange);
      const minOrderUSD = await adapter.getMinOrderSize(decision.pair);
      if (orderValueUSD < minOrderUSD) {
        logger.warn('Order value below MIN_NOTIONAL, skipping trade — add funds to account', {
          botId: bot.id,
          pair: decision.pair,
          orderValueUSD: orderValueUSD.toFixed(2),
          minOrderUSD,
          effectiveBalance: effectiveBalance.toFixed(2),
        });

        // Email user once per 24h so they know trades are paused
        const lastSent = lowBalanceAlertSentAt.get(bot.id) ?? 0;
        if (Date.now() - lastSent > LOW_BALANCE_ALERT_COOLDOWN_MS) {
          lowBalanceAlertSentAt.set(bot.id, Date.now());
          query(
            `SELECT u.email, u.name, b.config->>'name' AS bot_name
             FROM users u
             JOIN bot_instances b ON b.user_id = u.id
             WHERE b.id = $1`,
            [bot.id]
          ).then(rows => {
            if (!rows.length || !rows[0].email) return;
            const { email, name, bot_name } = rows[0];
            return sendLowBalanceEmail(
              email, name, bot.id,
              bot_name || 'Trading Bot',
              bot.exchange,
              effectiveBalance,
              minOrderUSD,
            );
          }).catch(err => logger.warn('Failed to send low balance email', { botId: bot.id, error: err instanceof Error ? err.message : String(err) }));
        }

        return null;
      }
    } catch {
      // Non-critical — if we can't fetch min order size, proceed and let exchange reject if needed
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

    // Always use the configured pair as-is — BTC/USDT stays BTC/USDT.
    // USDC is reserved for performance fee payments only and must never be used for trading pairs.
    // Balance sizing uses USDT free balance; USDC balance is excluded from trading.
    const effectivePair = decision.pair;

    // Apply LOT_SIZE rounding for both paper and live — ensures paper quantities
    // match exactly what live would execute, surfacing precision errors during free trial.
    // Uses public /v3/exchangeInfo (no auth needed), cached after first call.
    let roundedQuantity = quantity;
    if (bot.exchange.toLowerCase().includes('binance')) {
      try {
        const binanceAdapter = getExchangeAdapter(bot.exchange) as any;
        if (typeof binanceAdapter.getLotStepSize === 'function') {
          const symbol = effectivePair.replace('/', '');
          const stepSize: number = await binanceAdapter.getLotStepSize(symbol);
          roundedQuantity = Math.floor(quantity / stepSize) * stepSize;
          if (roundedQuantity !== quantity) {
            logger.debug('Quantity rounded to LOT_SIZE step (paper+live parity)', {
              botId: bot.id,
              original: quantity.toFixed(8),
              rounded: roundedQuantity.toFixed(8),
              stepSize,
            });
          }
        }
      } catch {
        // Non-critical — proceed with unrounded quantity
      }
    }

    const plan: ExecutionPlan = {
      userId: bot.user_id,
      botInstanceId: bot.id,
      pair: effectivePair,
      side: decision.side,
      amount: roundedQuantity,
      price: decision.price,
      stopLoss: decision.stopLoss, // Risk management: passed from signal
      takeProfit: decision.takeProfit, // Dynamic profit target: passed from signal
      reason: decision.reason,
      timestamp: new Date(),
      entryNotes: decision.entryNotes,
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

    // DUPLICATE CHECK + BOT LOOKUP in parallel (independent queries)
    const pairBase = pair.split('/')[0];
    const [existing, botResult] = await Promise.all([
      query<{ id: string; pair: string }>(
        `SELECT id, pair FROM trades WHERE bot_instance_id = $1
         AND pair LIKE $2
         AND status = 'open'
         LIMIT 1`,
        [botInstanceId, `${pairBase}/%`]
      ),
      query<{ user_id: string; exchange: string; config: any; trading_mode: string }>(
        `SELECT user_id, exchange, config, trading_mode FROM bot_instances WHERE id = $1`,
        [botInstanceId]
      ),
    ]);

    if (existing && existing.length > 0) {
      console.log(`\n🚫 DUPLICATE BLOCKED: ${pairBase} position already exists as ${existing[0].pair} (trade: ${existing[0].id})`);
      logger.info('Skipping trade: open position already exists (direct execution)', {
        botId: botInstanceId,
        signalPair: pair,
        existingPair: existing[0].pair,
        existingTradeId: existing[0].id,
      });
      return { executed: false, reason: 'open_position_exists' };
    }

    if (!botResult || botResult.length === 0) {
      logger.error('Bot instance not found for direct execution', null, { botId: botInstanceId });
      return { executed: false, reason: 'bot_not_found' };
    }

    const bot = botResult[0];
    const exchange = bot.exchange;
    // SAFETY: Both sources must agree on 'live' before placing real orders.
    // config.tradingMode and trading_mode column can desync if a bot is reverted via DB
    // or admin tooling without updating both fields. Requiring agreement prevents accidental
    // live orders when one field lags behind the other.
    const configMode = (bot.config?.tradingMode as string) || 'paper';
    const columnMode = bot.trading_mode || 'paper';
    const tradingMode = (configMode === 'live' && columnMode === 'live') ? 'live' : 'paper';

    // CRITICAL FIX (/nexus parity): Use LIVE market price at execution time, not stale signal price
    // The AI signal's entryPrice comes from candle close (can be up to 1 hour old for 1h candles)
    // For accurate P&L tracking, we must use the current live market price
    let executionPrice = plan.price; // Fallback to signal price

    try {
      const liveMarketData = await marketDataAggregator.getMarketData([pair], exchange);
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
          const feeRate = getCachedTakerFee(exchange);
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
      // Paper trade: estimate entry fee using taker rate from admin-configured billing_settings (DB)
      // Falls back to BINANCE_TAKER_FEE_DEFAULT env var if DB unavailable
      const exchangeFeeRates = await getExchangeFeeRates('binance').catch(() => null);
      const feeRate = exchangeFeeRates?.taker_fee ?? getCachedTakerFee(exchange);
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
                          entry_time, status, idempotency_key, stop_loss, take_profit, trading_mode, fee, entry_notes)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [botInstanceId, pair, side, executionPrice, amount, executionPrice, amount, 'open', idempotencyKey, calculatedStopLoss, calculatedTakeProfit, tradingMode, entryFee, plan.entryNotes ? JSON.stringify(plan.entryNotes) : null]
    );

    if (!recordResult || recordResult.length === 0) {
      console.log(`\n⚠️ IDEMPOTENCY CONFLICT: ${pair} - trade already recorded`);
      logger.warn('Trade already exists (idempotency conflict in direct execution)', {
        botId: botInstanceId,
        pair,
      });
      // If this was a live order that actually filled, the position exists on the exchange.
      // Log the exchange order ID so it can be found and reconciled manually if needed.
      if (tradingMode === 'live' && orderId && !orderId.startsWith('paper_')) {
        logger.error('LIVE ORDER FILLED BUT DB RECORD CONFLICT — position may be orphaned on exchange', null, {
          exchangeOrderId: orderId,
          pair,
          botId: botInstanceId,
          executionPrice,
          amount,
          action: 'Check Binance order history and reconcile manually if needed',
        });
      }
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

    // Trade open notification — live trades only, respects user preference
    if (tradingMode === 'live') {
      (async () => {
        try {
          const userRows = await query<{ email: string; name: string; trade_alerts: boolean }>(
            `SELECT u.email, u.name, COALESCE(ep.trade_alerts, true) as trade_alerts
             FROM users u
             LEFT JOIN email_preferences ep ON ep.user_id = u.id
             WHERE u.id = $1`,
            [userId]
          );
          const user = userRows[0];
          if (user?.trade_alerts) {
            const botRows = await query<{ config: any }>(
              `SELECT config FROM bot_instances WHERE id = $1`,
              [botInstanceId]
            );
            const botName = botRows[0]?.config?.name || 'Trading Bot';
            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/bots/${botInstanceId}`;
            await sendTradeAlertEmail(
              user.email, user.name || 'Trader',
              botName, pair, 'BUY',
              executionPrice, amount, dashboardUrl
            );
          }
        } catch {
          // fire-and-forget — never block trade execution
        }
      })();
    }

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
  ): Promise<{ available: number; totalFreeStable: number; dominantQuote: string }> {
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
        logger.error('AES decryption failed for API keys — user must re-save keys in Settings', decryptError instanceof Error ? decryptError : null, {
          botId,
          exchange,
        });
        throw new Error('Failed to decrypt API keys — please re-save your API keys in Settings');
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

      // Tally free (unlocked) stablecoins separately — each maps to a different pair suffix
      // Global Binance: USDT (primary) or USDC (secondary, has BTC/USDC pairs)
      // Binance US: USDT or USD (both have BTC pairs)
      let freeUSDT = 0;
      let freeUSDC = 0;
      let freeUSD = 0;
      for (const balance of balances) {
        const asset = balance.asset.toUpperCase();
        if (asset === 'USDT') freeUSDT += balance.free;
        else if (asset === 'USDC') freeUSDC += balance.free;
        else if (asset === 'USD' || asset === 'ZUSD') freeUSD += balance.free;
      }

      // Determine which exchanges support USD pairs (not just USDT/USDC)
      // Binance US: BTC/USD, BTC/USDT valid
      // Global Binance (binance.com): only BTC/USDT, BTC/USDC — no USD pairs
      const apiBase = getEnvironmentConfig().BINANCE_API_BASE_URL;
      const supportsUsdPairs = apiBase.includes('binance.us');

      // Trading pairs are always USDT-quoted (BTC/USDT, ETH/USDT).
      // USDC is reserved for performance fee payments — never used for position sizing.
      // USD is used on Binance US where BTC/USD pairs exist.
      let dominantQuote: string;
      let available: number;
      if (supportsUsdPairs && freeUSD > freeUSDT) {
        // Binance US: prefer USD if it's larger (BTC/USD pairs available)
        dominantQuote = 'USD';
        available = freeUSD;
      } else {
        // Always USDT — never switch to USDC for trading
        dominantQuote = 'USDT';
        available = freeUSDT;
      }

      const totalFreeStable = freeUSDT + freeUSDC + freeUSD;

      logger.info('Fetched real exchange balance', {
        botId,
        exchange,
        freeUSDT,
        freeUSDC,
        freeUSD,
        available,
        totalFreeStable,
        dominantQuote,
      });

      return { available, totalFreeStable, dominantQuote };
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
