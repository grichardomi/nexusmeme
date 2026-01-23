/**
 * Position Alerts Service
 * Monitors for underwater and erosion events and triggers alerts
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { riskManager } from '@/services/risk/risk-manager';

export interface PositionAlert {
  type: 'UNDERWATER_ALERT' | 'EROSION_ALERT';
  tradeId: string;
  pair: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  currentProfitPct: number;
  peakProfitPct: number;
  threshold: number;
  ageMinutes: number;
  timestamp: Date;
}

class PositionAlertsService {
  private alerts: PositionAlert[] = [];
  private alertHandlers: Array<(alert: PositionAlert) => Promise<void>> = [];

  /**
   * Register an alert handler (e.g., webhook, email, Slack)
   */
  onAlert(handler: (alert: PositionAlert) => Promise<void>): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Check all open trades for underwater and erosion conditions
   */
  async checkAllPositions(): Promise<PositionAlert[]> {
    try {
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

      const newAlerts: PositionAlert[] = [];

      for (const trade of openTrades) {
        const currentProfitPct = parseFloat(String(trade.profit_loss_percent || 0));
        const peakProfitPct = parseFloat(String(trade.peak_profit_percent || 0));
        const ageMinutes = (Date.now() - new Date(trade.entry_time).getTime()) / (1000 * 60);
        const botConfig = typeof trade.config === 'string' ? JSON.parse(trade.config) : trade.config;
        const regime = botConfig?.regime || 'moderate';

        // Check for underwater condition
        if (currentProfitPct < 0 && peakProfitPct <= 0) {
          const underwaterThresholdPct = parseFloat(botConfig?.underwaterExitThresholdPct || '-0.008');
          const minTimeMinutes = parseFloat(botConfig?.underwaterExitMinTimeMinutes || '2');

          // Only alert if old enough to be actionable
          if (ageMinutes >= minTimeMinutes) {
            if (currentProfitPct < underwaterThresholdPct * 100) {
              const severity = this.getUnderWaterSeverity(currentProfitPct, underwaterThresholdPct * 100);
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
                timestamp: new Date(),
              };
              newAlerts.push(alert);
            }
          }
        }

        // Check for erosion condition (peak was positive but eroding)
        if (peakProfitPct > 0) {
          const erosionAbsolute = peakProfitPct - currentProfitPct;
          const erosionCap = riskManager.getErosionCap(regime);

          if (erosionAbsolute > erosionCap) {
            const severity = this.getErosionSeverity(erosionAbsolute, erosionCap);
            const alert: PositionAlert = {
              type: 'EROSION_ALERT',
              tradeId: trade.id,
              pair: trade.pair,
              severity,
              message: `Profit erosion detected: peaked at +${peakProfitPct.toFixed(2)}%, now ${currentProfitPct.toFixed(2)}% (erosion: ${erosionAbsolute.toFixed(4)}, cap: ${erosionCap.toFixed(4)})`,
              currentProfitPct,
              peakProfitPct,
              threshold: erosionCap * 100,
              ageMinutes,
              timestamp: new Date(),
            };
            newAlerts.push(alert);
          }
        }
      }

      // Trigger handlers for new alerts
      for (const alert of newAlerts) {
        try {
          for (const handler of this.alertHandlers) {
            await handler(alert);
          }
        } catch (error) {
          logger.error('Alert handler failed', error instanceof Error ? error : null, {
            alertType: alert.type,
            pair: alert.pair,
          });
        }
      }

      this.alerts = newAlerts;
      return newAlerts;
    } catch (error) {
      logger.error('Failed to check positions for alerts', error instanceof Error ? error : null);
      return [];
    }
  }

  /**
   * Get severity level for underwater trades
   */
  private getUnderWaterSeverity(currentLoss: number, threshold: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const lossGap = Math.abs(currentLoss) - Math.abs(threshold);

    if (lossGap > Math.abs(threshold) * 2) return 'CRITICAL'; // 2x worse than threshold
    if (lossGap > Math.abs(threshold) * 1) return 'HIGH'; // 1x worse than threshold
    if (lossGap > Math.abs(threshold) * 0.5) return 'MEDIUM'; // 0.5x worse than threshold
    return 'LOW';
  }

  /**
   * Get severity level for erosion alerts
   */
  private getErosionSeverity(erosionUsed: number, erosionCap: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const ratio = erosionUsed / erosionCap;

    if (ratio > 2.0) return 'CRITICAL'; // More than 2x the cap
    if (ratio > 1.5) return 'HIGH'; // 1.5x the cap
    if (ratio > 1.2) return 'MEDIUM'; // 1.2x the cap
    return 'LOW';
  }

  /**
   * Get recent alerts
   */
  getAlerts(count: number = 100): PositionAlert[] {
    return this.alerts.slice(0, count);
  }

  /**
   * Clear alert history
   */
  clearAlerts(): void {
    this.alerts = [];
  }
}

export const positionAlertsService = new PositionAlertsService();
