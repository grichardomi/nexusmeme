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

      const alerts: string[] = [];
      let status: PositionHealth['status'] = 'healthy';
      let recommendation = '';

      // Erosion calculations (align with position tracker logic)
      const erosionCapFraction = riskManager.getErosionCap(regime, peakProfitPct); // fraction of peak allowed to erode
      const erosionAbsolutePct = peakProfitPct > 0 ? peakProfitPct - currentProfitPct : 0;
      const erosionUsedFraction = peakProfitPct > 0 ? (peakProfitPct - currentProfitPct) / peakProfitPct : 0;
      const erosionRatioPct = erosionCapFraction > 0 ? (erosionUsedFraction / erosionCapFraction) * 100 : 0;

      // Check underwater condition
      if (currentProfitPct < 0 && peakProfitPct <= 0) {
        const underwaterThresholdPct = parseFloat(botConfig?.underwaterExitThresholdPct || '-0.008');
        const minTimeMinutes = parseFloat(botConfig?.underwaterExitMinTimeMinutes || '2');

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
      if (peakProfitPct > 0) {
        if (erosionUsedFraction > erosionCapFraction) {
          alerts.push(`EROSION_ALERT: Peaked +${peakProfitPct.toFixed(2)}%, now ${currentProfitPct.toFixed(2)}% (used ${(erosionUsedFraction * 100).toFixed(2)}% of peak vs cap ${(erosionCapFraction * 100).toFixed(2)}%)`);
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
        peakProfitPct,
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
      summary.peakProfitPct += peakProfitPct;
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
