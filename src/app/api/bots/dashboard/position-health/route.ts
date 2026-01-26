/**
 * Position Health Dashboard Endpoint
 * GET /api/bots/dashboard/position-health
 *
 * Comprehensive view of all open positions with profit tracking and alert status
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { riskManager } from '@/services/risk/risk-manager';

interface PositionHealth {
  id: string;
  pair: string;
  entryPrice: number;
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
        b.config,
        b.status as bot_status
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

    for (const trade of trades) {
      const entryPrice = parseFloat(String(trade.entry_price));
      const currentProfitPct = parseFloat(String(trade.profit_loss_percent || 0));
      const peakProfitPct = parseFloat(String(trade.peak_profit_percent || 0));
      const ageMinutes = (Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60);
      const currentProfit = parseFloat(String(trade.profit_loss || 0));
      const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
      const regime = botConfig?.regime || 'moderate';

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
      // PARITY WITH /NEXUS: If trade is underwater (current <= 0), skip erosion entirely
      // Underwater trades are handled by underwater timeout, not erosion cap
      // Use effectivePeakPct which may have been corrected above
      const erosionCapFraction = riskManager.getErosionCap(regime, effectivePeakPct); // fraction of peak allowed to erode

      // Skip erosion for underwater trades - produces meaningless huge numbers
      const isUnderwater = currentProfitPct <= 0;
      const erosionAbsolutePct = effectivePeakPct > 0 && !isUnderwater
        ? Math.max(0, effectivePeakPct - currentProfitPct)
        : 0;
      const erosionUsedFraction = effectivePeakPct > 0 && currentProfitPct < effectivePeakPct && !isUnderwater
        ? (effectivePeakPct - currentProfitPct) / effectivePeakPct
        : 0; // If current >= peak OR underwater, no erosion
      const erosionRatioPct = erosionCapFraction > 0 ? Math.max(0, (erosionUsedFraction / erosionCapFraction) * 100) : 0;

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
