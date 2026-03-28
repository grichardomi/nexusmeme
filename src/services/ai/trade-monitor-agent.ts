/**
 * Trade Monitor Agent — Advisory Only
 *
 * Watches open trades and provides health assessments (HEALTHY / WATCH / CONCERN).
 * Advisory-only: logs output, never triggers exits directly.
 * Exit logic remains purely deterministic (WS tick ~100ms).
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
   * Advisory only — results are logged, not acted upon.
   * Silently skipped on timeout or API failure.
   */
  async analyze(
    trades: OpenTradeContext[],
    btcIndicators: TechnicalIndicators
  ): Promise<void> {
    if (trades.length === 0) return;

    const env = getEnvironmentConfig();
    if (!env.AI_TRADE_MONITOR_ENABLED) return;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    // Cache check — avoid calling Claude on every 20s orchestrator cycle
    const cacheKey = `agent:trade_monitor_v1:${trades.map(t => t.pair).sort().join(',')}`;
    try {
      const cached = await getCached<{ summary: string }>(cacheKey);
      if (cached) {
        logger.debug('TradeMonitor: cache hit', { summary: cached.summary });
        return;
      }
    } catch { /* non-critical */ }

    const timeoutMs = env.AI_TRADE_MONITOR_TIMEOUT_MS ?? 5000;
    const model = env.AI_REGIME_AGENT_MODEL || 'claude-haiku-4-5-20251001';

    const tradesBlock = trades.map(t =>
      `${t.pair}: entry=${t.entryPrice.toFixed(2)}, now=${t.currentPrice.toFixed(2)}, P&L=${t.unrealizedPctGross >= 0 ? '+' : ''}${t.unrealizedPctGross.toFixed(2)}%, age=${t.ageMinutes.toFixed(1)}min, regime=${t.regime}`
    ).join('\n');

    const btcMom1h = (btcIndicators.momentum1h ?? 0).toFixed(3);
    const btcSlope = (btcIndicators.momentumSlope ?? 0).toFixed(3);

    const prompt = `You are monitoring open crypto spot long trades. Assess health of each given current BTC bellwether state.

OPEN TRADES:
${tradesBlock}

BTC bellwether:
- 1h momentum: ${btcMom1h}%
- Slope (acceleration): ${btcSlope}%  [negative = decelerating, watch]

For each trade assess health:
- HEALTHY: Momentum supporting, on track, hold
- WATCH: Momentum fading or BTC decelerating — monitor, don't panic yet
- CONCERN: BTC reversing AND trade not profitable yet AND age > 10min — conditions degrading

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

      for (const a of assessments) {
        const status = (['HEALTHY', 'WATCH', 'CONCERN'] as const).includes(a.status as any) ? a.status : 'WATCH';
        if (status === 'CONCERN') {
          logger.warn(`TradeMonitor [CONCERN]: ${a.pair} — ${a.reason}`, { pair: a.pair, status, reason: a.reason, latencyMs });
        } else {
          logger.info(`TradeMonitor [${status}]: ${a.pair} — ${a.reason}`, { pair: a.pair, status, reason: a.reason, latencyMs });
        }
      }

      // Cache full assessments under both the per-pair key (dedup) and a fixed latest key (admin panel)
      const ttl = env.AI_TRADE_MONITOR_CACHE_TTL_SECONDS ?? 120;
      const fullResult = { assessments, timestamp: new Date().toISOString() };
      await Promise.all([
        setCached(cacheKey, { summary: assessments.map(a => `${a.pair}:${a.status}`).join(',') }, ttl),
        setCached('agent:trade_monitor_latest_v1', fullResult, ttl),
      ]).catch(() => {});

    } catch (error) {
      // Non-critical — silently skip on failure
      logger.debug('TradeMonitor: skipped', { error: error instanceof Error ? error.message : 'unknown' });
    }
  }
}

export const tradeMonitorAgent = new TradeMonitorAgent();
