import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { tradingConfig } from '@/config/environment';
import { getCached, setCached, deleteCached, invalidateTradesCache } from '@/lib/redis';
import { checkActionAllowed } from '@/services/billing/subscription';
import { sendBotCreatedEmail } from '@/services/email/triggers';

/**
 * GET /api/bots
 * Get all bots for the current user
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    interface BotRow {
      id: string;
      exchange: string;
      enabledPairs: string[];
      status: string;
      createdAt: string;
      config: Record<string, unknown>;
    }

    interface MappedBot {
      id: string;
      exchange: string;
      enabledPairs: string[];
      tradingMode: 'paper' | 'live';
      isActive: boolean;
      createdAt: string;
      totalTrades: number;
      profitLoss: number;
      initialCapital: number; // 0 = unlimited (uses real exchange balance)
      name: string;
      config: Record<string, unknown>;
    }

    // Check cache first (TTL: 10 seconds)
    const cacheKey = `bots:user:${session.user.id}`;
    const cachedBots = await getCached<MappedBot[]>(cacheKey);
    if (cachedBots) {
      return NextResponse.json(cachedBots);
    }

    const bots = await query<BotRow>(
      `SELECT
        id,
        exchange,
        enabled_pairs as "enabledPairs",
        status,
        created_at as "createdAt",
        config
      FROM bot_instances
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [session.user.id]
    );

    // Get actual trade counts and profit/loss from database for each bot
    const botIds = bots.map(b => b.id);
    let tradeCounts: Record<string, number> = {};
    let botProfitLoss: Record<string, number> = {};

    if (botIds.length > 0) {
      // Get trade counts
      const tradeCountResults = await query<{ bot_instance_id: string; count: number }>(
        `SELECT bot_instance_id, COUNT(*) as count
         FROM trades
         WHERE bot_instance_id = ANY($1)
         GROUP BY bot_instance_id`,
        [botIds]
      );

      tradeCountResults.forEach(result => {
        tradeCounts[result.bot_instance_id] = result.count;
      });

      // Get total profit/loss from closed trades
      const profitLossResults = await query<{ bot_instance_id: string; total_profit: string }>(
        `SELECT bot_instance_id, COALESCE(SUM(profit_loss), 0) as total_profit
         FROM trades
         WHERE bot_instance_id = ANY($1) AND status = 'closed'
         GROUP BY bot_instance_id`,
        [botIds]
      );

      profitLossResults.forEach(result => {
        botProfitLoss[result.bot_instance_id] = parseFloat(result.total_profit) || 0;
      });
    }

    // Map bot data and add calculated fields
    const mappedBots = bots.map((bot) => {
      const config = bot.config || {};
      const capital = config.initialCapital;
      // Normalize to numeric-only: 0 = unlimited capital (fetches real balance)
      // Otherwise, use provided number or fallback to 1000
      const isUnlimitedCapital = typeof capital === 'string' && capital.toLowerCase() === 'unlimited';
      const initialCapital = isUnlimitedCapital ? 0 : (typeof capital === 'number' ? capital : (capital ? parseInt(String(capital), 10) : 1000));

      return {
        id: bot.id,
        exchange: bot.exchange,
        enabledPairs: bot.enabledPairs || [],
        name: (config.name as string) || `${bot.exchange} Trading Bot`,
        tradingMode: (config.tradingMode as 'paper' | 'live' | undefined) || 'paper',
        isActive: bot.status === 'running',
        createdAt: bot.createdAt,
        totalTrades: tradeCounts[bot.id] || 0,
        profitLoss: botProfitLoss[bot.id] ?? 0,
        initialCapital,
        config,
      };
    });

    // Cache result (10 second TTL)
    await setCached(cacheKey, mappedBots, 10);

    logger.info('Fetched bots for user', {
      userId: session.user.id,
      botCount: mappedBots.length,
      cached: false,
    });

    return NextResponse.json(mappedBots);
  } catch (error) {
    logger.error('Error fetching bots', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to fetch bots' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bots
 * Create a new trading bot
 */

