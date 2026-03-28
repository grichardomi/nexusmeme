/**
 * Regime Intelligence Agent
 *
 * BTC-focused background agent that pre-computes market context each orchestrator cycle.
 * BTC is the bellwether — its regime predicts ETH behaviour and validates entry quality.
 *
 * Architecture (zero hot-path impact):
 *   Orchestrator cycle → analyze(btcIndicators) → writes to in-memory + kv_cache
 *   Entry scorer       → getState()              → reads in-memory (<1ms) or cache (<5ms)
 *
 * Cost control:
 *   Claude Haiku called at most once per AI_REGIME_AGENT_CACHE_TTL_SECONDS (6 min default).
 *   Hard timeout (AI_REGIME_AGENT_TIMEOUT_MS) falls back to null — no trading impact.
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { getCached, setCached } from '@/lib/redis';
import type { TechnicalIndicators, RegimeAgentState } from '@/types/ai';

const CACHE_KEY = 'agent:regime_v1';

class RegimeAgent {
  private lastState: RegimeAgentState | null = null;
  private lastAnalyzedAt = 0;
  private kvCacheFailing = false; // circuit breaker: skip Claude when cache is unavailable
  private _callsToday = 0;
  private _callsResetAt = new Date().toDateString();
  private _adjustmentOverride: number | null = null; // admin override, null = use agent value

  /** Daily call count (resets at midnight, in-process only) */
  get callsToday(): number {
    const today = new Date().toDateString();
    if (today !== this._callsResetAt) { this._callsToday = 0; this._callsResetAt = today; }
    return this._callsToday;
  }

  /** Admin override: force a fixed adjustment (null = use agent value) */
  get adjustmentOverride(): number | null { return this._adjustmentOverride; }

  /** Flush in-memory cache so next cycle forces a fresh Claude call */
  flushCache(): void {
    this.lastState = null;
    this.lastAnalyzedAt = 0;
    this.kvCacheFailing = false;
  }

  /** Set admin override adjustment (-maxAdj..+maxAdj). Pass null to clear. */
  setOverride(value: number | null): void {
    this._adjustmentOverride = value;
  }

  /**
   * Read current regime state.
   * Returns in-memory state (zero latency) → kv_cache fallback → null.
   * Safe to call synchronously on the hot path.
   */
  async getState(): Promise<RegimeAgentState | null> {
    const env = getEnvironmentConfig();
    const ttlMs = (env.AI_REGIME_AGENT_CACHE_TTL_SECONDS ?? 360) * 1000;

    // 1. In-memory — fastest (same process restart window)
    if (this.lastState && (Date.now() - this.lastAnalyzedAt) < ttlMs) {
      return this.lastState;
    }

    // 2. kv_cache — survives server restarts
    try {
      const cached = await getCached<RegimeAgentState>(CACHE_KEY);
      this.kvCacheFailing = false; // cache read succeeded
      if (cached) {
        this.lastState = cached;
        this.lastAnalyzedAt = new Date(cached.timestamp).getTime();
        return cached;
      }
    } catch {
      // kv_cache unavailable — activate circuit breaker, use stale in-memory state
      if (!this.kvCacheFailing) {
        logger.warn('RegimeAgent: kv_cache unavailable, holding last known state (circuit breaker active)');
      }
      this.kvCacheFailing = true;
      return this.lastState; // stale but safe — no Claude call
    }

    return null;
  }

  /**
   * Run BTC regime analysis.
   * Returns cached state immediately if still within TTL (no Claude call).
   * Otherwise calls Claude Haiku, stores result, returns new state.
   * Returns null on timeout or API failure — safe default, no entry adjustment applied.
   */
  async analyze(btcIndicators: TechnicalIndicators): Promise<RegimeAgentState | null> {
    const env = getEnvironmentConfig();
    if (!env.AI_REGIME_AGENT_ENABLED) return null;

    // Check TTL — don't call Claude if cache is still fresh
    const existing = await this.getState();
    const ttlMs = (env.AI_REGIME_AGENT_CACHE_TTL_SECONDS ?? 360) * 1000;
    if (existing && (Date.now() - new Date(existing.timestamp).getTime()) < ttlMs) {
      if (this._adjustmentOverride !== null) existing.entryBarAdjustment = this._adjustmentOverride;
      logger.debug('RegimeAgent: cache hit, skipping Claude call', {
        btcRegime: existing.btcRegime,
        entryBarAdjustment: existing.entryBarAdjustment,
        reasoning: existing.reasoning,
        ageSeconds: Math.round((Date.now() - new Date(existing.timestamp).getTime()) / 1000),
      });
      return existing;
    }

    // Circuit breaker: if kv_cache is down, skip Claude to prevent unbounded calls
    if (this.kvCacheFailing) {
      logger.debug('RegimeAgent: circuit breaker active (kv_cache unavailable), skipping Claude call');
      return this.lastState;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.debug('RegimeAgent: ANTHROPIC_API_KEY not set, skipping');
      return null;
    }

    const timeoutMs = env.AI_REGIME_AGENT_TIMEOUT_MS ?? 8000;
    const model = env.AI_REGIME_AGENT_MODEL || 'claude-haiku-4-5-20251001';
    const maxAdj = env.AI_REGIME_AGENT_MAX_ADJUSTMENT ?? 10;

    const btcMom1h = (btcIndicators.momentum1h ?? 0).toFixed(3);
    const btcMom4h = (btcIndicators.momentum4h ?? 0).toFixed(3);
    const btcSlope = (btcIndicators.momentumSlope ?? 0).toFixed(3);
    const btcVol = (btcIndicators.volumeRatio ?? 1).toFixed(2);

    const prompt = `You are a crypto regime analyst for a BTC/ETH spot trading system. BTC is the market bellwether.

BTC current state:
- 1h momentum: ${btcMom1h}%
- 4h momentum: ${btcMom4h}%
- Momentum slope (1h ROC acceleration): ${btcSlope}%  [positive = accelerating, negative = decelerating]
- Volume ratio vs 20-candle avg: ${btcVol}x

Regime thresholds:
- choppy: 4h ≤ 0%
- weak: 4h > 0%, 1h > 0.2%
- moderate: 1h ≥ 0.4%, 4h ≥ 0.2%
- strong: 1h ≥ 1.0%, 4h ≥ 0.8%

Assess ONLY based on the data above:
1. BTC's current regime
2. Is the regime TRANSITIONING? (negative slope in moderate/strong = weakening; positive slope in weak = strengthening)
3. entryBarAdjustment: integer -${maxAdj} to +${maxAdj}
   Negative = fake rally risk (decelerating slope, thin volume, choppy regime) → raise entry bar
   Positive = genuine sustained move (positive slope, confirmed volume, strong/moderate) → lower entry bar
   0 = ambiguous or weak/choppy (don't encourage entries in uncertain conditions)

Return ONLY raw JSON (no markdown, no backticks):
{"btcRegime":"moderate","trendTransitioning":false,"transitionDirection":"none","entryBarAdjustment":0,"btcLeading":true,"reasoning":"<max 20 words describing confidence in current move>"}

transitionDirection must be exactly: "strengthening" | "weakening" | "none"`;

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
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(`Claude API ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const text: string = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      const validRegimes = ['strong', 'moderate', 'weak', 'choppy', 'transitioning'];
      const validDirections = ['strengthening', 'weakening', 'none'];

      const state: RegimeAgentState = {
        btcRegime: validRegimes.includes(parsed.btcRegime) ? parsed.btcRegime : 'moderate',
        trendTransitioning: !!parsed.trendTransitioning,
        transitionDirection: validDirections.includes(parsed.transitionDirection) ? parsed.transitionDirection : 'none',
        entryBarAdjustment: Math.min(maxAdj, Math.max(-maxAdj, Math.round(Number(parsed.entryBarAdjustment) || 0))),
        btcLeading: parsed.btcLeading !== false,
        reasoning: String(parsed.reasoning ?? '').slice(0, 120),
        timestamp: new Date().toISOString(),
        source: 'agent',
      };

      const latencyMs = Date.now() - startMs;
      this.lastState = state;
      this.lastAnalyzedAt = Date.now();
      // track daily usage
      const today = new Date().toDateString();
      if (today !== this._callsResetAt) { this._callsToday = 0; this._callsResetAt = today; }
      this._callsToday++;

      const cacheTtl = env.AI_REGIME_AGENT_CACHE_TTL_SECONDS ?? 360;
      await setCached(CACHE_KEY, state, cacheTtl);

      logger.info('RegimeAgent: analysis complete', {
        btcRegime: state.btcRegime,
        trendTransitioning: state.trendTransitioning,
        transitionDirection: state.transitionDirection,
        entryBarAdjustment: state.entryBarAdjustment,
        btcLeading: state.btcLeading,
        reasoning: state.reasoning,
        model,
        latencyMs,
      });

      // Apply admin override if set
      if (this._adjustmentOverride !== null) {
        state.entryBarAdjustment = this._adjustmentOverride;
      }
      return state;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      logger.warn('RegimeAgent: analysis failed, no adjustment applied (safe fallback)', { error: msg });
      return null;
    }
  }
}

export const regimeAgent = new RegimeAgent();
