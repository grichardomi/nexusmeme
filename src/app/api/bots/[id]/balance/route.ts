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

    const initialCapital = config.initialCapital;
    const isUnlimited = initialCapital === 0 || (typeof initialCapital === 'string' && initialCapital.toLowerCase() === 'unlimited');
    const tradingMode = config.tradingMode || 'paper';
    const exchange = bot.exchange.toLowerCase();

    logger.debug('Fetching bot exchange balance', { botId, tradingMode, isUnlimited });

    // Paper mode with no real capital configured — return simulated balance instead of
    // hitting the exchange (free trial users have no validated keys; no real funds needed)
    if (tradingMode === 'paper' && !isUnlimited && initialCapital > 0) {
      // Check if user is on live_trial — cap displayed balance to TRIAL_MAX_CAPITAL
      const { getEnvironmentConfig: getEnvCfg } = await import('@/config/environment');
      const trialMax = getEnvCfg().TRIAL_MAX_CAPITAL;
      const subRow = await query<{ plan_tier: string }>(
        `SELECT plan_tier FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [session.user.id]
      );
      const planTier = subRow[0]?.plan_tier ?? 'live_trial';
      const isTrialUser = planTier === 'live_trial';
      const effectiveCapital = isTrialUser ? Math.min(initialCapital, trialMax) : initialCapital;
      const trialCapped = isTrialUser && initialCapital > trialMax;

      const simulated = effectiveCapital * 0.95;
      return NextResponse.json({
        available: simulated,
        real: effectiveCapital,
        minimum: 0,
        minUsdt: 0,
        totalAccountValue: effectiveCapital,
        breakdown: { usdCash: effectiveCapital, btcHoldings: 0, btcValue: 0, ethHoldings: 0, ethValue: 0, btcPrice: 0, ethPrice: 0 },
        billingTier: effectiveCapital >= 50000 ? 'elite' : effectiveCapital >= 5000 ? 'live' : 'starter',
        buffer: 0.95,
        exchange,
        currencyBalances: { USDT: effectiveCapital },
        simulated: true,
        trialCapped,
        trialMaxCapital: isTrialUser ? trialMax : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Get API keys for this exchange
    const keysResult = await query(
      `SELECT encrypted_public_key, encrypted_secret_key, validated_at, created_at
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

    const keys = keysResult[0];

    // Block exchange call for unvalidated keys — prevents hammering the exchange with
    // bad credentials on every 10s balance refresh and triggering circuit breakers.
    // Exception: allow through if validated_at is NULL (keys saved before validation
    // was introduced) — the connect() attempt below will backfill validated_at on success.
    // Keys that have actively failed validation (validated_at = null AND created > 1 day ago)
    // are likely invalid and should not be retried automatically.
    const keyAgeHours = keys.validated_at ? 0 :
      (Date.now() - new Date(keys.created_at || 0).getTime()) / 3_600_000;
    if (!keys.validated_at && keyAgeHours > 24) {
      return NextResponse.json(
        {
          error: 'API keys have not been validated. Go to Settings → API Keys and re-save your credentials.',
          exchange,
          available: null,
          requiresValidation: true,
        },
        { status: 400 }
      );
    }

    try {
      // Decrypt API keys
      let publicKey: string;
      let secretKey: string;

      try {
        publicKey = decrypt(keys.encrypted_public_key);
        secretKey = decrypt(keys.encrypted_secret_key);
      } catch (decryptError) {
        logger.error('AES decryption failed for API keys — re-save keys in Settings', decryptError instanceof Error ? decryptError : null, {
          botId,
          exchange,
        });
        return NextResponse.json(
          {
            error: 'Failed to decrypt API keys — please re-save your API keys in Settings',
            available: null,
          },
          { status: 400 }
        );
      }

      // Connect to exchange — wrap separately so connection errors return 400, not 500
      const adapter = getExchangeAdapter(exchange);
      try {
        await adapter.connect({ publicKey, secretKey });
      } catch (connectError) {
        const msg = connectError instanceof Error ? connectError.message : String(connectError);
        logger.error('Exchange adapter connect failed', connectError instanceof Error ? connectError : null, { botId, exchange, error: msg });
        return NextResponse.json(
          { error: 'Could not connect to exchange. Check your API keys in Settings.', available: null },
          { status: 400 }
        );
      }

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
