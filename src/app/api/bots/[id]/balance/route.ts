import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import { marketDataAggregator } from '@/services/market-data/aggregator';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * GET /api/bots/[id]/balance
 * Get available balance for unlimited capital bots (0 = unlimited)
 * Returns 95% of real exchange balance to prevent "insufficient funds" errors
 * - LIVE mode: Fetches real balance from exchange
 * - PAPER mode: Fetches real balance but doesn't execute orders
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: botId } = await params;

    // Get bot details
    const botResult = await query(
      `SELECT b.id, b.exchange, b.config, b.trading_pairs
       FROM bot_instances b
       WHERE b.id = $1 AND b.user_id = $2`,
      [botId, session.user.id]
    );

    if (botResult.length === 0) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = botResult[0];
    const config = bot.config || {};

    // Always fetch real balance from exchange regardless of capital mode.
    // - Unlimited (0): balance also controls position sizing
    // - Fixed amount: balance is for display, billing tier, and account value only
    const initialCapital = config.initialCapital;
    const isUnlimited = initialCapital === 0 || (typeof initialCapital === 'string' && initialCapital.toLowerCase() === 'unlimited');
    logger.debug('Fetching bot exchange balance', {
      botId,
      tradingMode: config.tradingMode || 'paper',
      isUnlimited,
    });

    const exchange = bot.exchange.toLowerCase();

    // Get API keys for this exchange
    const keysResult = await query(
      `SELECT encrypted_public_key, encrypted_secret_key, validated_at
       FROM exchange_api_keys
       WHERE user_id = $1 AND exchange = $2`,
      [session.user.id, exchange]
    );

    if (keysResult.length === 0) {
      return NextResponse.json(
        {
          error: 'No API keys found for this exchange. Go to Settings → API Keys to add your credentials.',
          exchange,
          available: null,
        },
        { status: 400 }
      );
    }

    // validated_at may be NULL for keys saved before validation was introduced — allow them through
    // and backfill validated_at on successful balance fetch below

    const keys = keysResult[0];

    try {
      // Decrypt API keys
      let publicKey: string;
      let secretKey: string;

      try {
        publicKey = decrypt(keys.encrypted_public_key);
        secretKey = decrypt(keys.encrypted_secret_key);
      } catch (decryptError) {
        // Fallback: try base64 decoding for legacy keys
        try {
          logger.warn('AES decryption failed, trying base64 fallback', {
            botId,
            exchange,
          });
          publicKey = Buffer.from(keys.encrypted_public_key, 'base64').toString('utf-8');
          secretKey = Buffer.from(keys.encrypted_secret_key, 'base64').toString('utf-8');
        } catch (fallbackError) {
          logger.error('Both AES and base64 decryption failed', decryptError instanceof Error ? decryptError : null, {
            botId,
            exchange,
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          return NextResponse.json(
            {
              error: 'Failed to decrypt API keys - they may be corrupted',
              available: null,
            },
            { status: 400 }
          );
        }
      }

      // Keys are pre-validated at save time — connect and fetch balance directly
      const adapter = getExchangeAdapter(exchange);
      await adapter.connect({ publicKey, secretKey });

      let balances;
      try {
        balances = await adapter.getBalances();
      } catch (balanceError) {
        const errorMsg = balanceError instanceof Error ? balanceError.message : String(balanceError);
        logger.error('Failed to fetch balances from exchange', balanceError instanceof Error ? balanceError : null, { botId, exchange, error: errorMsg });
        return NextResponse.json(
          { error: 'Could not retrieve balance from exchange. Try again shortly.', available: null },
          { status: 400 }
        );
      }

      // Build currency balance map using FREE balance only (excludes locked/reserved funds).
      // Must match fetchRealExchangeBalance in fan-out.ts which also uses balance.free.
      const currencyBalances: Record<string, number> = {};
      const currencyTotals: Record<string, number> = {};
      for (const balance of balances) {
        currencyBalances[balance.asset.toUpperCase()] = balance.free;
        currencyTotals[balance.asset.toUpperCase()] = balance.total;
      }

      // Fetch BTC and ETH prices for total account valuation (non-fatal if unavailable)
      let btcPrice = 0;
      let ethPrice = 0;
      try {
        const priceMap = await marketDataAggregator.getMarketData(['BTC/USDT', 'ETH/USDT']);
        btcPrice = priceMap.get('BTC/USDT')?.price ?? 0;
        ethPrice = priceMap.get('ETH/USDT')?.price ?? 0;
      } catch {
        // Market data not yet warm — totalAccountValue will show USDT/USD only
      }

      // USDT/USD cash
      const usdCash = (currencyBalances['USDT'] ?? 0) + (currencyBalances['USD'] ?? 0);

      // BTC and ETH converted to USD — use total holdings for account value display
      const btcValue = (currencyTotals['BTC'] ?? 0) * btcPrice;
      const ethValue = (currencyTotals['ETH'] ?? 0) * ethPrice;

      // Total account value in USD (for tier assignment and billing)
      const totalAccountValue = usdCash + btcValue + ethValue;

      // Trading balance = USDT/USD only (what the bot can actually deploy)
      const realBalance = usdCash;

      // Apply 95% buffer to prevent "insufficient balance" errors
      const bufferedBalance = realBalance * 0.95;

      // Billing tier based on total account value (including crypto holdings)
      const billingTier =
        totalAccountValue >= 50000 ? 'elite' :
        totalAccountValue >= 5000  ? 'live'  :
                                     'starter';

      // Backfill validated_at for keys saved before validation was introduced (fire-and-forget)
      if (!keysResult[0].validated_at) {
        query(
          `UPDATE exchange_api_keys SET validated_at = NOW() WHERE user_id = $1 AND exchange = $2`,
          [session.user.id, exchange]
        ).catch(() => {});
      }

      // Persist billingTier + totalAccountValue to bot config for admin visibility (fire-and-forget)
      query(
        `UPDATE bot_instances
         SET config = config || jsonb_build_object(
           'billingTier', $1::text,
           'totalAccountValue', $2::numeric,
           'accountValueUpdatedAt', $3::text
         )
         WHERE id = $4`,
        [billingTier, totalAccountValue, new Date().toISOString(), botId]
      ).catch(() => {});

      logger.info('Fetched bot exchange balance', {
        botId,
        exchange,
        usdCash,
        btcValue: btcValue.toFixed(2),
        ethValue: ethValue.toFixed(2),
        totalAccountValue: totalAccountValue.toFixed(2),
        billingTier,
        btcPrice,
        ethPrice,
      });

      const env = getEnvironmentConfig();
      const liveMinimum = env.LIVE_TRADING_MIN_BALANCE_USD;
      const minUsdt = env.LIVE_TRADING_MIN_USDT_USD;

      return NextResponse.json({
        available: bufferedBalance,        // Deployable trading balance (95% of USDT/USD)
        real: realBalance,                 // Raw USDT/USD stablecoin balance
        minimum: liveMinimum,             // Minimum total account value (LIVE_TRADING_MIN_BALANCE_USD)
        minUsdt,                          // Minimum USDT/stablecoin to place first trade (LIVE_TRADING_MIN_USDT_USD)
        totalAccountValue,                 // Full account value incl. BTC + ETH holdings
        breakdown: {
          usdCash,                                          // free USD/USDT/USDC only
          btcHoldings: currencyTotals['BTC'] ?? 0,
          btcValue,
          ethHoldings: currencyTotals['ETH'] ?? 0,
          ethValue,
          btcPrice,
          ethPrice,
        },
        billingTier,                       // 'starter' | 'live' | 'elite'
        buffer: 0.95,
        exchange,
        currencyBalances,
        timestamp: new Date().toISOString(),
      });
    } catch (exchangeError) {
      const errorMsg =
        exchangeError instanceof Error ? exchangeError.message : String(exchangeError);

      logger.error('Failed to fetch exchange balance', exchangeError instanceof Error ? exchangeError : null, {
        botId,
        exchange,
        error: errorMsg,
      });

      return NextResponse.json(
        {
          error: 'Failed to fetch balance from exchange',
          details: errorMsg,
          available: null,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error fetching bot balance', error instanceof Error ? error : null);

    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
