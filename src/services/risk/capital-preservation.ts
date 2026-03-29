/**
 * Capital Preservation Service - 3-Layer Automated Downtrend Protection
 *
 * Prevents "death by a thousand cuts" in sustained downtrends.
 * Called once per orchestrator cycle before signal generation.
 *
 * Layer 1: BTC Momentum Trend Gate (market-wide) - 4h and 1h momentum
 * Layer 2: Rolling Drawdown Circuit Breaker (per-bot) - 7-day P&L tracking
 * Layer 3: Consecutive Loss Detection (per-bot) - streak counting
 */

import { logger } from '@/lib/logger';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';
import { fetchOHLC } from '@/services/market-data/ohlc-fetcher';

export interface CapitalPreservationResult {
  allowTrading: boolean;
  sizeMultiplier: number; // 0.25-1.0
  reason: string;
  layer?: string;
}

interface BtcTrendCache {
  momentum1h: number;
  momentum4h: number;
  timestamp: number;
}

class CapitalPreservationService {
  private btcTrendCache: BtcTrendCache | null = null;

  /**
   * Layer 1: BTC Momentum Trend Gate (market-wide)
   * Checks BTC momentum on 4h and 1h timeframes.
   * - BTC 4h momentum <= bearThreshold (default -2%): sustained bear → 25% size
   * - BTC 1h momentum <= weakThreshold (default -0.5%): short-term weakness → 50% size
   * - Otherwise: full trading
   */
  async checkBtcTrendGate(): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_BTC_TREND_GATE_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'BTC trend gate disabled' };
    }

    try {
      const now = Date.now();

      // Use cached data if still fresh
      const cpBtcCacheTtlMs = getEnvironmentConfig().CP_BTC_CACHE_TTL_MS;
      if (this.btcTrendCache && (now - this.btcTrendCache.timestamp) < cpBtcCacheTtlMs) {
        return this.evaluateBtcTrend(this.btcTrendCache);
      }

      // Fetch 15m candles — 16 candles = 4h window, 4 candles = 1h window
      const candles = await fetchOHLC('BTC/USDT', 20, '15m');

      if (!candles || candles.length < 16) {
        logger.warn('Capital preservation: insufficient BTC candles', {
          received: candles?.length || 0,
          required: 16,
        });
        return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Insufficient BTC data, allowing trading' };
      }

      const currentClose = candles[candles.length - 1].close;
      const close4hAgo = candles[candles.length - 17]?.close ?? candles[0].close;
      const close1hAgo = candles[candles.length - 5]?.close ?? candles[candles.length - 4].close;

      const momentum4h = ((currentClose - close4hAgo) / close4hAgo) * 100;
      const momentum1h = ((currentClose - close1hAgo) / close1hAgo) * 100;

      this.btcTrendCache = { momentum1h, momentum4h, timestamp: now };

      return this.evaluateBtcTrend(this.btcTrendCache);
    } catch (error) {
      logger.error('Capital preservation: BTC trend gate error', error instanceof Error ? error : null);
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'BTC trend gate error, allowing trading' };
    }
  }

  private evaluateBtcTrend(cache: BtcTrendCache): CapitalPreservationResult {
    const env = getEnvironmentConfig();
    const { momentum1h, momentum4h } = cache;

    // BTC 4h momentum deeply negative = sustained bear — 25% size
    if (momentum4h <= env.CP_BTC_MOMENTUM_BEAR_4H) {
      console.log(`\n⚠️ [BTC TREND] BTC 4h momentum ${momentum4h.toFixed(2)}% <= ${env.CP_BTC_MOMENTUM_BEAR_4H}% — 25% size (bear)`);
      logger.info('Capital preservation: BTC bearish 4h momentum, reducing to 25% size', {
        momentum1h: momentum1h.toFixed(2),
        momentum4h: momentum4h.toFixed(2),
      });
      return {
        allowTrading: true,
        sizeMultiplier: 0.25,
        reason: `BTC 4h momentum ${momentum4h.toFixed(2)}% — sustained bear, 25% size`,
        layer: 'btc_trend',
      };
    }

    // BTC 1h momentum negative = short-term weakness — 50% size
    if (momentum1h <= env.CP_BTC_MOMENTUM_WEAK_1H) {
      console.log(`\n⚠️ [BTC TREND] BTC 1h momentum ${momentum1h.toFixed(2)}% <= ${env.CP_BTC_MOMENTUM_WEAK_1H}% — 50% size`);
      logger.info('Capital preservation: BTC weak 1h momentum, reducing to 50% size', {
        momentum1h: momentum1h.toFixed(2),
        momentum4h: momentum4h.toFixed(2),
      });
      return {
        allowTrading: true,
        sizeMultiplier: 0.5,
        reason: `BTC 1h momentum ${momentum1h.toFixed(2)}% — short-term weakness, 50% size`,
        layer: 'btc_trend',
      };
    }

    console.log(`\n✅ [BTC TREND] BTC momentum 1h=${momentum1h.toFixed(2)}% 4h=${momentum4h.toFixed(2)}% — full trading`);
    logger.debug('Capital preservation: BTC momentum positive, full trading', {
      momentum1h: momentum1h.toFixed(2),
      momentum4h: momentum4h.toFixed(2),
    });
    return { allowTrading: true, sizeMultiplier: 1.0, reason: `BTC momentum 1h=${momentum1h.toFixed(2)}% 4h=${momentum4h.toFixed(2)}% — full trading` };
  }

  /**
   * Layer 2: Rolling Drawdown Size Reducer (per-bot)
   * Tracks 7-day rolling P&L — NO PAUSES (cooldowns forbidden).
   * Only reduces position size:
   * - 7-day loss > 5%  → multiplier 0.5
   * - 7-day loss > 10% → multiplier 0.25
   * - 7-day loss > 15% → multiplier 0.25 (floor — still trades every opportunity)
   * Reset: 3 consecutive wins → restore full size
   */
  async checkDrawdown(botId: string, effectiveBalance: number): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_DRAWDOWN_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Drawdown check disabled' };
    }

    try {
      // Clear any stale pause flags (cooldowns are forbidden)
      const botConfig = await query<{ config: Record<string, any> }>(
        `SELECT config FROM bot_instances WHERE id = $1`,
        [botId]
      );

      if (botConfig.length > 0) {
        const config = typeof botConfig[0].config === 'string'
          ? JSON.parse(botConfig[0].config)
          : botConfig[0].config;

        if (config?.cp_paused_until || config?.cp_pause_reason) {
          await this.updateBotCpConfig(botId, { cp_paused_until: null, cp_pause_reason: null });
        }
      }

      // Query 7-day rolling P&L (GROSS - matches DB storage convention)
      const rollingResult = await query<{ total_pl: string | null }>(
        `SELECT COALESCE(SUM(profit_loss), 0) as total_pl FROM trades
         WHERE bot_instance_id = $1
         AND status = 'closed'
         AND exit_time >= NOW() - INTERVAL '7 days'`,
        [botId]
      );

      const rollingPL = parseFloat(String(rollingResult[0]?.total_pl || '0'));
      const rollingPLPct = effectiveBalance > 0 ? (rollingPL / effectiveBalance) * 100 : 0;

      // Track peak equity
      const config = botConfig.length > 0
        ? (typeof botConfig[0].config === 'string' ? JSON.parse(botConfig[0].config) : botConfig[0].config)
        : {};
      const peakEquity = parseFloat(String(config?.cp_peak_equity || effectiveBalance));
      const currentEquity = effectiveBalance + rollingPL;

      if (currentEquity > peakEquity) {
        await this.updateBotCpConfig(botId, { cp_peak_equity: currentEquity });
      }

      logger.debug('Capital preservation: drawdown check', {
        botId,
        rollingPL: rollingPL.toFixed(2),
        rollingPLPct: rollingPLPct.toFixed(2),
        peakEquity: peakEquity.toFixed(2),
        currentEquity: currentEquity.toFixed(2),
      });

      const drawdownPct = Math.abs(rollingPLPct);

      // Size reduction tiers — NO pauses, always trades
      if (drawdownPct >= env.CP_DRAWDOWN_CRITICAL_PCT && rollingPL < 0) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${drawdownPct.toFixed(1)}% 7-day loss - floor size ${env.CP_DRAWDOWN_FLOOR_MULTIPLIER * 100}% (still trading)`);
        return {
          allowTrading: true,
          sizeMultiplier: env.CP_DRAWDOWN_FLOOR_MULTIPLIER,
          reason: `${drawdownPct.toFixed(1)}% 7-day loss (>=${env.CP_DRAWDOWN_CRITICAL_PCT}%), floor size ${env.CP_DRAWDOWN_FLOOR_MULTIPLIER * 100}%`,
          layer: 'drawdown',
        };
      }

      if (drawdownPct >= env.CP_DRAWDOWN_FLOOR_PCT && rollingPL < 0) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${drawdownPct.toFixed(1)}% 7-day loss - floor size ${env.CP_DRAWDOWN_FLOOR_MULTIPLIER * 100}% (still trading)`);
        return {
          allowTrading: true,
          sizeMultiplier: env.CP_DRAWDOWN_FLOOR_MULTIPLIER,
          reason: `${drawdownPct.toFixed(1)}% 7-day loss (>=${env.CP_DRAWDOWN_FLOOR_PCT}%), floor size ${env.CP_DRAWDOWN_FLOOR_MULTIPLIER * 100}%`,
          layer: 'drawdown',
        };
      }

      // 5% rolling loss → reduce size
      if (drawdownPct >= env.CP_DRAWDOWN_REDUCE_PCT && rollingPL < 0) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${drawdownPct.toFixed(1)}% 7-day loss - reducing to ${env.CP_DRAWDOWN_REDUCE_MULTIPLIER * 100}% size (still trading)`);
        return {
          allowTrading: true,
          sizeMultiplier: env.CP_DRAWDOWN_REDUCE_MULTIPLIER,
          reason: `${drawdownPct.toFixed(1)}% 7-day loss (>=${env.CP_DRAWDOWN_REDUCE_PCT}%), reducing to ${env.CP_DRAWDOWN_REDUCE_MULTIPLIER * 100}% size`,
          layer: 'drawdown',
        };
      }

      // Check for 3 consecutive wins → reset any lingering reduction
      const recentWins = await query<{ profit_loss: string }>(
        `SELECT profit_loss FROM trades
         WHERE bot_instance_id = $1
         AND status = 'closed'
         ORDER BY exit_time DESC
         LIMIT 3`,
        [botId]
      );

      if (recentWins.length === 3) {
        const allWins = recentWins.every(t => parseFloat(String(t.profit_loss)) > 0);
        if (allWins) {
          // Reset peak equity tracking on winning streak
          await this.updateBotCpConfig(botId, { cp_peak_equity: currentEquity });
        }
      }

      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Drawdown within limits' };
    } catch (error) {
      logger.error('Capital preservation: drawdown check error', error instanceof Error ? error : null, { botId });
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Drawdown check error, allowing trading' };
    }
  }

  /**
   * Layer 3: Consecutive Loss Detection (per-bot)
   * NO PAUSES (cooldowns forbidden) — size reduction only.
   * - 3 consecutive → configurable reducer (default 50%)
   * - 5+ consecutive → configurable floor (default 25%)
   */
  async checkLossStreak(botId: string): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_LOSS_STREAK_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Loss streak check disabled' };
    }

    try {
      // Clear any stale streak pause flags (cooldowns are forbidden)
      const botConfig = await query<{ config: Record<string, any> }>(
        `SELECT config FROM bot_instances WHERE id = $1`,
        [botId]
      );

      if (botConfig.length > 0) {
        const config = typeof botConfig[0].config === 'string'
          ? JSON.parse(botConfig[0].config)
          : botConfig[0].config;

        if (config?.cp_streak_paused_until) {
          await this.updateBotCpConfig(botId, { cp_streak_paused_until: null });
        }
      }

      // Query last 20 closed trades, count leading losses
      const recentTrades = await query<{ profit_loss: string }>(
        `SELECT profit_loss FROM trades
         WHERE bot_instance_id = $1
         AND status = 'closed'
         ORDER BY exit_time DESC
         LIMIT 20`,
        [botId]
      );

      let consecutiveLosses = 0;
      for (const trade of recentTrades) {
        const pl = parseFloat(String(trade.profit_loss));
        if (pl < 0) {
          consecutiveLosses++;
        } else {
          break; // First win breaks the streak
        }
      }

      logger.debug('Capital preservation: loss streak check', {
        botId,
        consecutiveLosses,
        recentTradeCount: recentTrades.length,
      });

      // Severe streak → floor size (still trading)
      if (consecutiveLosses >= env.CP_LOSS_STREAK_SEVERE) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${consecutiveLosses} consecutive losses - floor size ${env.CP_LOSS_STREAK_SEVERE_MULTIPLIER * 100}% (still trading)`);
        return {
          allowTrading: true,
          sizeMultiplier: env.CP_LOSS_STREAK_SEVERE_MULTIPLIER,
          reason: `${consecutiveLosses} consecutive losses (>=${env.CP_LOSS_STREAK_SEVERE}), floor size ${env.CP_LOSS_STREAK_SEVERE_MULTIPLIER * 100}%`,
          layer: 'loss_streak',
        };
      }

      // Moderate streak → reduced size (still trading)
      if (consecutiveLosses >= env.CP_LOSS_STREAK_REDUCE) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${consecutiveLosses} consecutive losses - reducing size ${env.CP_LOSS_STREAK_REDUCE_MULTIPLIER * 100}% (still trading)`);
        return {
          allowTrading: true,
          sizeMultiplier: env.CP_LOSS_STREAK_REDUCE_MULTIPLIER,
          reason: `${consecutiveLosses} consecutive losses (>=${env.CP_LOSS_STREAK_REDUCE}), reducing to ${env.CP_LOSS_STREAK_REDUCE_MULTIPLIER * 100}% size`,
          layer: 'loss_streak',
        };
      }

      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'No significant loss streak' };
    } catch (error) {
      logger.error('Capital preservation: loss streak check error', error instanceof Error ? error : null, { botId });
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Loss streak check error, allowing trading' };
    }
  }

  /**
   * Combined per-bot evaluation: Layer 2 + Layer 3
   * Multipliers are cumulative, floored at 0.25
   */
  async evaluateBot(botId: string, effectiveBalance: number): Promise<CapitalPreservationResult> {
    const drawdownResult = await this.checkDrawdown(botId, effectiveBalance);
    if (!drawdownResult.allowTrading) {
      return drawdownResult;
    }

    const streakResult = await this.checkLossStreak(botId);
    if (!streakResult.allowTrading) {
      return streakResult;
    }

    // Combine multipliers, floor at 0.25
    const combinedMultiplier = Math.max(0.25, drawdownResult.sizeMultiplier * streakResult.sizeMultiplier);

    if (combinedMultiplier < 1.0) {
      const reasons: string[] = [];
      if (drawdownResult.sizeMultiplier < 1.0) reasons.push(drawdownResult.reason);
      if (streakResult.sizeMultiplier < 1.0) reasons.push(streakResult.reason);
      return {
        allowTrading: true,
        sizeMultiplier: combinedMultiplier,
        reason: reasons.join('; '),
        layer: 'combined',
      };
    }

    return { allowTrading: true, sizeMultiplier: 1.0, reason: 'All per-bot checks passed' };
  }

  /**
   * Update bot's capital preservation config in JSONB
   * Merges into existing config without overwriting other fields
   */
  private async updateBotCpConfig(botId: string, updates: Record<string, any>): Promise<void> {
    try {
      // Build JSONB merge - only update CP-related keys
      const jsonbUpdate = JSON.stringify(updates);
      await query(
        `UPDATE bot_instances SET config = config || $1::jsonb WHERE id = $2`,
        [jsonbUpdate, botId]
      );
    } catch (error) {
      logger.error('Capital preservation: failed to update bot config', error instanceof Error ? error : null, {
        botId,
        updates,
      });
    }
  }

  /**
   * Manually clear BTC trend cache to force fresh data fetch
   */
  public clearBtcCache(): void {
    this.btcTrendCache = null;
    logger.info('Capital preservation: BTC trend cache manually cleared');
  }
}

// Singleton export
export const capitalPreservation = new CapitalPreservationService();
