import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';
import { getExchangeAdapter } from '@/services/exchanges/singleton';

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

    // Check if unlimited capital (0 = unlimited, uses real exchange balance)
    // Backward compatible: also accept "unlimited" string (legacy format)
    const initialCapital = config.initialCapital;
    const isUnlimited = initialCapital === 0 || (typeof initialCapital === 'string' && initialCapital.toLowerCase() === 'unlimited');

    if (!isUnlimited) {
      return NextResponse.json(
        { error: 'Balance only available for unlimited capital bots' },
        { status: 400 }
      );
    }

    // For unlimited capital, always fetch REAL balance from exchange
    // This applies to BOTH paper and live trading modes
    const tradingMode = config.tradingMode || 'paper';
    logger.debug('Fetching balance for unlimited capital bot', {
      botId,
      tradingMode,
      note: 'Unlimited (0 or "unlimited") means use actual exchange balance regardless of mode',
    });

    const exchange = bot.exchange.toLowerCase();

    // Get API keys for this exchange
    const keysResult = await query(
      `SELECT encrypted_public_key, encrypted_secret_key
       FROM exchange_api_keys
       WHERE user_id = $1 AND exchange = $2`,
      [session.user.id, exchange]
    );

    if (keysResult.length === 0) {
      logger.warn('No API keys configured for exchange', {
        userId: session.user.id,
        botId,
        exchange,
      });
      return NextResponse.json(
        {
          error: 'No API keys configured for this exchange',
          exchange,
          available: null,
        },
        { status: 400 }
      );
    }

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

      // Connect to exchange and fetch balance
      const adapter = getExchangeAdapter(exchange);

      try {
        await adapter.connect({
          publicKey,
          secretKey,
        });
      } catch (connectError) {
        const errorMsg = connectError instanceof Error ? connectError.message : String(connectError);
        logger.error('Failed to connect to exchange adapter', connectError instanceof Error ? connectError : null, {
          botId,
          exchange,
          error: errorMsg,
        });
        return NextResponse.json(
          {
            error: `Failed to authenticate with ${exchange}: ${errorMsg}`,
            available: null,
          },
          { status: 400 }
        );
      }

      // Get all balances
      let balances;
      try {
        balances = await adapter.getBalances();
      } catch (balanceError) {
        const errorMsg = balanceError instanceof Error ? balanceError.message : String(balanceError);
        logger.error('Failed to fetch balances from exchange', balanceError instanceof Error ? balanceError : null, {
          botId,
          exchange,
          error: errorMsg,
        });
        return NextResponse.json(
          {
            error: `Failed to fetch balance from ${exchange}: ${errorMsg}`,
            available: null,
          },
          { status: 400 }
        );
      }

      // Calculate total USDT/USD value
      let realBalance = 0;
      const currencyBalances: Record<string, number> = {};

      for (const balance of balances) {
        const asset = balance.asset.toUpperCase();
        currencyBalances[asset] = balance.total;

        // Sum USD and USDT
        if (asset === 'USD' || asset === 'USDT') {
          realBalance += balance.total;
        }
      }

      // Apply 95% buffer to prevent "insufficient balance" errors
      // from price fluctuations and balance changes between API calls
      const bufferedBalance = realBalance * 0.95;

      logger.info('Fetched bot exchange balance with 95% buffer', {
        botId,
        exchange,
        realBalance,
        bufferedBalance,
        buffer: '5%',
        currencyCount: balances.length,
      });

      return NextResponse.json({
        available: bufferedBalance,
        real: realBalance,
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
