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
import { sendTradeAlertEmail } from '@/services/email/triggers';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';
import { withRetry } from '@/lib/resilience';
import { z } from 'zod';

const tradeCloseSchema = z.object({
  botInstanceId: z.string().uuid('Bot instance ID must be a valid UUID'),
  tradeId: z.string({ required_error: 'Trade ID is required' }),
  pair: z.string({ required_error: 'Trading pair is required' }),
  exitTime: z.string().datetime('Exit time must be ISO 8601 datetime').refine((val) => {
    const t = new Date(val).getTime();
    const now = Date.now();
    // Must be within ±5 minutes of server time — prevents timestamp manipulation
    return Math.abs(now - t) < 5 * 60 * 1000;
  }, 'Exit time must be within 5 minutes of server time'),
  exitPrice: z.number().positive('Exit price must be positive'),
  profitLoss: z.number({ required_error: 'Profit/loss amount is required' }),
  profitLossPercent: z.number({ required_error: 'Profit/loss percent is required' }),
  exitReason: z.string().optional().describe('Reason for trade exit (e.g., momentum_failure, profit_target, stop_loss)'),
  // Optional: pass known entry data to skip redundant DB query (reduces close latency)
  entryPrice: z.number().positive().optional(),
  entryFee: z.number().optional(),
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

    // Fetch the original trade to get quantity and its own trading_mode
    const tradeData = await query(
      `SELECT t.id, t.pair, t.amount, t.trading_mode as trade_mode, b.exchange
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
    // Use the trade's own trading_mode — bot may have gone live after this trade was opened
    const isTradeActuallyPaper = (originalTrade.trade_mode || tradingMode) === 'paper';

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

    if (!isPaperTrading && (!keysResult || keysResult.length === 0)) {
      logger.warn('No API keys found for live trading exchange', { userId, exchange });
      return NextResponse.json(
        { error: 'No API keys configured for this exchange' },
        { status: 400 }
      );
    }

    const keys = keysResult?.[0];
    let actualExitPrice = data.exitPrice;
    let actualProfitLoss = data.profitLoss;
    let actualProfitLossPercent = data.profitLossPercent;
    let totalFees = 0; // Track total fees (entry + exit)
    let exitFeeAmount = 0; // Exit fee separately for exit_fee column

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
        // Use connectNoValidate to avoid unnecessary getBalances() API call
        // Keys are already trusted (fetched from DB) — no need to validate on every close
        adapter.connectNoValidate({
          publicKey: decryptedPublicKey,
          secretKey: decryptedSecretKey,
        });

        // Always fetch entry info for accurate P&L calc
        let cachedEntryInfo: { price: any; fee: any; amount: any } | null = null;
        try {
          if (data.entryPrice) {
            cachedEntryInfo = { price: data.entryPrice, fee: data.entryFee ?? null, amount: quantity };
          } else {
            cachedEntryInfo = (await query(
              `SELECT price, fee, amount FROM trades WHERE id = $1`,
              [data.tradeId]
            ))[0] || null;
          }
        } catch {}

        // Resolve actual available balance for the base asset before selling.
        // Binance deducts buy fees IN THE BASE ASSET (e.g. BTC), so the wallet holds
        // slightly less than the DB-stored quantity. Selling the stored amount causes
        // -2010 "insufficient balance" which silently leaves BTC/ETH unconverted.
        let sellQuantity = quantity;
        try {
          const balances = await adapter.getBalances();
          const [base] = data.pair.split('/');
          const assetBalance = balances.find(b => b.asset.toUpperCase() === base.toUpperCase());
          if (assetBalance && assetBalance.free > 0 && assetBalance.free < quantity) {
            logger.info('Sell quantity adjusted to actual available balance (buy fee deducted in base asset)', {
              pair: data.pair,
              storedQty: quantity,
              availableQty: assetBalance.free,
            });
            sellQuantity = assetBalance.free;
          }
        } catch (balErr) {
          logger.warn('Could not fetch balance before sell — using stored quantity', {
            pair: data.pair,
            error: balErr instanceof Error ? balErr.message : String(balErr),
          });
        }

        // Always MARKET sell — fills immediately regardless of price, ensures BTC/ETH
        // always converts back to USDT/USD. IOC with price floors caused silent order
        // cancellations, leaving crypto unsold and draining stablecoin balance.
        const orderResult = await withRetry(
          async () => {
            return await adapter.placeOrder({
              pair: data.pair,
              side: 'sell',
              amount: sellQuantity,
              price: data.exitPrice,
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

        // Market sell orders fill immediately — use fill price if available, else signal price
        actualExitPrice = orderResult.avgPrice || orderResult.price || data.exitPrice;

        // Capture exit fee from order execution
        let exitFee = 0;
        if ((orderResult as any).feeQuote && (orderResult as any).feeQuote > 0) {
          exitFee = (orderResult as any).feeQuote;
          logger.debug('Captured exit fee (normalized to quote)', { orderId: orderResult.orderId, exitFee, feeAsset: (orderResult as any).feeAsset });
        } else if (orderResult.fee) {
          exitFee = orderResult.fee;
          logger.debug('Captured exit fee from order (assumed quote)', { orderId: orderResult.orderId, exitFee });
        } else {
          // Fallback: Use admin-managed exchange fee rates from billing_settings
          const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
          const exchangeKey = exchange.toLowerCase() === 'kraken' ? 'kraken' : 'binance';
          const dbRates = await getExchangeFeeRates(exchangeKey);
          const feeRate = dbRates.taker_fee;

          exitFee = (actualExitPrice * quantity) * feeRate;
          logger.debug('Using configured exchange taker fee for exit', {
            exchange,
            feeRate,
            exitFee,
          });
        }

        // Recalculate P&L using actual execution price.
        // Use cachedEntryInfo (read before any DB update) instead of re-reading from DB.
        // Re-reading fee from the DB here would cause fee compounding in race conditions:
        // a concurrent close attempt could have already overwritten fee=totalFees, which
        // would then be used as entryFee here → each iteration adds another exitFee.
        if (cachedEntryInfo?.price) {
          const entryPrice = parseFloat(String(cachedEntryInfo.price));
          const entryFee = parseFloat(String(cachedEntryInfo.fee)) || 0;

          // Calculate gross P&L before fees (use sellQuantity — actual BTC sold after buy fee)
          const grossProfitLoss = (actualExitPrice - entryPrice) * sellQuantity;

          // Deduct total fees (entry + exit)
          exitFeeAmount = exitFee;
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
        // Paper trading: no real order, but still deduct estimated fees so closed P&L is
        // consistent with how open trades are displayed (open = gross - entryFee; closed must match).
        logger.warn('No API keys configured - trade will be closed in database only (paper mode)', {
          exchange,
          pair: data.pair,
        });
        try {
          const entryInfo = (await query(
            `SELECT price, fee, amount FROM trades WHERE id = $1`,
            [data.tradeId]
          ))[0];
          if (entryInfo) {
            const ep = parseFloat(String(entryInfo.price));
            const qty = parseFloat(String(entryInfo.amount)) || quantity;
            const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
            const exchangeKey = exchange.toLowerCase() === 'kraken' ? 'kraken' : 'binance';
            const dbRates = await getExchangeFeeRates(exchangeKey);
            const feeRate = dbRates.taker_fee;
            const storedEntryFee = entryInfo.fee ? parseFloat(String(entryInfo.fee)) : ep * qty * feeRate;
            exitFeeAmount = data.exitPrice * qty * feeRate;
            totalFees = storedEntryFee + exitFeeAmount;
            const grossPL = (data.exitPrice - ep) * qty;
            actualProfitLoss = grossPL - totalFees;
            actualProfitLossPercent = (actualProfitLoss / (ep * qty)) * 100;
          }
        } catch (paperFeeErr) {
          logger.debug('Paper trade fee estimation failed, using gross P&L', { tradeId: data.tradeId, error: String(paperFeeErr) });
        }
      }
    } catch (exchangeError) {
      const errMsg = exchangeError instanceof Error ? exchangeError.message : String(exchangeError);
      logger.error('Failed to place sell order on exchange — trade NOT closed in DB (position still open)', exchangeError instanceof Error ? exchangeError : null, {
        exchange,
        pair: data.pair,
        quantity,
        tradeId: data.tradeId,
      });
      // CRITICAL SAFETY RULE: If the live sell order failed, do NOT close the trade in DB.
      // Closing the DB record without a real sell = BTC/ETH stranded in wallet permanently.
      // The orchestrator will retry the exit on the next cycle.
      if (!isTradeActuallyPaper) {
        return NextResponse.json(
          { error: 'Exchange sell order failed — trade remains open', detail: errMsg },
          { status: 503 }
        );
      }
      // Paper mode: no real sell needed, compute P&L from first principles and close normally
      try {
        const entryInfo = (await query(
          `SELECT price, fee, amount FROM trades WHERE id = $1`,
          [data.tradeId]
        ))[0];
        if (entryInfo) {
          const ep = parseFloat(String(entryInfo.price));
          const qty = parseFloat(String(entryInfo.amount)) || quantity;
          const storedEntryFee = entryInfo.fee ? parseFloat(String(entryInfo.fee)) : 0;
          const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
          const exchangeKey = exchange.toLowerCase() === 'kraken' ? 'kraken' : 'binance';
          const dbRates = await getExchangeFeeRates(exchangeKey);
          const feeRate = dbRates.taker_fee || (exchange.toLowerCase() === 'kraken' ? 0.0026 : 0.001);
          exitFeeAmount = actualExitPrice * qty * feeRate;
          totalFees = storedEntryFee + exitFeeAmount;
          const grossPL = (actualExitPrice - ep) * qty;
          actualProfitLoss = grossPL - totalFees;
          actualProfitLossPercent = ep > 0 && qty > 0 ? (actualProfitLoss / (ep * qty)) * 100 : 0;
        }
      } catch (fallbackErr) {
        logger.error('P&L fallback computation failed', fallbackErr instanceof Error ? fallbackErr : null);
      }
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
      // Try updating with exit_reason and exit_price if columns exist.
      // AND status = 'open' prevents double-close race conditions: if a concurrent close
      // already changed status to 'closed', this UPDATE returns 0 rows and we return idempotent success.
      updateResult = await query(
        `UPDATE trades
         SET exit_time = $1,
             exit_price = $2,
             profit_loss = $3,
             profit_loss_percent = $4,
             exit_reason = $5,
             fee = $6,
             exit_fee = $7,
             status = 'closed'
         WHERE id = $8 AND bot_instance_id = $9 AND status = 'open'
         RETURNING id`,
        [data.exitTime, actualExitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, totalFees || null, exitFeeAmount || null, data.tradeId, data.botInstanceId]
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
           WHERE id = $6 AND bot_instance_id = $7 AND status = 'open'
           RETURNING id`,
          [data.exitTime, actualExitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, data.tradeId, data.botInstanceId]
        );
      } else if ((updateError as any)?.message?.includes('exit_price') || (updateError as any)?.message?.includes('exit_reason')) {
        logger.debug('exit_price or exit_reason column not found, updating without them');
        updateResult = await query(
          `UPDATE trades
           SET exit_time = $1,
               profit_loss = $2,
               profit_loss_percent = $3,
               status = 'closed'
           WHERE id = $4 AND bot_instance_id = $5 AND status = 'open'
           RETURNING id`,
          [data.exitTime, actualProfitLoss, actualProfitLossPercent, data.tradeId, data.botInstanceId]
        );
      } else {
        throw updateError;
      }
    }

    if (!updateResult || updateResult.length === 0) {
      // 0 rows updated: either trade was already closed by a concurrent request, or it doesn't exist.
      // Check which case it is for correct response.
      const existingTrade = await query(
        `SELECT id, status FROM trades WHERE id = $1 AND bot_instance_id = $2`,
        [data.tradeId, data.botInstanceId]
      );
      if (existingTrade?.[0]?.status === 'closed') {
        logger.info('Trade already closed by concurrent request — returning idempotent success', {
          tradeId: data.tradeId,
          botInstanceId: data.botInstanceId,
        });
        return NextResponse.json(
          { success: true, message: 'Trade already closed', tradeId: data.tradeId },
          { status: 200 }
        );
      }
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
    // recordPerformanceFee handles waiving internally (trial users, paper mode)
    if (actualProfitLoss > 0) {
      try {
        await recordPerformanceFee(
          userId,
          data.tradeId,
          data.botInstanceId,
          actualProfitLoss,
          data.pair
        );

        logger.info('Performance fee recorded for profitable trade', {
          userId,
          tradeId: data.tradeId,
          profitAmount: actualProfitLoss,
          tradingMode,
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
    }

    logger.info('Trade close request processed successfully', {
      tradeId: data.tradeId,
      botInstanceId: data.botInstanceId,
      userId,
      exchange,
      actualExitPrice,
      actualProfitLoss,
    });

    // Trade close notification — only for live trades (check trade's own mode, not bot's current mode)
    if (!isTradeActuallyPaper) {
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
              [data.botInstanceId]
            );
            const botName = botRows[0]?.config?.name || 'Trading Bot';
            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/bots/${data.botInstanceId}`;
            await sendTradeAlertEmail(
              user.email, user.name || 'Trader',
              botName, data.pair, 'SELL',
              actualExitPrice, quantity, dashboardUrl,
              actualProfitLoss
            );
          }
        } catch {
          // fire-and-forget
        }
      })();
    }

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
