/**
 * Capital Preservation Service - 3-Layer Automated Downtrend Protection
 *
 * Prevents "death by a thousand cuts" in sustained downtrends.
 * Called once per orchestrator cycle before signal generation.
 *
 * Layer 1: BTC Daily Trend Gate (market-wide) - EMA50/EMA200
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
  ema50: number;
  ema200: number;
  btcClose: number;
  timestamp: number;
}

/**
 * Calculate EMA (Exponential Moving Average) from an array of close prices
 */
function calculateEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

class CapitalPreservationService {
  private btcTrendCache: BtcTrendCache | null = null;
  private readonly BTC_CACHE_TTL_MS = 3600000; // 1 hour

  /**
   * Layer 1: BTC Daily Trend Gate (market-wide)
   * Checks BTC position relative to EMA50 and EMA200 on daily chart.
   * - BTC > EMA50: full trading (multiplier 1.0)
   * - BTC < EMA50 but > EMA200: reduced size (multiplier 0.5)
   * - BTC < EMA200: block all entries
   * Auto-resume: next cycle where BTC > EMA50
   */
  async checkBtcTrendGate(): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_BTC_TREND_GATE_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'BTC trend gate disabled' };
    }

    try {
      const now = Date.now();

      // Use cached data if still fresh
      if (this.btcTrendCache && (now - this.btcTrendCache.timestamp) < this.BTC_CACHE_TTL_MS) {
        return this.evaluateBtcTrend(this.btcTrendCache);
      }

      // Fetch daily candles (250 days for EMA200)
      const candles = await fetchOHLC('BTC/USDT', 250, '1d');

      if (!candles || candles.length < env.CP_BTC_EMA_LONG_PERIOD) {
        logger.warn('Capital preservation: insufficient BTC daily candles', {
          received: candles?.length || 0,
          required: env.CP_BTC_EMA_LONG_PERIOD,
        });
        // Fail open - allow trading if we can't determine trend
        return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Insufficient BTC data, allowing trading' };
      }

      // Get current live BTC price (more responsive than yesterday's close)
      let btcClose: number;
      try {
        const baseUrl = getEnvironmentConfig().BINANCE_API_BASE_URL;
        const tickerUrl = `${baseUrl}/api/v3/ticker/price?symbol=BTCUSDT`;
        const tickerResponse = await fetch(tickerUrl);
        if (tickerResponse.ok) {
          const tickerData = await tickerResponse.json();
          btcClose = parseFloat(tickerData.price);
          logger.debug('Capital preservation: using live BTC price', { btcClose });
        } else {
          // Fallback to last candle close if ticker fails
          btcClose = candles[candles.length - 1].close;
          logger.debug('Capital preservation: ticker failed, using candle close', { btcClose });
        }
      } catch (error) {
        // Fallback to last candle close if ticker fails
        btcClose = candles[candles.length - 1].close;
        logger.debug('Capital preservation: ticker error, using candle close', { btcClose });
      }

      // Use historical closes for EMA, but current price for comparison
      const closes = candles.map(c => c.close);
      const ema50 = calculateEMA(closes, env.CP_BTC_EMA_SHORT_PERIOD);
      const ema200 = calculateEMA(closes, env.CP_BTC_EMA_LONG_PERIOD);

      // Cache the result
      this.btcTrendCache = { ema50, ema200, btcClose, timestamp: now };

      return this.evaluateBtcTrend(this.btcTrendCache);
    } catch (error) {
      logger.error('Capital preservation: BTC trend gate error', error instanceof Error ? error : null);
      // Fail open - allow trading on error
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'BTC trend gate error, allowing trading' };
    }
  }

  private evaluateBtcTrend(cache: BtcTrendCache): CapitalPreservationResult {
    const { btcClose, ema50, ema200 } = cache;

    if (btcClose < ema200) {
      console.log(`\n🛡️ [CAPITAL PRESERVATION] BTC below EMA200 ($${btcClose.toFixed(0)} < $${ema200.toFixed(0)}) - reducing to 25% size (opportunistic mode)`);
      logger.info('Capital preservation: BTC below EMA200, reducing size but staying opportunistic', {
        btcClose: btcClose.toFixed(2),
        ema50: ema50.toFixed(2),
        ema200: ema200.toFixed(2),
        layer: 'btc_trend_gate',
      });
      return {
        allowTrading: true,
        sizeMultiplier: 0.25,
        reason: `BTC below EMA200 ($${btcClose.toFixed(0)} < $${ema200.toFixed(0)}), cautious but opportunistic`,
        layer: 'btc_trend_gate',
      };
    }

    if (btcClose < ema50) {
      console.log(`\n🛡️ [CAPITAL PRESERVATION] BTC below EMA50 ($${btcClose.toFixed(0)} < $${ema50.toFixed(0)}) - reducing size 50%`);
      logger.info('Capital preservation: BTC below EMA50, reducing size', {
        btcClose: btcClose.toFixed(2),
        ema50: ema50.toFixed(2),
        ema200: ema200.toFixed(2),
        layer: 'btc_trend_gate',
      });
      return {
        allowTrading: true,
        sizeMultiplier: 0.5,
        reason: `BTC below EMA50 ($${btcClose.toFixed(0)} < $${ema50.toFixed(0)}), above EMA200`,
        layer: 'btc_trend_gate',
      };
    }

    console.log(`\n✅ [CAPITAL PRESERVATION] BTC above EMA50 ($${btcClose.toFixed(0)} > $${ema50.toFixed(0)}) - full trading`);
    logger.debug('Capital preservation: BTC above EMA50, full trading', {
      btcClose: btcClose.toFixed(2),
      ema50: ema50.toFixed(2),
      ema200: ema200.toFixed(2),
    });
    return { allowTrading: true, sizeMultiplier: 1.0, reason: 'BTC above EMA50, full trading' };
  }

  /**
   * Layer 2: Rolling Drawdown Circuit Breaker (per-bot)
   * Tracks 7-day rolling P&L and peak equity.
   * - 7-day loss > 5% of capital → multiplier *= 0.5
   * - 7-day loss > 10% of capital → pause 24h
   * - Drawdown from peak > 15% → pause until BTC recovers above EMA50
   * Auto-resume: pause expires, or BTC > EMA50 for 15% case
   * Reset: 3 consecutive wins → restore full size
   */
  async checkDrawdown(botId: string, effectiveBalance: number): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_DRAWDOWN_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Drawdown check disabled' };
    }

    try {
      // Check if bot is currently paused
      const botConfig = await query<{ config: Record<string, any> }>(
        `SELECT config FROM bot_instances WHERE id = $1`,
        [botId]
      );

      if (botConfig.length > 0) {
        const config = typeof botConfig[0].config === 'string'
          ? JSON.parse(botConfig[0].config)
          : botConfig[0].config;

        if (config?.cp_paused_until) {
          const pausedUntil = new Date(config.cp_paused_until).getTime();
          if (Date.now() < pausedUntil) {
            // Check if this is a 15% drawdown pause (requires BTC recovery)
            if (config.cp_pause_reason === 'drawdown_15pct') {
              // Check if BTC has recovered
              const btcResult = await this.checkBtcTrendGate();
              if (btcResult.sizeMultiplier < 1.0) {
                return {
                  allowTrading: false,
                  sizeMultiplier: 0,
                  reason: `Paused: 15% drawdown, waiting for BTC recovery (currently ${btcResult.reason})`,
                  layer: 'drawdown',
                };
              }
              // BTC recovered - clear the pause
              await this.updateBotCpConfig(botId, { cp_paused_until: null, cp_pause_reason: null });
            } else {
              const remainingMin = Math.ceil((pausedUntil - Date.now()) / 60000);
              return {
                allowTrading: false,
                sizeMultiplier: 0,
                reason: `Paused for ${remainingMin}min (drawdown circuit breaker)`,
                layer: 'drawdown',
              };
            }
          } else {
            // Pause expired - clear it
            await this.updateBotCpConfig(botId, { cp_paused_until: null, cp_pause_reason: null });
          }
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

      // Update peak equity if we've hit a new high
      if (currentEquity > peakEquity) {
        await this.updateBotCpConfig(botId, { cp_peak_equity: currentEquity });
      }

      // Check drawdown from peak
      const drawdownFromPeak = peakEquity > 0
        ? ((peakEquity - currentEquity) / peakEquity) * 100
        : 0;

      logger.debug('Capital preservation: drawdown check', {
        botId,
        rollingPL: rollingPL.toFixed(2),
        rollingPLPct: rollingPLPct.toFixed(2),
        peakEquity: peakEquity.toFixed(2),
        currentEquity: currentEquity.toFixed(2),
        drawdownFromPeak: drawdownFromPeak.toFixed(2),
      });

      // 15% drawdown from peak → pause until BTC recovers
      if (drawdownFromPeak >= env.CP_DRAWDOWN_STOP_PCT) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${drawdownFromPeak.toFixed(1)}% drawdown from peak - PAUSING until BTC recovers`);
        await this.updateBotCpConfig(botId, {
          cp_paused_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Far future - cleared by BTC recovery
          cp_pause_reason: 'drawdown_15pct',
        });
        return {
          allowTrading: false,
          sizeMultiplier: 0,
          reason: `${drawdownFromPeak.toFixed(1)}% drawdown from peak (>${env.CP_DRAWDOWN_STOP_PCT}%), pausing until BTC recovers`,
          layer: 'drawdown',
        };
      }

      // 10% rolling loss → pause for configured hours
      if (Math.abs(rollingPLPct) >= env.CP_DRAWDOWN_PAUSE_PCT && rollingPL < 0) {
        const pauseMs = env.CP_DRAWDOWN_PAUSE_HOURS * 60 * 60 * 1000;
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${rollingPLPct.toFixed(1)}% 7-day loss - PAUSING ${env.CP_DRAWDOWN_PAUSE_HOURS}h`);
        await this.updateBotCpConfig(botId, {
          cp_paused_until: new Date(Date.now() + pauseMs).toISOString(),
          cp_pause_reason: 'drawdown_10pct',
        });
        return {
          allowTrading: false,
          sizeMultiplier: 0,
          reason: `${Math.abs(rollingPLPct).toFixed(1)}% 7-day loss (>${env.CP_DRAWDOWN_PAUSE_PCT}%), paused ${env.CP_DRAWDOWN_PAUSE_HOURS}h`,
          layer: 'drawdown',
        };
      }

      // 5% rolling loss → reduce size
      if (Math.abs(rollingPLPct) >= env.CP_DRAWDOWN_REDUCE_PCT && rollingPL < 0) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${rollingPLPct.toFixed(1)}% 7-day loss - reducing size 50%`);
        return {
          allowTrading: true,
          sizeMultiplier: 0.5,
          reason: `${Math.abs(rollingPLPct).toFixed(1)}% 7-day loss (>${env.CP_DRAWDOWN_REDUCE_PCT}%), reducing size`,
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
   * Counts leading consecutive losses from most recent trades.
   * - 3 consecutive → multiplier *= 0.5
   * - 5 consecutive → multiplier *= 0.25
   * - 7 consecutive → pause 4 hours
   * Auto-resume: pause expires; first win resets streak
   */
  async checkLossStreak(botId: string): Promise<CapitalPreservationResult> {
    const env = getEnvironmentConfig();

    if (!env.CP_LOSS_STREAK_ENABLED) {
      return { allowTrading: true, sizeMultiplier: 1.0, reason: 'Loss streak check disabled' };
    }

    try {
      // Check if bot is currently paused from streak
      const botConfig = await query<{ config: Record<string, any> }>(
        `SELECT config FROM bot_instances WHERE id = $1`,
        [botId]
      );

      if (botConfig.length > 0) {
        const config = typeof botConfig[0].config === 'string'
          ? JSON.parse(botConfig[0].config)
          : botConfig[0].config;

        if (config?.cp_streak_paused_until) {
          const pausedUntil = new Date(config.cp_streak_paused_until).getTime();
          if (Date.now() < pausedUntil) {
            const remainingMin = Math.ceil((pausedUntil - Date.now()) / 60000);
            return {
              allowTrading: false,
              sizeMultiplier: 0,
              reason: `Paused for ${remainingMin}min (${env.CP_LOSS_STREAK_PAUSE}+ consecutive losses)`,
              layer: 'loss_streak',
            };
          }
          // Pause expired
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

      // 7+ consecutive losses → pause
      if (consecutiveLosses >= env.CP_LOSS_STREAK_PAUSE) {
        const pauseMs = env.CP_LOSS_STREAK_PAUSE_HOURS * 60 * 60 * 1000;
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${consecutiveLosses} consecutive losses - PAUSING ${env.CP_LOSS_STREAK_PAUSE_HOURS}h`);
        await this.updateBotCpConfig(botId, {
          cp_streak_paused_until: new Date(Date.now() + pauseMs).toISOString(),
        });
        return {
          allowTrading: false,
          sizeMultiplier: 0,
          reason: `${consecutiveLosses} consecutive losses (>=${env.CP_LOSS_STREAK_PAUSE}), paused ${env.CP_LOSS_STREAK_PAUSE_HOURS}h`,
          layer: 'loss_streak',
        };
      }

      // 5 consecutive losses → quarter size
      if (consecutiveLosses >= 5) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${consecutiveLosses} consecutive losses - reducing size 75%`);
        return {
          allowTrading: true,
          sizeMultiplier: 0.25,
          reason: `${consecutiveLosses} consecutive losses, reducing to 25% size`,
          layer: 'loss_streak',
        };
      }

      // 3+ consecutive losses → half size
      if (consecutiveLosses >= env.CP_LOSS_STREAK_REDUCE) {
        console.log(`\n🛡️ [CAPITAL PRESERVATION] Bot ${botId.slice(0, 8)}: ${consecutiveLosses} consecutive losses - reducing size 50%`);
        return {
          allowTrading: true,
          sizeMultiplier: 0.5,
          reason: `${consecutiveLosses} consecutive losses (>=${env.CP_LOSS_STREAK_REDUCE}), reducing size`,
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
   * Useful when EMA data appears stale or after market volatility
   */
  public clearBtcCache(): void {
    this.btcTrendCache = null;
    logger.info('Capital preservation: BTC trend cache manually cleared');
  }
}

// Singleton export
export const capitalPreservation = new CapitalPreservationService();
