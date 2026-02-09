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

      // DOLLAR-BASED erosion (matches actual exit trigger in position-tracker)
      // The orchestrator exits when: erosionUsed$ > totalCost × erosionCapPct
      // UI should reflect how close the trade is to ACTUALLY being closed
      const regime = trade.regime || 'moderate';
      const env = getEnvironmentConfig();
      const totalCost = entryPrice * quantity;

      // Dollar amounts
      const peakProfitDollars = (peakProfitPct / 100) * totalCost;
      const currentProfitDollars = (currentProfitPct / 100) * totalCost;
      const erosionDollars = peakProfitPct > 0 ? Math.max(0, peakProfitDollars - currentProfitDollars) : 0;

      // Absolute erosion cap (matches position-tracker.ts:509-516)
      const erosionCapsByRegime: Record<string, number> = {
        choppy: env.EROSION_CAP_CHOPPY,
        weak: env.EROSION_CAP_WEAK,
        moderate: env.EROSION_CAP_MODERATE,
        strong: env.EROSION_CAP_STRONG,
      };
      const erosionCapPct = erosionCapsByRegime[regime.toLowerCase()] || env.EROSION_CAP_MODERATE;
      const erosionCapDollars = totalCost * erosionCapPct;

      // erosionRatioPct = how close to the ACTUAL exit trigger (100% = will close)
      const erosionRatioPct = erosionCapDollars > 0 ? (erosionDollars / erosionCapDollars) * 100 : 0;

      // Peak-relative for display context
      const erosionRelativePct = peakProfitPct > 0
        ? ((peakProfitPct - currentProfitPct) / peakProfitPct) * 100
        : 0;

      let healthStatus: 'HEALTHY' | 'CAUTION' | 'RISK' | 'ALERT' = 'HEALTHY';
      let alertMessage = '';
      const ageMinutes = (Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60);

      if (erosionRatioPct > 100) {
        healthStatus = 'ALERT';
        alertMessage = `Erosion $${erosionDollars.toFixed(2)} exceeds cap $${erosionCapDollars.toFixed(2)}`;
      } else if (erosionRatioPct > 70) {
        healthStatus = 'RISK';
        alertMessage = `Erosion $${erosionDollars.toFixed(2)} / $${erosionCapDollars.toFixed(2)} cap`;
      } else if (currentProfitPct < -3) {
        healthStatus = 'ALERT';
        alertMessage = `Loss ${currentProfitPct.toFixed(1)}%`;
      } else if (currentProfitPct < -1) {
        healthStatus = 'RISK';
      } else if (erosionRatioPct > 30) {
        healthStatus = 'CAUTION';
        if (ageMinutes > 240) {
          alertMessage = `Long hold: ${Math.round(ageMinutes / 60)}h ${Math.round(ageMinutes % 60)}m`;
        }
      } else if (currentProfitPct < 0) {
        healthStatus = 'CAUTION';
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
        erosionCapDollars: erosionCapDollars.toFixed(2),
        erosionDollars: erosionDollars.toFixed(2),
        erosionCap: (erosionCapPct * 100).toFixed(0),
        healthStatus,
        alertMessage,
        regime,
        holdTimeMinutes: Math.round(ageMinutes),
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
