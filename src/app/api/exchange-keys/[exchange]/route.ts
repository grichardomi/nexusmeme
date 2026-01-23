import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/exchange-keys/:exchange
 * Get bots using a specific exchange
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ exchange: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { exchange } = await params;

    // Validate exchange
    if (!['kraken', 'binance'].includes(exchange)) {
      return NextResponse.json(
        { error: 'Invalid exchange' },
        { status: 400 }
      );
    }

    // Get all bots using this exchange for the current user with open trade counts
    interface BotWithTrades {
      id: string;
      name: string;
      status: string;
      open_trades: number;
    }

    let bots: BotWithTrades[] = [];
    try {
      const queryResults = await query(
        `SELECT
          b.id,
          b.status,
          b.exchange,
          COALESCE(COUNT(CASE WHEN t.status = 'open' THEN 1 END), 0)::INTEGER as open_trades
         FROM bot_instances b
         LEFT JOIN trades t ON b.id = t.bot_instance_id AND t.status = 'open'
         WHERE b.user_id = $1 AND b.exchange = $2
         GROUP BY b.id, b.status, b.exchange
         ORDER BY b.created_at DESC`,
        [session.user.id, exchange]
      );

      // Map results to include name
      bots = (queryResults as any[]).map(bot => ({
        id: bot.id,
        name: `Bot ${bot.id.substring(0, 8)}`,
        status: bot.status,
        open_trades: bot.open_trades || 0
      }));

      logger.info(`[exchange-keys] Result for user ${session.user.id} exchange ${exchange}:`, {
        botCount: bots.length,
        bots
      });
    } catch (queryError) {
      logger.error('Error querying bots for exchange', queryError instanceof Error ? queryError : null);
      // Return empty array on error instead of 500
      bots = [];
    }

    return NextResponse.json({ bots });
  } catch (error) {
    logger.error('Error fetching bots for exchange', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to fetch bots' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/exchange-keys/:exchange
 * Remove API keys for a specific exchange
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ exchange: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { exchange } = await params;

    // Validate exchange
    if (!['kraken', 'binance'].includes(exchange)) {
      return NextResponse.json(
        { error: 'Invalid exchange' },
        { status: 400 }
      );
    }

    // Check if user has a bot using this exchange
    const botUsingExchange = await query(
      `SELECT id FROM bot_instances WHERE user_id = $1 AND exchange = $2`,
      [session.user.id, exchange]
    );

    if (botUsingExchange.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete API keys while a bot is using this exchange. Delete the bot first.' },
        { status: 409 }
      );
    }

    // Delete the API keys
    const result = await query(
      `DELETE FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2 RETURNING id`,
      [session.user.id, exchange]
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'API keys not found' },
        { status: 404 }
      );
    }

    logger.info('Exchange API keys deleted', {
      userId: session.user.id,
      exchange,
    });

    return NextResponse.json({
      message: `${exchange.toUpperCase()} API keys deleted successfully`,
      exchange,
    });
  } catch (error) {
    logger.error('Error deleting exchange keys', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to delete exchange keys' },
      { status: 500 }
    );
  }
}
