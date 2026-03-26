/**
 * closeTrade — core trade close logic, callable in-process.
 *
 * Extracted from POST /api/bots/trades/close so the orchestrator can call it
 * directly without an HTTP round-trip (~20-50ms saved per profitable exit).
 *
 * The HTTP route is now a thin Zod-validation wrapper around this function.
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordPerformanceFee } from '@/services/billing/performance-fee';
import { sendTradeAlertEmail } from '@/services/email/triggers';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { decrypt } from '@/lib/crypto';
import { withRetry } from '@/lib/resilience';

export interface CloseTradeParams {
  botInstanceId: string;
  tradeId: string;
  pair: string;
  exitTime: string;
  exitPrice: number;
  profitLoss: number;
  profitLossPercent: number;
  exitReason?: string;
  /** Pass to skip the DB re-fetch of entry data (reduces close latency) */
  entryPrice?: number;
  entryFee?: number;
}

export type CloseTradeResult =
  | { ok: true; tradeId: string; exitPrice: number; profitLoss: number; profitLossPercent: number; tradingMode: string; paperTrading: boolean; alreadyClosed?: boolean }
  | { ok: false; status: number; error: string; reason?: string; profitLossPercent?: number };

export async function closeTrade(data: CloseTradeParams): Promise<CloseTradeResult> {
  // Fetch bot + trade in parallel (independent queries)
  const [botResult, tradeData] = await Promise.all([
    query(
      `SELECT id, user_id, config FROM bot_instances WHERE id = $1`,
      [data.botInstanceId]
    ),
    query(
      `SELECT t.id, t.pair, t.amount, t.trading_mode as trade_mode, b.exchange
       FROM trades t
       INNER JOIN bot_instances b ON t.bot_instance_id = b.id
       WHERE t.id = $1 AND t.bot_instance_id = $2`,
      [data.tradeId, data.botInstanceId]
    ),
  ]);

  if (!botResult || botResult.length === 0) {
    return { ok: false, status: 404, error: 'Bot instance not found' };
  }

  if (!tradeData || (tradeData as any[]).length === 0) {
    return { ok: false, status: 404, error: 'Trade not found' };
  }

  const bot = (botResult as any[])[0];
  const userId = bot.user_id;
  const botConfig = bot.config || {};
  const tradingMode = (botConfig.tradingMode as 'paper' | 'live') || 'paper';
  const isPaperTrading = tradingMode === 'paper';

  const originalTrade = (tradeData as any[])[0];
  const exchange: string = originalTrade.exchange;
  const quantity: number = originalTrade.amount;
  const isTradeActuallyPaper = (originalTrade.trade_mode || tradingMode) === 'paper';

  // Fetch API keys (needs user_id resolved above)
  const keysResult = await query(
    `SELECT encrypted_public_key, encrypted_secret_key FROM exchange_api_keys
     WHERE user_id = $1 AND exchange = $2`,
    [userId, exchange]
  );

  if (!isPaperTrading && (!keysResult || (keysResult as any[]).length === 0)) {
    return { ok: false, status: 400, error: 'No API keys configured for this exchange' };
  }

  const keys = (keysResult as any[])?.[0];
  let actualExitPrice = data.exitPrice;
  let actualProfitLoss = data.profitLoss;
  let actualProfitLossPercent = data.profitLossPercent;
  let totalFees = 0;
  let exitFeeAmount = 0;

  // STEP 1: Place sell order on exchange (live) or estimate fees (paper)
  try {
    if (keys && !isTradeActuallyPaper) {
      const decryptedPublicKey = decrypt(keys.encrypted_public_key);
      const decryptedSecretKey = decrypt(keys.encrypted_secret_key);
      const adapter = getExchangeAdapter(exchange);
      adapter.connectNoValidate({ publicKey: decryptedPublicKey, secretKey: decryptedSecretKey });

      // Resolve entry info for P&L calc
      let cachedEntryInfo: { price: any; fee: any; amount: any } | null = null;
      try {
        if (data.entryPrice) {
          cachedEntryInfo = { price: data.entryPrice, fee: data.entryFee ?? null, amount: quantity };
        } else {
          cachedEntryInfo = ((await query(`SELECT price, fee, amount FROM trades WHERE id = $1`, [data.tradeId])) as any[])[0] || null;
        }
      } catch {}

      // Resolve actual available balance (Binance deducts buy fee in base asset)
      let sellQuantity = quantity;
      try {
        const balances = await adapter.getBalances();
        const [base] = data.pair.split('/');
        const assetBalance = (balances as any[]).find((b: any) => b.asset.toUpperCase() === base.toUpperCase());
        if (assetBalance && assetBalance.free > 0 && assetBalance.free < quantity) {
          sellQuantity = assetBalance.free;
        }
      } catch (balErr) {
        logger.warn('Could not fetch balance before sell — using stored quantity', { pair: data.pair, error: balErr instanceof Error ? balErr.message : String(balErr) });
      }

      const orderResult = await withRetry(
        async () => adapter.placeOrder({ pair: data.pair, side: 'sell', amount: sellQuantity, price: data.exitPrice }),
        {
          maxRetries: 2, baseDelay: 100, maxDelay: 1000,
          retryableErrors: (error: Error) => {
            const msg = error.message || String(error);
            if (msg.includes('-2010') || msg.includes('-1013') || msg.includes('Invalid')) return false;
            return true;
          },
        }
      );

      actualExitPrice = (orderResult as any).avgPrice || (orderResult as any).price || data.exitPrice;

      // Capture exit fee
      let exitFee = 0;
      if ((orderResult as any).feeQuote > 0) {
        exitFee = (orderResult as any).feeQuote;
      } else if ((orderResult as any).fee) {
        exitFee = (orderResult as any).fee;
      } else {
        const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
        const exchangeKey = 'binance';
        const dbRates = await getExchangeFeeRates(exchangeKey);
        exitFee = (actualExitPrice * quantity) * (dbRates as any).taker_fee;
      }

      if (cachedEntryInfo?.price) {
        const entryPrice = parseFloat(String(cachedEntryInfo.price));
        const entryFee = parseFloat(String(cachedEntryInfo.fee)) || 0;
        const grossProfitLoss = (actualExitPrice - entryPrice) * sellQuantity;
        exitFeeAmount = exitFee;
        totalFees = entryFee + exitFee;
        actualProfitLoss = grossProfitLoss - totalFees;
        actualProfitLossPercent = (actualProfitLoss / (entryPrice * quantity)) * 100;
      }

    } else {
      // Paper trading: estimate fees
      try {
        const entryInfo = ((await query(`SELECT price, fee, amount FROM trades WHERE id = $1`, [data.tradeId])) as any[])[0];
        if (entryInfo) {
          const ep = parseFloat(String(entryInfo.price));
          const qty = parseFloat(String(entryInfo.amount)) || quantity;
          const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
          const exchangeKey = 'binance';
          const dbRates = await getExchangeFeeRates(exchangeKey);
          const feeRate = (dbRates as any).taker_fee;
          const storedEntryFee = entryInfo.fee ? parseFloat(String(entryInfo.fee)) : ep * qty * feeRate;
          exitFeeAmount = data.exitPrice * qty * feeRate;
          totalFees = storedEntryFee + exitFeeAmount;
          actualProfitLoss = (data.exitPrice - ep) * qty - totalFees;
          actualProfitLossPercent = (actualProfitLoss / (ep * qty)) * 100;
        }
      } catch {}
    }
  } catch (exchangeError) {
    const errMsg = exchangeError instanceof Error ? exchangeError.message : String(exchangeError);
    logger.error('Failed to place sell order — trade NOT closed in DB', exchangeError instanceof Error ? exchangeError : null, { exchange, pair: data.pair, tradeId: data.tradeId });

    if (!isTradeActuallyPaper) {
      return { ok: false, status: 503, error: 'Exchange sell order failed — trade remains open', reason: errMsg };
    }

    // Paper: compute P&L from first principles and close normally
    try {
      const entryInfo = ((await query(`SELECT price, fee, amount FROM trades WHERE id = $1`, [data.tradeId])) as any[])[0];
      if (entryInfo) {
        const ep = parseFloat(String(entryInfo.price));
        const qty = parseFloat(String(entryInfo.amount)) || quantity;
        const storedEntryFee = entryInfo.fee ? parseFloat(String(entryInfo.fee)) : 0;
        const { getExchangeFeeRates } = await import('@/services/billing/fee-rate');
        const exchangeKey = 'binance';
        const dbRates = await getExchangeFeeRates(exchangeKey);
        const feeRate = (dbRates as any).taker_fee || 0.001;
        exitFeeAmount = actualExitPrice * qty * feeRate;
        totalFees = storedEntryFee + exitFeeAmount;
        actualProfitLoss = (actualExitPrice - ep) * qty - totalFees;
        actualProfitLossPercent = ep > 0 && qty > 0 ? (actualProfitLoss / (ep * qty)) * 100 : 0;
      }
    } catch {}
  }

  // VALIDATION: Only abort pure profit-target exits that went red during execution.
  // Erosion cap exits MUST always execute — aborting them causes the trade to stay
  // open and keep bleeding (trapped position bug observed 2026-03-24 23:09-23:19).
  const profitTargetOnlyReasons = ['profit_target', 'profit_lock_regime'];
  if (profitTargetOnlyReasons.includes(data.exitReason || '') && actualProfitLossPercent < 0) {
    return {
      ok: false, status: 400,
      error: 'Exit aborted - trade went red',
      reason: 'profit_protection_invalid_for_red_trade',
      profitLossPercent: actualProfitLossPercent,
    };
  }

  // Normalize exit reason aliases
  let correctedExitReason = data.exitReason;
  if (correctedExitReason === 'erosion_cap_profit_lock') correctedExitReason = 'erosion_cap_protected';

  // STEP 2: Update trade record
  let updateResult;
  try {
    updateResult = await query(
      `UPDATE trades
       SET exit_time = $1, exit_price = $2, profit_loss = $3, profit_loss_percent = $4,
           exit_reason = $5, fee = $6, exit_fee = $7, status = 'closed'
       WHERE id = $8 AND bot_instance_id = $9 AND status = 'open'
       RETURNING id`,
      [data.exitTime, actualExitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, totalFees || null, exitFeeAmount || null, data.tradeId, data.botInstanceId]
    );
  } catch (updateError) {
    const msg = (updateError as any)?.message || '';
    if (msg.includes('fee')) {
      updateResult = await query(
        `UPDATE trades SET exit_time = $1, exit_price = $2, profit_loss = $3, profit_loss_percent = $4, exit_reason = $5, status = 'closed'
         WHERE id = $6 AND bot_instance_id = $7 AND status = 'open' RETURNING id`,
        [data.exitTime, actualExitPrice, actualProfitLoss, actualProfitLossPercent, correctedExitReason || null, data.tradeId, data.botInstanceId]
      );
    } else if (msg.includes('exit_price') || msg.includes('exit_reason')) {
      updateResult = await query(
        `UPDATE trades SET exit_time = $1, profit_loss = $2, profit_loss_percent = $3, status = 'closed'
         WHERE id = $4 AND bot_instance_id = $5 AND status = 'open' RETURNING id`,
        [data.exitTime, actualProfitLoss, actualProfitLossPercent, data.tradeId, data.botInstanceId]
      );
    } else {
      throw updateError;
    }
  }

  if (!updateResult || (updateResult as any[]).length === 0) {
    const existing = await query(`SELECT status FROM trades WHERE id = $1 AND bot_instance_id = $2`, [data.tradeId, data.botInstanceId]);
    if ((existing as any[])?.[0]?.status === 'closed') {
      return { ok: true, tradeId: data.tradeId, exitPrice: actualExitPrice, profitLoss: actualProfitLoss, profitLossPercent: actualProfitLossPercent, tradingMode, paperTrading: isPaperTrading, alreadyClosed: true };
    }
    return { ok: false, status: 404, error: 'Trade not found or does not belong to this bot' };
  }

  logger.info('Trade closed', { tradeId: data.tradeId, pair: data.pair, exitReason: data.exitReason, netProfitLoss: actualProfitLoss, profitLossPercent: actualProfitLossPercent.toFixed(4) });

  // STEP 3: Record performance fee (non-fatal)
  if (actualProfitLoss > 0) {
    try {
      await recordPerformanceFee(userId, data.tradeId, data.botInstanceId, actualProfitLoss, data.pair);
    } catch (feeError) {
      logger.error('Failed to record performance fee', feeError instanceof Error ? feeError : null, { userId, tradeId: data.tradeId });
    }
  }

  // STEP 4: Trade alert email — fire-and-forget, live trades only
  if (!isTradeActuallyPaper) {
    (async () => {
      try {
        const userRows = await query<{ email: string; name: string; trade_alerts: boolean }>(
          `SELECT u.email, u.name, COALESCE(ep.trade_alerts, true) as trade_alerts
           FROM users u LEFT JOIN email_preferences ep ON ep.user_id = u.id WHERE u.id = $1`,
          [userId]
        );
        const user = (userRows as any[])[0];
        if (user?.trade_alerts) {
          const botRows = await query<{ config: any }>(`SELECT config FROM bot_instances WHERE id = $1`, [data.botInstanceId]);
          const botName = (botRows as any[])[0]?.config?.name || 'Trading Bot';
          const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/bots/${data.botInstanceId}`;
          await sendTradeAlertEmail(user.email, user.name || 'Trader', botName, data.pair, 'SELL', actualExitPrice, quantity, dashboardUrl, actualProfitLoss);
        }
      } catch {}
    })();
  }

  return { ok: true, tradeId: data.tradeId, exitPrice: actualExitPrice, profitLoss: actualProfitLoss, profitLossPercent: actualProfitLossPercent, tradingMode, paperTrading: isPaperTrading };
}
