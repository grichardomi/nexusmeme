/**
 * Balance Guard — Minimum Balance Enforcement for Live Trading
 *
 * Exchange-agnostic: works with any exchange that has a registered adapter.
 * Reads minimum balance threshold from environment (LIVE_TRADING_MIN_BALANCE_USD).
 * Only enforced for live trading — paper trading has no minimum.
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { getEnvironmentConfig } from '@/config/environment';

export interface BalanceGuardResult {
  allowed: boolean;
  reason?: string;
  balance?: number;       // actual deployable USD balance
  minimum?: number;       // threshold from env
  exchange?: string;
}

/**
 * Fetch the deployable USD balance for a user on a given exchange.
 * Deployable = USDT + USD (what the bot can actually use for trades).
 * Returns null if keys are missing or exchange call fails.
 */
async function fetchDeployableBalance(
  userId: string,
  exchange: string
): Promise<number | null> {
  const keysResult = await query(
    `SELECT encrypted_public_key, encrypted_secret_key
     FROM exchange_api_keys
     WHERE user_id = $1 AND exchange = $2
     LIMIT 1`,
    [userId, exchange.toLowerCase()]
  );

  if (keysResult.length === 0) return null;

  try {
    const publicKey = decrypt(keysResult[0].encrypted_public_key);
    const secretKey = decrypt(keysResult[0].encrypted_secret_key);

    const adapter = getExchangeAdapter(exchange.toLowerCase());
    await adapter.connect({ publicKey, secretKey });
    const balances = await adapter.getBalances();

    // Deployable balance = FREE stablecoins only.
    // Use balance.free (not total) — locked funds in open orders are not deployable.
    // BTC/ETH are excluded: the bot can only open buy orders with free stablecoins.
    let free = 0;
    for (const b of balances) {
      const asset = b.asset.toUpperCase();
      if (['USDT', 'USDC', 'USD', 'BUSD', 'TUSD', 'DAI'].includes(asset)) {
        free += b.free;
      }
    }
    return free;
  } catch (err) {
    logger.warn('balance-guard: failed to fetch balance from exchange', {
      userId,
      exchange,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Check whether a user meets the minimum balance requirement for live trading.
 *
 * @param userId   - user attempting to start/create a live bot
 * @param exchange - exchange name (e.g. 'binance')
 * @param tradingMode - 'paper' | 'live'. Paper trading is always allowed.
 */
export async function checkMinimumBalance(
  userId: string,
  exchange: string,
  tradingMode: 'paper' | 'live'
): Promise<BalanceGuardResult> {
  // Paper trading has no minimum — never block it
  if (tradingMode !== 'live') {
    return { allowed: true };
  }

  const env = getEnvironmentConfig();
  const minimum = env.LIVE_TRADING_MIN_BALANCE_USD;

  const balance = await fetchDeployableBalance(userId, exchange);

  if (balance === null) {
    // Could not fetch balance — this means keys exist but are invalid/expired/wrong region
    // Fail CLOSED: require valid keys before going live (bad keys = trade failures)
    logger.warn('balance-guard: could not verify balance — blocking live switch (likely invalid API keys)', {
      userId,
      exchange,
    });
    return {
      allowed: false,
      reason: `Could not verify your ${exchange.toUpperCase()} account balance. Please check that your API keys are valid, have read permissions, and are from your Binance global (binance.com) account.`,
      exchange,
    };
  }

  if (balance < minimum) {
    logger.info('balance-guard: balance below minimum for live trading', {
      userId,
      exchange,
      balance,
      minimum,
    });
    return {
      allowed: false,
      reason: `Your free USD/USDT balance ($${balance.toFixed(2)}) is below the $${minimum.toLocaleString()} minimum required for live trading. BTC and ETH holdings do not count — the bot can only place buy orders using free stablecoins. Please convert BTC/ETH to USD or USDT on Binance, then try switching to live trading again.`,
      balance,
      minimum,
      exchange,
    };
  }

  return { allowed: true, balance, minimum, exchange };
}
