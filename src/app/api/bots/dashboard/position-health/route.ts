/**
 * Position Health Dashboard Endpoint
 * GET /api/bots/dashboard/position-health
 *
 * Comprehensive view of all open positions with profit tracking and alert status
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig, getExchangeTakerFee } from '@/config/environment';
import { marketDataAggregator } from '@/services/market-data/aggregator';

/**
 * Parse entry_time correctly from PostgreSQL 'timestamp without time zone'
 * CRITICAL: JavaScript's Date() treats timestamps without timezone as local time.
 * We must append 'Z' to force correct UTC interpretation.
 */
function parseEntryTimeUTC(entryTime: any): number {
  if (typeof entryTime === 'number') return entryTime;
  if (entryTime instanceof Date) {
    // CRITICAL: pg driver converts 'timestamp without time zone' to local Date
    // DB stores UTC values but pg interprets as local time
    // Extract LOCAL components (which match the original DB values) and build UTC timestamp
    return Date.UTC(
      entryTime.getFullYear(),
      entryTime.getMonth(),
      entryTime.getDate(),
      entryTime.getHours(),
      entryTime.getMinutes(),
      entryTime.getSeconds(),
      entryTime.getMilliseconds()
    );
  }
  const timeStr = String(entryTime);
  if (!timeStr.includes('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(timeStr.replace(' ', 'T') + 'Z').getTime();
  }
  return new Date(entryTime).getTime();
}

interface PositionHealth {
  id: string;
  pair: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  currentProfit: number;
  currentProfitPct: number;
  peakProfitPct: number;
  ageMinutes: number;
  status: 'healthy' | 'warning' | 'critical' | 'underwater';
  alerts: string[];
  recommendation: string;
  erosionCapFraction: number;
  erosionUsedFraction: number;
  erosionRatioPct: number;
  erosionAbsolutePct: number;
  regime: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeClosed = searchParams.get('includeClosed') === 'true';

    logger.debug('Fetching position health dashboard');

    // Fetch all open (and optionally closed) trades
    let query_sql = `
      SELECT
        t.id,
        t.pair,
        t.price as entry_price,
        t.amount as quantity,
        t.profit_loss,
        t.profit_loss_percent,
        t.peak_profit_percent,
        t.entry_time,
        t.exit_time,
        t.status,
        t.fee,
        b.config,
        b.status as bot_status,
        b.exchange
      FROM trades t
      INNER JOIN bot_instances b ON t.bot_instance_id = b.id
      WHERE t.status = 'open'
    `;

    if (includeClosed) {
      query_sql = query_sql.replace("WHERE t.status = 'open'", "WHERE t.status IN ('open', 'closed')");
    }

    query_sql += ` ORDER BY t.entry_time ASC`;

    const trades = await query<any>(query_sql);

    const positions: PositionHealth[] = [];
    let summary = {
      totalPositions: trades.length,
      healthy: 0,
      warning: 0,
      critical: 0,
      underwater: 0,
      totalProfitPct: 0,
      peakProfitPct: 0,
    };

    // Fetch live market prices for all unique pairs
    const uniquePairs = Array.from(new Set(trades.map((t: any) => t.pair)));
    let marketPrices = new Map<string, number>();

    if (uniquePairs.length > 0) {
      try {
        const marketData = await marketDataAggregator.getMarketData(uniquePairs);
        for (const [pair, data] of marketData.entries()) {
          marketPrices.set(pair, data.price);
        }
        logger.debug('Position health: fetched live prices', {
          pairs: uniquePairs,
          pricesFound: marketPrices.size,
        });
      } catch (priceError) {
        logger.warn('Position health: failed to fetch live prices, using stored values', {
          error: priceError instanceof Error ? priceError.message : String(priceError),
        });
      }
    }

    for (const trade of trades) {
      const entryPrice = parseFloat(String(trade.entry_price));
      const quantity = parseFloat(String(trade.quantity || 0));
      const tradeExchange = trade.exchange || 'kraken';

      // Use live price if available, otherwise fall back to entry price (which means 0% P&L)
      const currentPrice = marketPrices.get(trade.pair) || entryPrice;

      // Calculate NET P&L (gross - entry fee ONLY)
      // Exit fee is NOT deducted until trade actually closes — best practice per exchange standards
      const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const entryFeeDollars = trade.fee ? parseFloat(String(trade.fee)) : (entryPrice * quantity * getExchangeTakerFee(tradeExchange));
      const entryFeePct = quantity > 0 && entryPrice > 0 ? (entryFeeDollars / (entryPrice * quantity)) * 100 : 0;
      const currentProfitPct = grossProfitPct - entryFeePct;
      const currentProfit = (currentPrice - entryPrice) * quantity - entryFeeDollars;

      const peakProfitPct = parseFloat(String(trade.peak_profit_percent || 0));
      const ageMinutes = (Date.now() - parseEntryTimeUTC(trade.entry_time)) / (1000 * 60);
      const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
      const regime = botConfig?.regime || 'moderate';

      // Update database with fresh GROSS P&L values (async, don't block response)
      // CRITICAL: Write GROSS P&L, NOT NET. The trades API deducts fees when reading.
      // Writing NET here caused DOUBLE FEE DEDUCTION (fees subtracted here + again in /api/trades).
      if (marketPrices.has(trade.pair)) {
        const grossProfit = (currentPrice - entryPrice) * quantity;
        query(
          `UPDATE trades SET profit_loss = $1, profit_loss_percent = $2 WHERE id = $3`,
          [grossProfit, grossProfitPct, trade.id]
        ).catch((updateErr) => {
          logger.debug('Position health: failed to update P&L in DB', {
            tradeId: trade.id,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          });
        });
      }

      // Fix stale peak: if current > peak and current is positive, update peak in DB
      // This catches cases where the orchestrator's DB update may have failed
      let effectivePeakPct = peakProfitPct;
      if (currentProfitPct > 0 && peakProfitPct < currentProfitPct) {
        effectivePeakPct = currentProfitPct;
        logger.info('Position health: fixing stale peak (current > stored peak)', {
          tradeId: trade.id,
          pair: trade.pair,
          oldPeak: peakProfitPct.toFixed(4),
          newPeak: currentProfitPct.toFixed(4),
        });
        // Update the database
        try {
          await query(
            `UPDATE trades SET peak_profit_percent = $1, peak_profit_recorded_at = NOW() WHERE id = $2`,
            [currentProfitPct, trade.id]
          );
        } catch (updateErr) {
          logger.warn('Failed to fix stale peak in DB', {
            tradeId: trade.id,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          });
        }
      }

      const alerts: string[] = [];
      let status: PositionHealth['status'] = 'healthy';
      let recommendation = '';

      // Erosion calculations (align with position tracker logic)
      // IMPORTANT: If current >= peak, erosion is 0 (no erosion has occurred, profit increased)
      // Use effectivePeakPct which may have been corrected above
      // Use PEAK-RELATIVE erosion threshold for dashboard (fraction of peak allowed to erode)
      // Absolute-of-cost cap is used in execution; for UI health, compare against peak-relative threshold
      const env = getEnvironmentConfig();
      const erosionCapFraction = env.EROSION_PEAK_RELATIVE_THRESHOLD; // e.g., 0.50 = 50%

      // Calculate erosion when position HAD profit (peak > 0) and has since dropped
      // This includes cases where position went underwater after having profit - that's meaningful erosion!
      // Only skip erosion if peak <= 0 (position never had profit to erode)

      // CRITICAL FIX: Explicit guard - if current >= peak, erosion MUST be 0
      // This prevents floating point comparison issues and stale data bugs
      let erosionAbsolutePct = 0;
      let erosionUsedFraction = 0;
      let erosionRatioPct = 0;

      if (effectivePeakPct > 0 && currentProfitPct < effectivePeakPct) {
        // Position has eroded from peak - calculate how much
        erosionAbsolutePct = Math.max(0, effectivePeakPct - currentProfitPct);
        erosionUsedFraction = erosionAbsolutePct / effectivePeakPct;

        // Calculate ratio of erosion cap used (capped at 100% for display sanity)
        if (erosionCapFraction > 0) {
          erosionRatioPct = Math.min(100, Math.max(0, (erosionUsedFraction / erosionCapFraction) * 100));
        }

        logger.debug('Position erosion calculated', {
          tradeId: trade.id,
          pair: trade.pair,
          currentProfitPct: currentProfitPct.toFixed(4),
          effectivePeakPct: effectivePeakPct.toFixed(4),
          erosionAbsolutePct: erosionAbsolutePct.toFixed(4),
          erosionUsedFraction: (erosionUsedFraction * 100).toFixed(2) + '%',
          erosionCapFraction: (erosionCapFraction * 100).toFixed(2) + '%',
          erosionRatioPct: erosionRatioPct.toFixed(2) + '%',
        });
      } else if (effectivePeakPct > 0 && currentProfitPct >= effectivePeakPct) {
        // Current >= Peak means NO erosion (profit increasing or stable)
        logger.debug('Position at or above peak - no erosion', {
          tradeId: trade.id,
          pair: trade.pair,
          currentProfitPct: currentProfitPct.toFixed(4),
          effectivePeakPct: effectivePeakPct.toFixed(4),
        });
      }

      // Check underwater condition
      if (currentProfitPct < 0 && effectivePeakPct <= 0) {
        const underwaterThresholdPct = parseFloat(botConfig?.underwaterExitThresholdPct || '-0.008');
        const minTimeMinutes = parseFloat(botConfig?.underwaterExitMinTimeMinutes || '15');

        if (currentProfitPct < underwaterThresholdPct * 100) {
          alerts.push(`UNDERWATER_ALERT: ${currentProfitPct.toFixed(2)}% (threshold: ${(underwaterThresholdPct * 100).toFixed(1)}%)`);

          if (ageMinutes >= minTimeMinutes) {
            status = 'critical';
            recommendation = `FORCE CLOSE: Trade is ${currentProfitPct.toFixed(2)}% underwater and has been open ${ageMinutes.toFixed(0)}m`;
          } else {
            status = 'warning';
            recommendation = `Will auto-exit in ${(minTimeMinutes - ageMinutes).toFixed(0)}m if underwater condition persists`;
          }
        }
      }

      // Check erosion condition using cap fraction (percentage-of-peak model)
      if (effectivePeakPct > 0) {
        if (erosionUsedFraction > erosionCapFraction) {
          alerts.push(`EROSION_ALERT: Peaked +${effectivePeakPct.toFixed(2)}%, now ${currentProfitPct.toFixed(2)}% (used ${(erosionUsedFraction * 100).toFixed(2)}% of peak vs cap ${(erosionCapFraction * 100).toFixed(2)}%)`);
          status = 'critical';
          recommendation = `CLOSE NOW: Erosion ${(erosionRatioPct).toFixed(1)}% of cap`;
        } else if (erosionUsedFraction > erosionCapFraction * 0.8) {
          alerts.push(`EROSION_WARNING: ${erosionRatioPct.toFixed(1)}% of cap used`);
          status = status === 'critical' ? 'critical' : 'warning';
          recommendation = `Monitor erosion - approaching exit cap`;
        }
      }

      // Check profit target
      if (currentProfitPct > 10) {
        status = status === 'critical' ? 'critical' : 'healthy';
        recommendation = recommendation || `Position performing well at +${currentProfitPct.toFixed(2)}%`;
      } else if (currentProfitPct < 0 && status === 'healthy') {
        status = 'warning';
        recommendation = `Slightly underwater at ${currentProfitPct.toFixed(2)}%`;
      }

      const position: PositionHealth = {
        id: trade.id,
        pair: trade.pair,
        entryPrice,
        currentPrice,
        quantity,
        currentProfit,
        currentProfitPct,
        peakProfitPct: effectivePeakPct,
        ageMinutes,
        status,
        alerts,
        recommendation,
        erosionCapFraction,
        erosionUsedFraction,
        erosionRatioPct,
        erosionAbsolutePct,
        regime,
      };

      positions.push(position);

      // Update summary
      summary.totalProfitPct += currentProfitPct;
      summary.peakProfitPct += effectivePeakPct;
      if (status === 'healthy') summary.healthy++;
      else if (status === 'warning') summary.warning++;
      else if (status === 'critical') summary.critical++;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pricesLive: marketPrices.size > 0,
      summary,
      positions,
    });
  } catch (error) {
    logger.error('Position health dashboard error', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
