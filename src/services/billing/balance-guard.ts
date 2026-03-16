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
import { marketDataAggregator } from '@/services/market-data/aggregator';

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

    // Stablecoins (USD-pegged, any region)
    const stableValue = (currency['USDT'] ?? 0)
                      + (currency['USDC'] ?? 0)
                      + (currency['USD']  ?? 0)
                      + (currency['BUSD'] ?? 0)
                      + (currency['TUSD'] ?? 0)
                      + (currency['DAI']  ?? 0);

    // Crypto holdings converted to USD using live prices
    // International users may hold BTC/ETH instead of stablecoins
    let btcPrice = 0;
    let ethPrice = 0;
    try {
      const priceMap = await marketDataAggregator.getMarketData(['BTC/USDT', 'ETH/USDT']);
      btcPrice = priceMap.get('BTC/USDT')?.price ?? 0;
      ethPrice = priceMap.get('ETH/USDT')?.price ?? 0;
    } catch {
      // Price fetch failed — stablecoin-only total will be used
    }
    const btcValue = (currency['BTC'] ?? 0) * btcPrice;
    const ethValue = (currency['ETH'] ?? 0) * ethPrice;

    // Total deployable value in USD-equivalent (stablecoins + crypto at market price)
    return stableValue + btcValue + ethValue;
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
    // Could not fetch balance — this means keys exist but are invalid/expired/wrong region
    // Fail CLOSED: require valid keys before going live (bad keys = trade failures)
    logger.warn('balance-guard: could not verify balance — blocking live switch (likely invalid API keys)', {
      userId,
      exchange,
    });
    return {
      allowed: false,
      reason: `Could not verify your ${exchange.toUpperCase()} account balance. Please check that your API keys are valid and have read permissions. USA users need Binance US keys (binance.us), others need Binance global keys (binance.com).`,
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
      reason: `Your ${exchange.toUpperCase()} account value ($${balance.toFixed(2)} USD equivalent) is below the $${minimum.toLocaleString()} minimum required for live trading. Your balance includes stablecoins (USDT, USDC, USD) plus BTC and ETH at current market prices. Please fund your account and try again.`,
      balance,
      minimum,
      exchange,
    };
  }

  return { allowed: true, balance, minimum, exchange };
}
