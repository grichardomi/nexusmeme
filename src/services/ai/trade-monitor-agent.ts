/**
 * Trade Monitor Agent — Active Exit Trigger
 *
 * Watches open trades and provides health assessments (HEALTHY / WATCH / CONCERN).
 * CONCERN assessments are returned to the orchestrator which calls the close API
 * to exit the trade immediately.
 *
 * Called once per orchestrator cycle when trades are open.
 * kv_cache TTL (AI_TRADE_MONITOR_CACHE_TTL_SECONDS) prevents Claude spam.
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { getCached, setCached } from '@/lib/redis';
import type { TechnicalIndicators } from '@/types/ai';

export interface OpenTradeContext {
  pair: string;
  entryPrice: number;
  currentPrice: number;
  unrealizedPctGross: number; // gross P&L % (before fees)
  ageMinutes: number;
  regime: string;
}

export type TradeHealthStatus = 'HEALTHY' | 'WATCH' | 'CONCERN';

export interface TradeHealthAssessment {
  pair: string;
  status: TradeHealthStatus;
  reason: string;
}

class TradeMonitorAgent {
  /**
   * Analyze open trade health using BTC bellwether context.
   * Returns pairs assessed as CONCERN — orchestrator will exit these trades.
   * Silently returns [] on timeout or API failure (never blocks trading).
   */
  async analyze(
    trades: OpenTradeContext[],
    btcIndicators: TechnicalIndicators
  ): Promise<string[]> {
    if (trades.length === 0) return [];

    const env = getEnvironmentConfig();
    if (!env.AI_TRADE_MONITOR_ENABLED) return [];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    // Cache check — avoid calling Claude on every 20s orchestrator cycle
    const cacheKey = `agent:trade_monitor_v1:${trades.map(t => t.pair).sort().join(',')}`;
    try {
      const cached = await getCached<{ summary: string; concerns?: string[] }>(cacheKey);
      if (cached) {
        logger.debug('TradeMonitor: cache hit', { summary: cached.summary });
        return cached.concerns ?? [];
      }
    } catch { /* non-critical */ }

    const timeoutMs = env.AI_TRADE_MONITOR_TIMEOUT_MS ?? 5000;
    const model = env.AI_REGIME_AGENT_MODEL || 'claude-haiku-4-5-20251001';

    const tradesBlock = trades.map(t =>
      `${t.pair}: entry=${t.entryPrice.toFixed(2)}, now=${t.currentPrice.toFixed(2)}, P&L=${t.unrealizedPctGross >= 0 ? '+' : ''}${t.unrealizedPctGross.toFixed(2)}%, age=${t.ageMinutes.toFixed(1)}min, regime=${t.regime}`
    ).join('\n');

    const btcMom1h = (btcIndicators.momentum1h ?? 0).toFixed(3);
    const btcSlope = (btcIndicators.momentumSlope ?? 0).toFixed(3);

    const prompt = `You are monitoring open crypto spot long trades. Exit decisions matter — CONCERN triggers an immediate close.

OPEN TRADES:
${tradesBlock}

BTC bellwether:
- 1h momentum: ${btcMom1h}%
- Slope (acceleration): ${btcSlope}%  [negative = decelerating]

Assess each trade. Be decisive — a small certain loss beats a large uncertain one.

- HEALTHY: Trade profitable OR BTC momentum positive and accelerating — hold
- WATCH: Trade flat/small loss AND BTC decelerating — risk building, monitor
- CONCERN (exit immediately): ANY of these:
  1. Trade unprofitable AND BTC 1h momentum negative (< -0.1%) — market moving against us
  2. Trade unprofitable AND age > 8min AND BTC slope negative — thesis not playing out
  3. Trade loss > -0.3% AND BTC momentum declining — cut before it gets worse

Do NOT flag CONCERN if trade is in profit (even small). Erosion cap handles profitable exits.

Return ONLY raw JSON array (no markdown, no backticks):
[{"pair":"ETH/USDT","status":"HEALTHY","reason":"<max 10 words>"}]`;

    try {
      const startMs = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) throw new Error(`Claude API ${response.status}`);

      const data = await response.json();
      const text: string = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array in response');

      const assessments = JSON.parse(jsonMatch[0]) as TradeHealthAssessment[];
      const latencyMs = Date.now() - startMs;

      const concernPairs: string[] = [];
      for (const a of assessments) {
        const status = (['HEALTHY', 'WATCH', 'CONCERN'] as const).includes(a.status as any) ? a.status : 'WATCH';
        if (status === 'CONCERN') {
          logger.warn(`🚨 TradeMonitor [CONCERN]: ${a.pair} — ${a.reason}`, { pair: a.pair, status, reason: a.reason, latencyMs });
          concernPairs.push(a.pair);
        } else {
          logger.info(`TradeMonitor [${status}]: ${a.pair} — ${a.reason}`, { pair: a.pair, status, reason: a.reason, latencyMs });
        }
      }

      // Cache full assessments under both the per-pair key (dedup) and a fixed latest key (admin panel)
      const ttl = env.AI_TRADE_MONITOR_CACHE_TTL_SECONDS ?? 120;
      const fullResult = { assessments, timestamp: new Date().toISOString() };
      await Promise.all([
        setCached(cacheKey, { summary: assessments.map(a => `${a.pair}:${a.status}`).join(','), concerns: concernPairs }, ttl),
        setCached('agent:trade_monitor_latest_v1', fullResult, ttl),
      ]).catch(() => {});

      return concernPairs;

    } catch (error) {
      // Non-critical — silently return empty on failure, never blocks trading
      logger.debug('TradeMonitor: skipped', { error: error instanceof Error ? error.message : 'unknown' });
      return [];
    }
  }
}

export const tradeMonitorAgent = new TradeMonitorAgent();
