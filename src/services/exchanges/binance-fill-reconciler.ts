/**
 * Exchange Fill Reconciler
 *
 * Runs every 5 minutes. For each open live trade (any supported exchange),
 * checks whether a SELL fill occurred on the exchange after the trade entry time.
 * If yes, closes the trade in the DB — no WebSocket required.
 *
 * This handles the edge case where the orchestrator placed a SELL order
 * (or the user manually closed) and the DB was never updated due to a
 * crash, restart, or network blip.
 *
 * Works for Binance (US + Global) and Kraken.
 */

import { query } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { getExchangeAdapter } from './singleton';

export async function reconcileBinanceFills(): Promise<void> {
  // Fetch all open live trades with their bot's API keys, for all exchanges
  let openTrades: Array<{
    trade_id: string;
    bot_id: string;
    user_id: string;
    exchange: string;
    pair: string;
    price: string;
    amount: string;
    fee: string | null;
    entry_time: string;
    encrypted_public_key: string;
    encrypted_secret_key: string;
  }>;

  try {
    openTrades = await query(
      `SELECT t.id AS trade_id, t.bot_instance_id AS bot_id, t.pair, t.price,
              t.amount, t.fee, t.entry_time, bi.user_id, bi.exchange,
              ek.encrypted_public_key, ek.encrypted_secret_key
       FROM trades t
       JOIN bot_instances bi ON bi.id = t.bot_instance_id
       JOIN exchange_api_keys ek ON ek.user_id = bi.user_id AND ek.exchange = bi.exchange
       WHERE t.status = 'open'
         AND COALESCE(bi.config->>'tradingMode', 'paper') = 'live'
         AND bi.status = 'running'
         AND t.entry_time < NOW() - INTERVAL '2 minutes'`
    );
  } catch (err) {
    logger.warn('Fill reconciler: failed to query open trades', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!openTrades.length) return;

  for (const trade of openTrades) {
    try {
      const apiKey = decrypt(trade.encrypted_public_key);
      const apiSecret = decrypt(trade.encrypted_secret_key);

      const adapter = getExchangeAdapter(trade.exchange);
      await adapter.connect({ publicKey: apiKey, secretKey: apiSecret });

      if (typeof (adapter as any).getRecentSellFill !== 'function') {
        continue; // Exchange not yet supported by reconciler
      }

      const entryMs = new Date(trade.entry_time).getTime();
      const tradeQty = parseFloat(String(trade.amount));

      let fill: { price: number; qty: number; commission: number; commissionAsset: string; time: number } | null = null;

      try {
        fill = await (adapter as any).getRecentSellFill(trade.pair, entryMs);
      } catch (fillErr) {
        logger.warn('Fill reconciler: getRecentSellFill failed — falling back to balance check', {
          tradeId: trade.trade_id,
          pair: trade.pair,
          exchange: trade.exchange,
          error: fillErr instanceof Error ? fillErr.message : String(fillErr),
        });
      }

      if (!fill) {
        // Fallback: check if the base asset balance is below the trade quantity.
        // If so, the position was externally closed (sold on Binance directly).
        try {
          const [base] = trade.pair.split('/');
          const balances = await adapter.getBalances();
          const baseBalance = balances.find(b => b.asset.toUpperCase() === base.toUpperCase());
          const freeBase = baseBalance?.free ?? 0;
          const totalBase = baseBalance?.total ?? 0;
          if (freeBase + totalBase < tradeQty * 0.5) {
            // Balance is less than 50% of trade size — position is gone on exchange
            logger.info('Fill reconciler: balance check shows position closed externally', {
              tradeId: trade.trade_id,
              pair: trade.pair,
              tradeQty,
              freeBase,
              totalBase,
            });
            // Use last known price as exit price (best approximation without fill data)
            const entryPrice = parseFloat(String(trade.price));
            const entryFee = parseFloat(String(trade.fee ?? '0')) || 0;
            const grossPL = 0; // Unknown exit price — record as breakeven
            await query(
              `UPDATE trades
               SET exit_time           = NOW(),
                   exit_price          = $1,
                   profit_loss         = $2,
                   profit_loss_percent = 0,
                   exit_reason         = 'external_close_detected',
                   status              = 'closed'
               WHERE id = $3 AND status = 'open'`,
              [entryPrice, grossPL - entryFee, trade.trade_id]
            );
            logger.info('Fill reconciler: trade closed via balance check', {
              tradeId: trade.trade_id, pair: trade.pair,
            });
          } else {
            logger.debug('Fill reconciler: no sell fill, position still open', {
              tradeId: trade.trade_id, pair: trade.pair, freeBase, totalBase, tradeQty,
            });
          }
        } catch (balErr) {
          logger.warn('Fill reconciler: balance fallback failed', {
            tradeId: trade.trade_id,
            error: balErr instanceof Error ? balErr.message : String(balErr),
          });
        }
        continue;
      }

      // SELL fill found — close the trade in DB
      const entryPrice = parseFloat(String(trade.price));
      const quantity = parseFloat(String(trade.amount));
      const entryFee = parseFloat(String(trade.fee ?? '0')) || 0;

      // Convert commission to quote currency if needed
      const [, quote] = trade.pair.split('/');
      let exitFee = 0;
      if (fill.commission > 0) {
        if (fill.commissionAsset.toUpperCase() === quote.toUpperCase()) {
          exitFee = fill.commission;
        } else {
          // Commission in another asset (e.g. BNB) — estimate via taker rate
          exitFee = fill.price * fill.qty * 0.001;
        }
      }

      const grossPL = (fill.price - entryPrice) * quantity;
      const netPL = grossPL - entryFee - exitFee;
      const netPLPct = entryPrice > 0 && quantity > 0
        ? (netPL / (entryPrice * quantity)) * 100
        : 0;

      const result = await query<{ id: string }>(
        `UPDATE trades
         SET exit_time           = TO_TIMESTAMP($1::bigint / 1000.0),
             exit_price          = $2,
             profit_loss         = $3,
             profit_loss_percent = $4,
             exit_reason         = 'fill_reconciled',
             fee                 = $5,
             exit_fee            = $6,
             status              = 'closed'
         WHERE id = $7 AND status = 'open'
         RETURNING id`,
        [fill.time, fill.price, netPL, netPLPct, entryFee + exitFee, exitFee, trade.trade_id]
      );

      if (result.length > 0) {
        logger.info('Fill reconciler: trade closed from exchange fill', {
          tradeId: trade.trade_id,
          botId: trade.bot_id,
          exchange: trade.exchange,
          pair: trade.pair,
          entryPrice,
          fillPrice: fill.price,
          netPL: netPL.toFixed(4),
          netPLPct: netPLPct.toFixed(2),
        });
      }
    } catch (err) {
      logger.warn('Fill reconciler: error checking trade', {
        tradeId: trade.trade_id,
        exchange: trade.exchange,
        pair: trade.pair,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
