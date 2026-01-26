/**
 * Position Alerts Monitoring Endpoint
 * GET /api/bots/trades/alerts
 *
 * Returns current UNDERWATER_ALERT and EROSION_ALERT conditions
 * Allows filtering by pair, severity, or alert type
 *
 * Query parameters:
 * - type: "UNDERWATER_ALERT" | "EROSION_ALERT" (optional)
 * - pair: "ETH/USD" (optional)
 * - severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" (optional)
 * - limit: number (default 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { riskManager } from '@/services/risk/risk-manager';

interface PositionAlert {
  type: 'UNDERWATER_ALERT' | 'EROSION_ALERT';
  tradeId: string;
  pair: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  currentProfitPct: number;
  peakProfitPct: number;
  threshold: number;
  ageMinutes: number;
}

function getUnderWaterSeverity(currentLoss: number, threshold: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const lossGap = Math.abs(currentLoss) - Math.abs(threshold);

  if (lossGap > Math.abs(threshold) * 2) return 'CRITICAL';
  if (lossGap > Math.abs(threshold) * 1) return 'HIGH';
  if (lossGap > Math.abs(threshold) * 0.5) return 'MEDIUM';
  return 'LOW';
}

function getErosionSeverity(erosionUsed: number, erosionCap: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const ratio = erosionUsed / erosionCap;

  if (ratio > 2.0) return 'CRITICAL';
  if (ratio > 1.5) return 'HIGH';
  if (ratio > 1.2) return 'MEDIUM';
  return 'LOW';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterType = searchParams.get('type');
    const filterPair = searchParams.get('pair');
    const filterSeverity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '100');

    logger.debug('Fetching position alerts', {
      filterType,
      filterPair,
      filterSeverity,
      limit,
    });

    // Fetch all open trades
    const openTrades = await query<any>(
      `SELECT
        t.id,
        t.pair,
        t.price as entry_price,
        t.profit_loss_percent,
        t.peak_profit_percent,
        t.entry_time,
        b.config
      FROM trades t
      INNER JOIN bot_instances b ON t.bot_instance_id = b.id
      WHERE t.status = 'open'
      ORDER BY t.entry_time ASC`
    );

    const alerts: PositionAlert[] = [];

    for (const trade of openTrades) {
      const currentProfitPct = parseFloat(String(trade.profit_loss_percent || 0));
      const peakProfitPct = parseFloat(String(trade.peak_profit_percent || 0));
      const ageMinutes = (Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60);
      const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
      const regime = botConfig?.regime || 'moderate';

      // Check for underwater condition
      if (currentProfitPct < 0 && peakProfitPct <= 0) {
        const underwaterThresholdPct = parseFloat(botConfig?.underwaterExitThresholdPct || '-0.008');
        const minTimeMinutes = parseFloat(botConfig?.underwaterExitMinTimeMinutes || '15');

        if (ageMinutes >= minTimeMinutes && currentProfitPct < underwaterThresholdPct * 100) {
          const severity = getUnderWaterSeverity(currentProfitPct, underwaterThresholdPct * 100);
          const alert: PositionAlert = {
            type: 'UNDERWATER_ALERT',
            tradeId: trade.id,
            pair: trade.pair,
            severity,
            message: `Trade underwater: ${currentProfitPct.toFixed(2)}% (threshold: ${(underwaterThresholdPct * 100).toFixed(1)}%)`,
            currentProfitPct,
            peakProfitPct,
            threshold: underwaterThresholdPct * 100,
            ageMinutes,
          };
          alerts.push(alert);
        }
      }

      // Check for erosion condition
      // PARITY FIX: Use fraction-based comparison (not absolute percentage points)
      // erosionUsedFraction = how much of peak has eroded (0-1)
      // erosionCapFraction = how much erosion is allowed (0-1)
      if (peakProfitPct > 0 && currentProfitPct < peakProfitPct) {
        const erosionUsedFraction = (peakProfitPct - currentProfitPct) / peakProfitPct;
        const erosionCapFraction = riskManager.getErosionCap(regime, peakProfitPct);

        if (erosionUsedFraction > erosionCapFraction) {
          const severity = getErosionSeverity(erosionUsedFraction, erosionCapFraction);
          const alert: PositionAlert = {
            type: 'EROSION_ALERT',
            tradeId: trade.id,
            pair: trade.pair,
            severity,
            message: `Profit erosion: peaked +${peakProfitPct.toFixed(2)}%, now ${currentProfitPct.toFixed(2)}% (used ${(erosionUsedFraction * 100).toFixed(1)}% of peak vs cap ${(erosionCapFraction * 100).toFixed(1)}%)`,
            currentProfitPct,
            peakProfitPct,
            threshold: erosionCapFraction * 100,
            ageMinutes,
          };
          alerts.push(alert);
        }
      }
    }

    // Apply filters
    let filtered = alerts;
    if (filterType) {
      filtered = filtered.filter(a => a.type === filterType);
    }
    if (filterPair) {
      filtered = filtered.filter(a => a.pair === filterPair);
    }
    if (filterSeverity) {
      filtered = filtered.filter(a => a.severity === filterSeverity);
    }

    // Apply limit
    filtered = filtered.slice(0, limit);

    // Group by severity
    const bySeverity = {
      CRITICAL: filtered.filter(a => a.severity === 'CRITICAL').length,
      HIGH: filtered.filter(a => a.severity === 'HIGH').length,
      MEDIUM: filtered.filter(a => a.severity === 'MEDIUM').length,
      LOW: filtered.filter(a => a.severity === 'LOW').length,
    };

    const byType = {
      UNDERWATER_ALERT: filtered.filter(a => a.type === 'UNDERWATER_ALERT').length,
      EROSION_ALERT: filtered.filter(a => a.type === 'EROSION_ALERT').length,
    };

    return NextResponse.json({
      success: true,
      summary: {
        totalAlerts: filtered.length,
        totalOpenTrades: openTrades.length,
        bySeverity,
        byType,
      },
      alerts: filtered,
    });
  } catch (error) {
    logger.error('Position alerts endpoint error', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
