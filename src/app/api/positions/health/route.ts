import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/positions/health
 * Returns position health metrics for all open trades
 * Calculates health status (HEALTHY/CAUTION/RISK/ALERT) based on erosion
 * MONITORING ONLY - does not affect trade execution
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');

    // Fetch open trades for this user
    const openTrades = await query(
      `SELECT
        t.id,
        t.bot_instance_id,
        t.pair,
        t.entry_price,
        t.entry_time,
        t.peak_profit_percent as peak_profit_pct,
        b.config ->> 'regime' as regime
       FROM trades t
       INNER JOIN bot_instances b ON t.bot_instance_id = b.id
       WHERE b.user_id = $1 AND t.status = 'open' ${botId ? 'AND t.bot_instance_id = $2' : ''}
       ORDER BY t.entry_time DESC`,
      botId ? [session.user.id, botId] : [session.user.id]
    );

    if (!openTrades || openTrades.length === 0) {
      return NextResponse.json({ positions: [], count: 0 });
    }

    // Get market prices for current P&L calculation
    const pairs = [...new Set(openTrades.map((t: any) => t.pair))];
    let priceMap = new Map<string, number>();

    try {
      const pricesResult = await query(
        `SELECT pair, last_price FROM market_data WHERE pair = ANY($1)`,
        [pairs]
      );
      priceMap = new Map(
        (pricesResult || []).map((p: any) => [p.pair, parseFloat(p.last_price)])
      );
    } catch (priceError) {
      // If market_data table doesn't exist, fall back to using entry price
      logger.warn('Market data fetch failed, using entry prices as fallback', {
        pairs,
        error: priceError instanceof Error ? priceError.message : String(priceError),
      });
    }

    // Calculate health status for each position
    const positions = openTrades.map((trade: any) => {
      const currentPrice = priceMap.get(trade.pair) || parseFloat(trade.entry_price);
      const entryPrice = parseFloat(trade.entry_price);
      const currentProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Get peak profit (if never recorded, current is peak)
      const peakProfitPct = trade.peak_profit_pct ? parseFloat(trade.peak_profit_pct) : currentProfitPct;

      // Calculate erosion in percentage points (peak% - current%)
      const erosionPct = peakProfitPct > 0 ? peakProfitPct - currentProfitPct : 0;

      // Regime-based erosion cap in percentage points
      const regime = trade.regime || 'moderate';
      const erosionCapPct = regime === 'choppy' ? 0.6 : 0.75;

      // Health status determination
      // erosionRatioPct = how much erosion we've used relative to our cap (as %)
      // If erosionCapPct = 0.75% and erosionPct = 0.3%, then ratio = (0.3/0.75)*100 = 40%
      const erosionRatioPct = erosionCapPct > 0 ? (erosionPct / erosionCapPct) * 100 : 0;
      let healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT' = 'HEALTHY';
      let alertMessage = '';

      if (erosionRatioPct > 100) {
        healthStatus = 'ALERT';
        alertMessage = `EROSION EXCEEDED: ${erosionRatioPct.toFixed(1)}% (cap: ${erosionCapPct.toFixed(2)}%)`;
      } else if (erosionRatioPct > 70) {
        healthStatus = 'RISK';
        alertMessage = `High erosion: ${erosionRatioPct.toFixed(1)}% of ${erosionCapPct.toFixed(2)}% cap`;
      } else if (erosionRatioPct > 30) {
        healthStatus = 'CAUTION';
        const ageMinutes = (Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60);
        if (ageMinutes > 240) {
          alertMessage = `Long hold: ${Math.round(ageMinutes)}min`;
        }
      }

      return {
        tradeId: trade.id,
        pair: trade.pair,
        entryPrice: entryPrice.toFixed(2),
        currentPrice: currentPrice.toFixed(2),
        peakProfitPct: peakProfitPct.toFixed(2),
        currentProfitPct: currentProfitPct.toFixed(2),
        erosionPct: erosionPct.toFixed(4),
        erosionRatioPct: erosionRatioPct.toFixed(1),
        erosionCap: erosionCapPct.toFixed(1),
        healthStatus,
        alertMessage,
        regime,
        holdTimeMinutes: Math.round((Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60)),
      };
    });

    return NextResponse.json({ positions, count: positions.length });
  } catch (error) {
    logger.error('Error fetching position health', error instanceof Error ? error : null, {
      botId: new URL(request.url).searchParams.get('botId'),
      userId: (await getServerSession(authOptions))?.user?.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    // Return empty positions instead of 500 - better UX for new bots with no trades
    return NextResponse.json({ positions: [], count: 0 });
  }
}
