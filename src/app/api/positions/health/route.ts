import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig, getExchangeTakerFee } from '@/config/environment';

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
        t.amount as quantity,
        t.entry_time,
        t.fee,
        t.peak_profit_percent as peak_profit_pct,
        b.config ->> 'regime' as regime,
        b.exchange
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
      const quantity = parseFloat(trade.quantity || '0');
      const tradeExchange = trade.exchange || 'kraken';

      // Calculate NET profit (gross - round-trip fees)
      const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const entryFeeDollars = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getExchangeTakerFee(tradeExchange));
      const exitFeeDollars = currentPrice * quantity * getExchangeTakerFee(tradeExchange);
      const totalFeeDollars = entryFeeDollars + exitFeeDollars;
      const totalFeePct = quantity > 0 && entryPrice > 0 ? (totalFeeDollars / (entryPrice * quantity)) * 100 : 0;
      const currentProfitPct = grossProfitPct - totalFeePct;

      // Get peak profit (if never recorded, current is peak)
      const peakProfitPct = trade.peak_profit_pct ? parseFloat(trade.peak_profit_pct) : currentProfitPct;

      // PEAK-RELATIVE erosion (matches position tracker logic)
      // erosionRelativePct = how much of the peak profit has been eroded (0-100%)
      // Example: peak 0.16%, current 0.11% → (0.16-0.11)/0.16 = 31.25% of peak eroded
      const regime = trade.regime || 'moderate';
      const env = getEnvironmentConfig();
      const peakRelativeThreshold = env.EROSION_PEAK_RELATIVE_THRESHOLD; // 0.30 = 30%

      const erosionRelativePct = peakProfitPct > 0
        ? ((peakProfitPct - currentProfitPct) / peakProfitPct) * 100
        : 0;

      // erosionRatioPct = how close we are to the threshold (100% = at threshold)
      // If threshold is 30% and we eroded 31.25%, then (31.25/30)*100 = 104.2% → ALERT
      const thresholdPct = peakRelativeThreshold * 100; // 30
      const erosionRatioPct = thresholdPct > 0 ? (erosionRelativePct / thresholdPct) * 100 : 0;

      let healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT' = 'HEALTHY';
      let alertMessage = '';

      if (erosionRatioPct > 100) {
        healthStatus = 'ALERT';
        alertMessage = `Peak eroded ${erosionRelativePct.toFixed(1)}% (threshold: ${thresholdPct.toFixed(0)}%)`;
      } else if (erosionRatioPct > 70) {
        healthStatus = 'RISK';
        alertMessage = `Erosion ${erosionRelativePct.toFixed(1)}% of ${thresholdPct.toFixed(0)}% threshold`;
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
        erosionPct: erosionRelativePct.toFixed(1),
        erosionRatioPct: erosionRatioPct.toFixed(1),
        erosionCap: thresholdPct.toFixed(0),
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
