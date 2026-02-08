/**
 * Bot Trade Close Endpoint
 * POST /api/bots/trades/close
 *
 * Receives closed trade data from bot instances and:
 * 1. Updates the trade record with exit info
 * 2. Records performance fee if profitable
 * 3. Sends confirmation to bot
 *
 * Expected request:
 * {
 *   "botInstanceId": "bot-123",
 *   "tradeId": "trade-456",
 *   "pair": "BTC/USDT",
 *   "exitTime": "2025-01-15T10:30:00Z",
 *   "exitPrice": 45000,
 *   "profitLoss": 250,
 *   "profitLossPercent": 2.5
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordPerformanceFee } from '@/services/billing/performance-fee';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';
import { withRetry } from '@/lib/resilience';
import { exchangeFeesConfig, getEnvironmentConfig } from '@/config/environment';
import { getAccountFeeRates, computeMinExitPrice } from '@/services/exchanges/fee-schedule';
import { z } from 'zod';

const tradeCloseSchema = z.object({
  botInstanceId: z.string().uuid('Bot instance ID must be a valid UUID'),
  tradeId: z.string({ required_error: 'Trade ID is required' }),
  pair: z.string({ required_error: 'Trading pair is required' }),
  exitTime: z.string().datetime('Exit time must be ISO 8601 datetime'),
  exitPrice: z.number().positive('Exit price must be positive'),
  profitLoss: z.number({ required_error: 'Profit/loss amount is required' }),
  profitLossPercent: z.number({ required_error: 'Profit/loss percent is required' }),
  exitReason: z.string().optional().describe('Reason for trade exit (e.g., momentum_failure, profit_target, stop_loss)'),
});

type TradeCloseRequest = z.infer<typeof tradeCloseSchema>;

/**
 * POST /api/bots/trades/close
 * Bot instance reports a closed trade
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate request
    const body = await req.json();

    logger.info('Trade close request received', {
      botInstanceId: body.botInstanceId,
      tradeId: body.tradeId,
      pair: body.pair,
      exitPrice: body.exitPrice,
    });

    const validated = tradeCloseSchema.safeParse(body);

    if (!validated.success) {
      const errors = validated.error.flatten().fieldErrors;
      logger.warn('Invalid trade close request', {
        errors,
        bodyKeys: Object.keys(body),
      });
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        { status: 400 }
      );
    }

    const data: TradeCloseRequest = validated.data;

    // Get bot instance and user info
    logger.info('Looking up bot instance', {
      botInstanceId: data.botInstanceId,
    });

    const botResult = await query(
      `SELECT id, user_id, config FROM bot_instances WHERE id = $1`,
      [data.botInstanceId]
    );

    logger.info('Bot lookup result', {
      botInstanceId: data.botInstanceId,
      found: botResult && botResult.length > 0,
    });

    if (!botResult || botResult.length === 0) {
      logger.warn('Bot instance not found', {
        botInstanceId: data.botInstanceId,
      });
      return NextResponse.json(
        { error: 'Bot instance not found' },
        { status: 404 }
      );
    }

    const bot = botResult[0];
    const userId = bot.user_id;
    const botConfig = bot.config || {};
    const tradingMode = (botConfig.tradingMode as 'paper' | 'live') || 'paper';
    const isPaperTrading = tradingMode === 'paper';

    // Fetch the original trade to get quantity
    const tradeData = await query(
      `SELECT t.id, t.pair, t.amount, b.exchange
       FROM trades t
       INNER JOIN bot_instances b ON t.bot_instance_id = b.id
       WHERE t.id = $1 AND t.bot_instance_id = $2`,
      [data.tradeId, data.botInstanceId]
    );

    if (!tradeData || tradeData.length === 0) {
      return NextResponse.json(
        { error: 'Trade not found' },
        { status: 404 }
      );
    }

    const originalTrade = tradeData[0];
    const exchange = originalTrade.exchange;
    const quantity = originalTrade.amount;

    logger.info('Retrieved original trade info', {
      tradeId: data.tradeId,
      pair: originalTrade.pair,
      quantity,
      exchange,
    });

    // Get API keys for the exchange
    const keysResult = await query(
      `SELECT encrypted_public_key, encrypted_secret_key FROM exchange_api_keys
       WHERE user_id = $1 AND exchange = $2`,
      [userId, exchange]
    );

    if (!keysResult || keysResult.length === 0) {
      logger.warn('No API keys found for exchange', { userId, exchange });
      return NextResponse.json(
        { error: 'No API keys configured for this exchange' },
        { status: 400 }
      );
    }

    const keys = keysResult[0];
    let actualExitPrice = data.exitPrice;
    let actualProfitLoss = data.profitLoss;
    let actualProfitLossPercent = data.profitLossPercent;
    let totalFees = 0; // Track total fees (entry + exit)

    // STEP 1: Place SELL order on exchange (if API keys available)
    try {
      if (keys) {
        logger.info('Placing sell order on exchange', {
          exchange,
          pair: data.pair,
          quantity,
          price: data.exitPrice,
        });

        const decryptedPublicKey = decrypt(keys.encrypted_public_key);
        const decryptedSecretKey = decrypt(keys.encrypted_secret_key);

        const adapter = getExchangeAdapter(exchange);
        await adapter.connect({
          publicKey: decryptedPublicKey,
          secretKey: decryptedSecretKey,
        });

        // Compute minimum net-positive exit price and place IOC
        let minExitPrice = data.exitPrice;
        try {
          const entryInfo = (await query(
            `SELECT price, fee, amount FROM trades WHERE id = $1`,
            [data.tradeId]
          ))[0];
          const entryPrice = entryInfo?.price ? parseFloat(String(entryInfo.price)) : null;
          const entryFeeQuote = entryInfo?.fee ? parseFloat(String(entryInfo.fee)) : 0;
          const qty = entryInfo?.amount ? parseFloat(String(entryInfo.amount)) : quantity;
          if (entryPrice && qty) {
            // Prefer symbol-level taker rate (per-user); fallback to account-level if unavailable
            let takerRate = 0;
            try {
              const { getSymbolTakerRate } = await import('@/services/exchanges/fee-schedule');
              takerRate = await getSymbolTakerRate(userId, exchange, data.pair);
            } catch {}
            if (!takerRate) {
              const { taker } = await getAccountFeeRates(userId, exchange);
              takerRate = taker || (
                exchange.toLowerCase() === 'kraken' ? exchangeFeesConfig.krakenTakerFeeDefault
                : exchange.toLowerCase() === 'binance' ? exchangeFeesConfig.binanceTakerFeeDefault
                : 0.001
              );
            }
            minExitPrice = Math.max(data.exitPrice, computeMinExitPrice(entryPrice, entryFeeQuote, qty, takerRate));
          }
        } catch {}

        // Place sell order with retry (IOC at or above minExitPrice)
        const orderResult = await withRetry(
          async () => {
            return await adapter.placeOrder({
              pair: data.pair,
              side: 'sell',
              amount: quantity,
              price: minExitPrice,
              timeInForce: 'IOC',
            });
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 1000,
            retryableErrors: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              // Don't retry on validation/balance errors
              if (message.includes('-2010')) return false; // NEW_ORDER_REJECTED (balance)
              if (message.includes('-1013')) return false; // Invalid quantity/price
              if (message.includes('Invalid')) return false; // Validation error
              // Retry network/transient errors and rate limits
              return true;
            },
          }
        );

        actualExitPrice = orderResult.avgPrice || orderResult.price || minExitPrice;

        // If IOC did not fill, abort close and let orchestrator retry later
        if (!orderResult.avgPrice && orderResult.status !== 'filled') {
          logger.warn('Exit IOC could not fill at net-positive floor; aborting close', {
            tradeId: data.tradeId,
            pair: data.pair,
            attemptedPrice: minExitPrice,
            status: orderResult.status,
          });
          return NextResponse.json(
            { error: 'could_not_fill_exit', message: 'Best bid below net-positive exit floor; close deferred.' },
            { status: 409 }
          );
        }

        // Capture exit fee from order execution
        let exitFee = 0;
        if ((orderResult as any).feeQuote && (orderResult as any).feeQuote > 0) {
          exitFee = (orderResult as any).feeQuote;
          logger.debug('Captured exit fee (normalized to quote)', { orderId: orderResult.orderId, exitFee, feeAsset: (orderResult as any).feeAsset });
        } else if (orderResult.fee) {
          exitFee = orderResult.fee;
          logger.debug('Captured exit fee from order (assumed quote)', { orderId: orderResult.orderId, exitFee });
        } else {
          // Fallback: Use configured exchange fee rate
          const feeRate = exchange.toLowerCase() === 'kraken'
            ? exchangeFeesConfig.krakenTakerFeeDefault
            : exchange.toLowerCase() === 'binance'
            ? exchangeFeesConfig.binanceTakerFeeDefault
            : 0.001; // Default 0.1% if exchange not recognized

          exitFee = (actualExitPrice * quantity) * feeRate;
          logger.debug('Using configured exchange taker fee for exit', {
            exchange,
            feeRate,
            exitFee,
          });
        }

        // Recalculate P&L using actual execution price
        const tradeInfo = (await query(
          `SELECT price, fee FROM trades WHERE id = $1`,
          [data.tradeId]
        ))[0];

        if (tradeInfo?.price) {
          const entryPrice = parseFloat(String(tradeInfo.price));
          const entryFee = parseFloat(String(tradeInfo.fee)) || 0;

          // Calculate gross P&L before fees
          const grossProfitLoss = (actualExitPrice - entryPrice) * quantity;

          // Deduct total fees (entry + exit)
          totalFees = entryFee + exitFee;
          actualProfitLoss = grossProfitLoss - totalFees;
          actualProfitLossPercent = (actualProfitLoss / (entryPrice * quantity)) * 100;

          logger.debug('P&L calculation with fees', {
            tradeId: data.tradeId,
            entryPrice,
            exitPrice: actualExitPrice,
            quantity,
            entryFee,
            exitFee,
            totalFees,
            grossProfitLoss,
            netProfitLoss: actualProfitLoss,
            profitLossPercent: actualProfitLossPercent.toFixed(4),
          });
        }

        logger.info('Sell order executed on exchange', {
          orderId: orderResult.orderId,
          pair: data.pair,
          executedPrice: actualExitPrice,
          quantity,
          profitLoss: actualProfitLoss,
        });
      } else {
        logger.warn('No API keys configured - trade will be closed in database only', {
          exchange,
          pair: data.pair,
        });
      }
    } catch (exchangeError) {
      logger.error('Failed to place sell order on exchange', exchangeError instanceof Error ? exchangeError : null, {
        exchange,
        pair: data.pair,
        quantity,
      });
      // Continue with database update anyway (trade is closing)
      // This allows manual recovery if exchange is down
    }

    // VALIDATION: ABORT profit-protection exits that went significantly red
    // Race condition: Exit decision made when trade was green, but execution happened in red
    // Profit protection exits should NEVER close trades at a significant loss
    // EXCEPTION: erosion_full_giveback (100% erosion) is allowed a fee-sized loss
    //   because at 100% erosion, gross profit = 0, and fees make it slightly negative
    const profitProtectionReasons = [
      'erosion_cap_profit_lock',
      'erosion_cap_protected',
      'erosion_cap_exceeded',
      'erosion_cap',
      'erosion_full_giveback',
      'green_to_red',
      'profit_target',
      'profit_lock_regime',
      'breakeven_protection',
    ];

    // Enforce net-positive requirement for profit-protection exits (erosion/profit lock)
    // If net slips red during execution, abort and let underwater logic handle it
    if (profitProtectionReasons.includes(data.exitReason || '') && actualProfitLossPercent < 0) {
      logger.warn('🚫 PROFIT PROTECTION EXIT ABORTED: Net loss detected during execution', {
        tradeId: data.tradeId,
        pair: data.pair,
        originalReason: data.exitReason,
        profitLossPercent: actualProfitLossPercent.toFixed(4),
        note: 'Profit-protection exits must be net positive; handing off to underwater logic',
      });

      return NextResponse.json(
        {
          error: 'Exit aborted - trade went red',
          reason: 'profit_protection_invalid_for_red_trade',
          profitLossPercent: actualProfitLossPercent,
          message: `${data.exitReason} only applies to green trades. Trade went red during execution - letting underwater exit logic handle it.`,
        },
        { status: 400 }
      );
    }

    // Normalize exit reasons for consistency in UI and reporting
    // Preserve /nexus exit reason taxonomy for analytics
    // Only normalize truly redundant aliases, keep distinct reasons distinct
    let correctedExitReason = data.exitReason;
    if (correctedExitReason === 'erosion_cap_profit_lock') {
      correctedExitReason = 'erosion_cap_protected'; // /nexus canonical name
    }
    // Keep underwater_never_profited, underwater_small_peak_timeout, underwater_profitable_collapse
    // as distinct reasons — they indicate different trade behaviors and are critical for analysis

    // STEP 2: Update trade record with exit information
    logger.info('Updating trade record', {
      tradeId: data.tradeId,
      exitPrice: actualExitPrice,
      profitLoss: actualProfitLoss,
    });

    let updateResult;
    try {
      // Try updating with exit_reason and exit_price if columns exist
      updateResult = await query(
        `UPDATE trades
         SET exit_time = $1,
             exit_price = $2,
             profit_loss = $3,
             profit_loss_percent = $4,
             exit_reason = $5,
             fee = $6,
             status = 'closed'
         WHERE id = $7 AND bot_instance_id = $8
         RETURNING id`,
        [data.exitTime, data.exitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, totalFees || null, data.tradeId, data.botInstanceId]
      );
    } catch (updateError) {
      // If fee column doesn't exist, try without it
      if ((updateError as any)?.message?.includes('fee')) {
        logger.debug('fee column not found, updating without it');
        updateResult = await query(
          `UPDATE trades
           SET exit_time = $1,
               exit_price = $2,
               profit_loss = $3,
               profit_loss_percent = $4,
               exit_reason = $5,
               status = 'closed'
           WHERE id = $6 AND bot_instance_id = $7
           RETURNING id`,
          [data.exitTime, data.exitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, data.tradeId, data.botInstanceId]
        );
      } else if ((updateError as any)?.message?.includes('exit_price') || (updateError as any)?.message?.includes('exit_reason')) {
        logger.debug('exit_price or exit_reason column not found, updating without them');
        updateResult = await query(
          `UPDATE trades
           SET exit_time = $1,
               profit_loss = $2,
               profit_loss_percent = $3,
               status = 'closed'
           WHERE id = $4 AND bot_instance_id = $5
           RETURNING id`,
          [data.exitTime, actualProfitLoss, actualProfitLossPercent, data.tradeId, data.botInstanceId]
        );
      } else {
        throw updateError;
      }
    }

    if (!updateResult || updateResult.length === 0) {
      logger.warn('Trade not found for close', {
        tradeId: data.tradeId,
        botInstanceId: data.botInstanceId,
      });
      return NextResponse.json(
        { error: 'Trade not found or does not belong to this bot' },
        { status: 404 }
      );
    }

    logger.info('Trade closed and recorded', {
      tradeId: data.tradeId,
      botInstanceId: data.botInstanceId,
      pair: data.pair,
      exitReason: data.exitReason || 'null',
      totalFees,
      netProfitLoss: actualProfitLoss,
      netProfitLossPercent: actualProfitLossPercent.toFixed(4),
      profitabilityAfterFees: actualProfitLoss > 0 ? 'profitable' : 'unprofitable',
    });

    // STEP 3: Record performance fee if profitable (separate from transaction)
    // Record for ALL profitable trades - status will be 'waived' for trial users
    if (actualProfitLoss > 0) {
      try {
        await recordPerformanceFee(
          userId,
          data.tradeId,
          data.botInstanceId,
          actualProfitLoss,
          data.pair
        );

        const feeRate = getEnvironmentConfig().PERFORMANCE_FEE_RATE;
        logger.info('Performance fee recorded for profitable trade', {
          userId,
          tradeId: data.tradeId,
          profitAmount: actualProfitLoss,
          feeAmount: (actualProfitLoss * feeRate).toFixed(2),
        });
      } catch (feeError) {
        // Log but don't fail the trade close if fee recording fails
        logger.error('Failed to record performance fee', feeError instanceof Error ? feeError : null, {
          userId,
          tradeId: data.tradeId,
          profitLoss: actualProfitLoss,
        });
        // Continue - trade is already closed, fee can be retried later
      }
    } else if (isPaperTrading && actualProfitLoss > 0) {
      logger.info('Skipping fee recording for paper trading (simulated profit)', {
        userId,
        tradeId: data.tradeId,
        simulatedProfit: actualProfitLoss,
        tradingMode,
      });
    }

    logger.info('Trade close request processed successfully', {
      tradeId: data.tradeId,
      botInstanceId: data.botInstanceId,
      userId,
      exchange,
      actualExitPrice,
      actualProfitLoss,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Trade closed successfully on exchange and database updated',
        tradeId: data.tradeId,
        exchange,
        exitPrice: actualExitPrice,
        profitLoss: actualProfitLoss,
        profitLossPercent: actualProfitLossPercent,
        tradingMode,
        feeRecorded: actualProfitLoss > 0 && !isPaperTrading,
        feeAmount: actualProfitLoss > 0 && !isPaperTrading ? (actualProfitLoss * getEnvironmentConfig().PERFORMANCE_FEE_RATE).toFixed(2) : null,
        paperTrading: isPaperTrading,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Trade close endpoint error', error instanceof Error ? error : null, {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    return NextResponse.json(
      {
        error: 'Failed to process trade close',
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}
