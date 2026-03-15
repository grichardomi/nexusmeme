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

    const currency: Record<string, number> = {};
    for (const b of balances) {
      currency[b.asset.toUpperCase()] = b.total;
    }

    // Deployable = stablecoin holdings only (USDT, USDC, USD, BUSD)
    return (currency['USDT'] ?? 0)
         + (currency['USDC'] ?? 0)
         + (currency['USD']  ?? 0)
         + (currency['BUSD'] ?? 0);
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
 * @param exchange - exchange name (e.g. 'binance', 'kraken')
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
    // Could not fetch — fail open with a warning so API key errors
    // surface separately (they're caught earlier in the flow)
    logger.warn('balance-guard: could not verify balance — allowing through', {
      userId,
      exchange,
    });
    return { allowed: true, exchange };
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
      reason: `Your ${exchange.toUpperCase()} account balance ($${balance.toFixed(2)} USDT/USD) is below the $${minimum.toLocaleString()} minimum required for live trading. Please fund your account and try again.`,
      balance,
      minimum,
      exchange,
    };
  }

  return { allowed: true, balance, minimum, exchange };
}