const createBotSchema = z.object({
  exchange: z.enum(['kraken', 'binance']),
  enabledPairs: z.array(z.string()).min(1, 'At least one pair is required'),
  initialCapital: z.number().min(100, 'Minimum capital is $100'),
  tradingMode: z.enum(['paper', 'live']).default('paper'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validation = createBotSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { exchange, enabledPairs, initialCapital, tradingMode } = validation.data;

    // Check if user is admin (admins can create multiple bots for testing)
    const userRole = (session.user as any).role ?? 'user';
    const isAdmin = userRole === 'admin';

    // Check if user has API keys connected for the selected exchange
    const apiKeysExist = await query(
      `SELECT id FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2 LIMIT 1`,
      [session.user.id, exchange]
    );

    if (apiKeysExist.length === 0) {
      logger.warn('Bot creation attempted without API keys', {
        userId: session.user.id,
        exchange,
      });
      return NextResponse.json(
        {
          error: `No ${exchange.toUpperCase()} API keys found. Please connect your ${exchange.toUpperCase()} account in Settings before creating a bot.`,
          code: 'NO_API_KEYS',
        },
        { status: 400 }
      );
    }

    // PROFITABILITY CONSTRAINT: Validate pairs are BTC/ETH only
    const pairValidation = tradingConfig.validatePairs(enabledPairs);
    if (!pairValidation.valid) {
      logger.warn('Invalid pairs attempted', {
        userId: session.user.id,
        invalidPairs: pairValidation.invalid,
        allowedBaseAssets: ['BTC', 'ETH'],
      });
      return NextResponse.json(
        {
          error: `Invalid trading pairs. Only BTC and ETH pairs are supported for profitability. Invalid: ${pairValidation.invalid.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Check plan limits for trading pairs (skip for admins)
    if (!isAdmin) {
      const actionCheck = await checkActionAllowed(session.user.id, 'addPair');
      if (actionCheck.limit && enabledPairs.length > actionCheck.limit) {
        logger.warn('Plan limit exceeded on bot creation', {
          userId: session.user.id,
          requestedPairs: enabledPairs.length,
          planLimit: actionCheck.limit,
        });
        return NextResponse.json(
          {
            error: actionCheck.reason || `Your plan allows a maximum of ${actionCheck.limit} trading pairs`,
            code: 'PLAN_LIMIT_EXCEEDED',
            limit: actionCheck.limit,
            requested: enabledPairs.length,
          },
          { status: 403 }
        );
      }
    }

    // Check if user already has a bot (per CLAUDE.md: "nexusmeme allows one bot per user")
    // EXCEPTION: Admins can create multiple bots for testing
    const existingBot = await query(
      `SELECT id FROM bot_instances WHERE user_id = $1`,
      [session.user.id]
    );

    if (existingBot.length > 0 && !isAdmin) {
      return NextResponse.json(
        {
          error: 'You can only have one bot. Please delete the existing bot first.',
          code: 'BOT_EXISTS',
          existingBotId: existingBot[0].id,
        },
        { status: 409 }
      );
    }

    // Log admin bot creation for audit
    if (isAdmin && existingBot.length > 0) {
      logger.info('Admin creating multiple bots (bypass one-bot limit)', {
        userId: session.user.id,
        existingBotCount: existingBot.length,
        tradingMode,
      });
    }

    // Create new bot in transaction
    const result = await transaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO bot_instances (
          user_id,
          exchange,
          enabled_pairs,
          trading_pairs,
          status,
          config
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, config`,
        [
          session.user.id,
          exchange,
          enabledPairs,
          enabledPairs,
          'stopped',
          JSON.stringify({
            initialCapital,
            createdAt: new Date().toISOString(),
            totalTrades: 0,
            profitLoss: 0,
            tradingMode,
            // ===== EXIT & PROFIT MANAGEMENT =====
            // Profit targets (dynamic based on regime)
            profitTargetConservative: 0.02,  // 2% - weak trends
            profitTargetModerate: 0.05,      // 5% - moderate trends
            profitTargetAggressive: 0.12,    // 12% - strong trends
            // Thresholds for switching between profit targets
            profitTargetModerateThreshold: 0.03,  // Switch to moderate at 3% profit
            profitTargetAggressiveThreshold: 0.08, // Switch to aggressive at 8% profit
            // Exit thresholds (HYBRID: aggressive loss minimization)
            maxHoldHours: 336,               // 14 days max hold
            emergencyLossLimit: -0.06,       // -6% emergency exit (safety net)
            underwaterExitThresholdPct: -0.005,  // -0.5% underwater threshold (hybrid: more aggressive than /nexus)
            underwaterExitMinTimeMinutes: 15,    // 15 minutes minimum (parity with /nexus)
            // ===== RISK MANAGEMENT (5-STAGE FILTER) =====
            minADXForEntry: 20,              // Chop detection threshold
            btcDumpThreshold1h: -0.015,      // BTC dump protection for alts
            volumeSpikeMax: 3.0,             // Volume panic threshold (3x normal)
            spreadMaxPercent: 0.005,         // Max spread tolerance
            priceTopThreshold: 0.995,        // Don't buy at local tops (>99.5% of recent high)
            rsiExtremeOverbought: 85,        // RSI overbought threshold
            minMomentum1h: 0.005,            // Minimum 1h momentum for entry
            minMomentum4h: 0.005,            // Minimum 4h momentum for entry
            volumeBreakoutRatio: 1.3,        // Volume breakout threshold
            aiMinConfidence: 70,             // AI confidence threshold for entry
            profitTargetMinimum: 0.005,      // Minimum profit target (0.5%)
          }),
        ]
      );

      return insertResult.rows[0];
    });

    logger.info('Created new bot', {
      userId: session.user.id,
      botId: result.id,
      exchange,
      tradingMode,
      pairCount: enabledPairs.length,
    });

    // Send bot created email notification
    try {
      const userResult = await query(
        `SELECT email, name FROM users WHERE id = $1`,
        [session.user.id]
      );
      if (userResult.length > 0) {
        const user = userResult[0];
        const botName = `${exchange.toUpperCase()} ${tradingMode === 'live' ? 'Live' : 'Paper'} Trading Bot`;
        const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/bots/${result.id}`;
        await sendBotCreatedEmail(
          user.email,
          user.name || 'Trader',
          botName,
          'AI-Powered Strategy',
          exchange,
          dashboardUrl
        );
      }
    } catch (emailError) {
      logger.warn('Failed to send bot created email', {
        userId: session.user.id,
        botId: result.id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      // Don't fail bot creation if email fails
    }

    // Invalidate bots cache
    await deleteCached(`bots:user:${session.user.id}`);

    return NextResponse.json(
      {
        id: result.id,
        exchange,
        enabledPairs,
        tradingMode,
        isActive: false,
        createdAt: result.created_at,
        message: `Bot created successfully in ${tradingMode} mode`,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error('Error creating bot', error instanceof Error ? error : null);
    console.error('Bot creation error:', { message: errorMessage, stack: errorStack });
    return NextResponse.json(
      {
        error: 'Failed to create bot',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bots
 * Update a bot (e.g., trading pairs, trading mode, status)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { botId, enabledPairs, tradingMode, status, name, initialCapital, exchange } = body;

    if (!botId) {
      return NextResponse.json({ error: 'Bot ID required' }, { status: 400 });
    }

    // Verify the bot belongs to the user
    const bot = await query(
      `SELECT id, config FROM bot_instances WHERE id = $1 AND user_id = $2`,
      [botId, session.user.id]
    );

    if (bot.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Build the update query dynamically based on what's being updated
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (enabledPairs !== undefined) {
      if (!Array.isArray(enabledPairs) || enabledPairs.length === 0) {
        return NextResponse.json(
          { error: 'At least one trading pair is required' },
          { status: 400 }
        );
      }

      // Validate pairs
      const pairValidation = tradingConfig.validatePairs(enabledPairs);
      if (!pairValidation.valid) {
        return NextResponse.json(
          {
            error: `Invalid trading pairs. Only BTC and ETH pairs are supported. Invalid: ${pairValidation.invalid.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Check plan limits for trading pairs
      const actionCheck = await checkActionAllowed(session.user.id, 'addPair');
      if (actionCheck.limit && enabledPairs.length > actionCheck.limit) {
        logger.warn('Plan limit exceeded on pair update', {
          userId: session.user.id,
          botId,
          requestedPairs: enabledPairs.length,
          planLimit: actionCheck.limit,
        });
        return NextResponse.json(
          {
            error: actionCheck.reason || `Your plan allows a maximum of ${actionCheck.limit} trading pairs`,
            code: 'PLAN_LIMIT_EXCEEDED',
            limit: actionCheck.limit,
            requested: enabledPairs.length,
          },
          { status: 403 }
        );
      }

      updates.push(`enabled_pairs = $${paramCount}`);
      params.push(enabledPairs);
      paramCount++;

      updates.push(`trading_pairs = $${paramCount}`);
      params.push(enabledPairs);
      paramCount++;
    }

    if (tradingMode !== undefined) {
      if (!['paper', 'live'].includes(tradingMode)) {
        return NextResponse.json(
          { error: 'Invalid trading mode. Must be "paper" or "live"' },
          { status: 400 }
        );
      }

      const currentConfig = bot[0].config || {};
      const currentTradingMode = currentConfig.tradingMode || 'paper';

      // BLOCK: Switching from LIVE to PAPER is not allowed (one-way progression)
      // Paper trading is only available during the free trial. After upgrading to live,
      // users cannot switch back to avoid performance fees.
      if (currentTradingMode === 'live' && tradingMode === 'paper') {
        logger.warn('Live to paper switch blocked - not allowed after trial', {
          userId: session.user.id,
          botId,
        });

        return NextResponse.json(
          {
            error: 'Cannot switch back to paper trading. Paper trading is only available during the free trial. Live trading is required after your trial ends.',
            code: 'LIVE_TO_PAPER_BLOCKED',
          },
          { status: 403 }
        );
      }

      // Paper to live switch is always allowed (user opting into fees)
      if (currentTradingMode === 'paper' && tradingMode === 'live') {
        logger.info('Paper to live switch - user opting into performance fees', {
          userId: session.user.id,
          botId,
        });
      }

      // Update config with new trading mode
      const config = bot[0].config || {};
      config.tradingMode = tradingMode;

      updates.push(`config = $${paramCount}`);
      params.push(JSON.stringify(config));
      paramCount++;
    }

    if (status !== undefined) {
      if (!['running', 'stopped', 'paused'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be "running", "stopped", or "paused"' },
          { status: 400 }
        );
      }

      // Check subscription status before allowing bot to start
      if (status === 'running') {
        // Get bot's trading mode - paper trading bypasses payment requirements
        const botConfig = bot[0].config || {};
        const botTradingMode = (botConfig.tradingMode as 'paper' | 'live') || 'paper';

        const startCheck = await checkActionAllowed(session.user.id, 'startBot', {
          tradingMode: botTradingMode,
        });

        if (!startCheck.allowed) {
          logger.warn('Bot start blocked - subscription issue', {
            userId: session.user.id,
            botId,
            tradingMode: botTradingMode,
            reason: startCheck.reason,
            requiresPaymentMethod: startCheck.requiresPaymentMethod,
          });
          return NextResponse.json(
            {
              error: startCheck.reason || 'Cannot start bot - subscription issue',
              code: startCheck.requiresPaymentMethod ? 'PAYMENT_REQUIRED' : 'SUBSCRIPTION_INACTIVE',
              requiresPaymentMethod: startCheck.requiresPaymentMethod,
            },
            { status: 403 }
          );
        }

        // Log if paper trading is being used
        if (startCheck.isPaperTrading) {
          logger.info('Paper trading bot started - no payment required', {
            userId: session.user.id,
            botId,
          });
        }
      }

      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (name !== undefined || initialCapital !== undefined) {
      const config = bot[0].config || {};

      if (name !== undefined) {
        if (!name.trim()) {
          return NextResponse.json(
            { error: 'Bot name cannot be empty' },
            { status: 400 }
          );
        }
        config.name = name.trim();
      }

      if (initialCapital !== undefined) {
        // Normalize to numeric-only: 0 = unlimited (uses real exchange balance)
        const isUnlimitedCapital = typeof initialCapital === 'string' && initialCapital.toLowerCase() === 'unlimited';
        if (isUnlimitedCapital) {
          config.initialCapital = 0; // 0 represents unlimited
        } else {
          const capital = parseFloat(String(initialCapital));
          if (isNaN(capital) || (capital < 100 && capital !== 0)) {
            return NextResponse.json(
              { error: 'Initial capital must be at least 100 (or 0 for unlimited)' },
              { status: 400 }
            );
          }
          config.initialCapital = capital;
        }
      }

      updates.push(`config = $${paramCount}`);
      params.push(JSON.stringify(config));
      paramCount++;
    }

    if (exchange !== undefined) {
      const validExchanges = ['binance', 'kraken', 'coinbase'];
      if (!validExchanges.includes(exchange.toLowerCase())) {
        return NextResponse.json(
          { error: `Invalid exchange. Must be one of: ${validExchanges.join(', ')}` },
          { status: 400 }
        );
      }

      // Verify user has API keys for target exchange
      const keysCheck = await query(
        `SELECT id FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2`,
        [session.user.id, exchange.toLowerCase()]
      );

      if (keysCheck.length === 0) {
        return NextResponse.json(
          { error: `No ${exchange.toUpperCase()} API keys found. Connect your ${exchange.toUpperCase()} account in Settings first.` },
          { status: 400 }
        );
      }

      updates.push(`exchange = $${paramCount}`);
      params.push(exchange.toLowerCase());
      paramCount++;

      logger.info('Switching bot exchange', {
        userId: session.user.id,
        botId,
        newExchange: exchange.toLowerCase(),
      });
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Add botId and userId to the params
    params.push(botId);
    params.push(session.user.id);

    // Update the bot
    const result = await transaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE bot_instances
         SET ${updates.join(', ')}
         WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
         RETURNING id, config, enabled_pairs, status`,
        params
      );

      return updateResult.rows[0];
    });

    logger.info('Updated bot', {
      userId: session.user.id,
      botId,
      updates: {
        enabledPairs: enabledPairs ? enabledPairs.length : undefined,
        tradingMode,
        status,
      },
    });

    // Invalidate bots cache
    await deleteCached(`bots:user:${session.user.id}`);
    // Invalidate all trades cache for this bot (covers all limit values and all-bots variants)
    await invalidateTradesCache(session.user.id, botId);

    return NextResponse.json({
      message: 'Bot updated successfully',
      bot: {
        id: result.id,
        enabledPairs: result.enabled_pairs,
        tradingMode: result.config?.tradingMode || 'paper',
        status: result.status,
      },
    });
  } catch (error) {
    logger.error('Error updating bot', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to update bot' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bots
 * Delete a bot by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('id');

    if (!botId) {
      return NextResponse.json({ error: 'Bot ID required' }, { status: 400 });
    }

    // Verify the bot belongs to the user
    const bot = await query(
      `SELECT id FROM bot_instances WHERE id = $1 AND user_id = $2`,
      [botId, session.user.id]
    );

    if (bot.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Delete the bot
    await transaction(async (client) => {
      await client.query(
        `DELETE FROM bot_instances WHERE id = $1 AND user_id = $2`,
        [botId, session.user.id]
      );
    });

    logger.info('Deleted bot', {
      userId: session.user.id,
      botId,
    });

    // Invalidate bots cache
    await deleteCached(`bots:user:${session.user.id}`);
    // Invalidate all trades cache for this bot (covers all limit values and all-bots variants)
    await invalidateTradesCache(session.user.id, botId);

    return NextResponse.json({ message: 'Bot deleted successfully' });
  } catch (error) {
    logger.error('Error deleting bot', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to delete bot' },
      { status: 500 }
    );
  }
}
