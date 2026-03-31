/**
 * Transition Detector Agent
 *
 * Detects the specific moment when a choppy/weak market is transitioning into a
 * trending regime — typically 2-4 candles before momentum math fully confirms it.
 *
 * Architecture (zero hot-path impact — identical pattern to regime-agent):
 *   Orchestrator cycle → analyze(indicators) → writes to in-memory + kv_cache
 *   Entry scorer       → getState(pair)       → reads in-memory (<1ms) or cache (<5ms)
 *
 * When it fires:
 *   - 2h momentum recently crossed above 0 (recovery starting)
 *   - trendScore is 1-2 (borderline — not yet confirmed by math alone)
 *   - mom1h is below the standard floor but above the transition floor
 *
 * What it asks Claude:
 *   "Given these candle patterns, volume trend, and BTC context —
 *    is this a genuine choppy→trending transition or a false bounce?"
 *
 * What it returns:
 *   transitionConfidence: 0-100 (how likely this move sustains)
 *   riskLevel: low | medium | high
 *   estimatedHoldMinutes: how long the move likely runs
 *   intrabarFloorAdjustment: how much to lower the intrabar entry floor (0 = no change)
 *   NOTE: mom1hFloorAdjustment is DEPRECATED — 1h floor was removed (lagging indicator)
 *
 * Cost control:
 *   - Claude Haiku called at most once per AI_TRANSITION_AGENT_CACHE_TTL_SECONDS per pair
 *   - Hard timeout falls back to null — entry uses standard math gates, no trading impact
 *   - Cache keyed on pair + price bucket (rounds to nearest 0.2%) — same price = same answer
 *   - Only fires when market is in transition zone — zero calls in confirmed trending/choppy
 */

import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { getCached, setCached } from '@/lib/redis';
import type { TechnicalIndicators } from '@/types/ai';

export interface TransitionAgentState {
  transitionConfidence: number;          // 0-100: how likely the move is genuine
  riskLevel: 'low' | 'medium' | 'high'; // entry risk assessment
  estimatedHoldMinutes: number;          // expected duration of the move
  /** @deprecated 1h floor removed — lagging indicator. Use intrabarFloorAdjustment instead. */
  mom1hFloorAdjustment: number;
  intrabarFloorAdjustment: number;       // how much to lower intrabar entry floor (0 = no change)
  reasoning: string;                     // max 25 words
  timestamp: string;                     // ISO string
  pair: string;
}

const CACHE_KEY_PREFIX = 'agent:transition_v1:';

/** Round price to nearest bucket for cache keying — same price range = same analysis */
function priceBucket(price: number, bucketPct: number): string {
  const bucket = Math.round(price / (price * bucketPct / 100)) * (price * bucketPct / 100);
  return bucket.toFixed(2);
}

class TransitionDetectorAgent {
  // Per-pair in-memory state
  private lastState = new Map<string, TransitionAgentState>();
  private lastAnalyzedAt = new Map<string, number>();
  private kvCacheFailing = false;
  private _callsToday = 0;
  private _callsResetAt = new Date().toDateString();

  get callsToday(): number {
    const today = new Date().toDateString();
    if (today !== this._callsResetAt) { this._callsToday = 0; this._callsResetAt = today; }
    return this._callsToday;
  }

  /** Flush cache for a specific pair (or all pairs if omitted) */
  flushCache(pair?: string): void {
    if (pair) {
      this.lastState.delete(pair);
      this.lastAnalyzedAt.delete(pair);
    } else {
      this.lastState.clear();
      this.lastAnalyzedAt.clear();
    }
    this.kvCacheFailing = false;
  }

  /**
   * Read current transition state for a pair.
   * Returns in-memory → kv_cache → null. Safe to call on hot path.
   */
  async getState(pair: string, price: number): Promise<TransitionAgentState | null> {
    const env = getEnvironmentConfig();
    const ttlMs = env.AI_TRANSITION_AGENT_CACHE_TTL_SECONDS * 1000;
    const cacheKey = `${CACHE_KEY_PREFIX}${pair}:${priceBucket(price, env.AI_TRANSITION_PRICE_BUCKET_PCT)}`;

    // 1. In-memory
    const inMem = this.lastState.get(pair);
    const analyzedAt = this.lastAnalyzedAt.get(pair) ?? 0;
    if (inMem && (Date.now() - analyzedAt) < ttlMs) {
      return inMem;
    }

    // 2. kv_cache
    try {
      const cached = await getCached<TransitionAgentState>(cacheKey);
      this.kvCacheFailing = false;
      if (cached) {
        this.lastState.set(pair, cached);
        this.lastAnalyzedAt.set(pair, new Date(cached.timestamp).getTime());
        return cached;
      }
    } catch {
      if (!this.kvCacheFailing) {
        logger.warn('TransitionDetectorAgent: kv_cache unavailable, using stale in-memory state');
      }
      this.kvCacheFailing = true;
      return inMem ?? null;
    }

    return null;
  }

  /**
   * Determine if the current market state is in the transition zone.
   * Transition zone = borderline conditions where math alone can't decide.
   * Returns false in clearly confirmed trending or clearly confirmed choppy — saves Claude calls.
   */
  isInTransitionZone(indicators: TechnicalIndicators, btcMomentum1h: number): boolean {
    const env = getEnvironmentConfig();
    const mom1h = indicators.momentum1h ?? 0;
    const mom2h = indicators.momentum2h ?? 0;
    const mom4h = indicators.momentum4h ?? 0;
    const trendScore = indicators.trendScore ?? 0;

    // Not in transition if 4h is crashing (crash guard will block anyway)
    if (mom4h < env.RISK_CRASH_GUARD_4H_PCT) return false;

    // Not in transition if already clearly trending (math gates will pass without help)
    const clearlyTrending = mom1h >= env.RISK_MIN_MOMENTUM_1H_BINANCE && mom2h > 0 && trendScore >= 2;
    if (clearlyTrending) return false;

    // Not in transition if clearly choppy with no recovery signs
    const clearlyChoppy = mom2h < env.AI_TRANSITION_2H_FLOOR_PCT && trendScore <= 0 && mom1h < 0;
    if (clearlyChoppy) return false;

    // Transition zone: 2h recently crossed 0 OR 1h below floor but trendScore building
    const recoveringMomentum = mom2h >= 0 && mom2h < env.AI_TRANSITION_2H_MAX_PCT;
    const borderline1h = mom1h >= env.AI_TRANSITION_1H_MIN_PCT && mom1h < env.RISK_MIN_MOMENTUM_1H_BINANCE;
    const buildingScore = trendScore >= 1;
    const btcNotCrashing = btcMomentum1h > env.AI_TRANSITION_BTC_MIN_1H_PCT;

    return (recoveringMomentum || borderline1h) && buildingScore && btcNotCrashing;
  }

  /**
   * Run transition analysis for a pair.
   * Only calls Claude when in transition zone and cache is expired.
   * Returns null on timeout/failure — standard math gates apply, no trading impact.
   */
  async analyze(
    pair: string,
    price: number,
    indicators: TechnicalIndicators,
    btcMomentum1h: number,
    recentCloses: number[],  // last 8 closes (2h of 15m candles)
  ): Promise<TransitionAgentState | null> {
    const env = getEnvironmentConfig();

    if (!env.AI_TRANSITION_AGENT_ENABLED) return null;

    // Return cached state if still fresh
    const existing = await this.getState(pair, price);
    if (existing) {
      logger.debug('TransitionDetectorAgent: cache hit', {
        pair, confidence: existing.transitionConfidence, riskLevel: existing.riskLevel,
        ageSeconds: Math.round((Date.now() - new Date(existing.timestamp).getTime()) / 1000),
      });
      return existing;
    }

    // Circuit breaker — skip Claude if kv_cache is down to prevent unbounded calls
    if (this.kvCacheFailing) {
      logger.debug('TransitionDetectorAgent: circuit breaker active, skipping Claude call');
      return this.lastState.get(pair) ?? null;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const mom1h = (indicators.momentum1h ?? 0).toFixed(3);
    const mom2h = (indicators.momentum2h ?? 0).toFixed(3);
    const mom4h = (indicators.momentum4h ?? 0).toFixed(3);
    const slope = (indicators.momentumSlope ?? 0).toFixed(3);
    const intrabar = (indicators.intrabarMomentum ?? 0).toFixed(3);
    const volRatio = (indicators.volumeRatio ?? 1).toFixed(2);
    const trendScore = indicators.trendScore ?? 0;
    const higherCloses = indicators.higherCloses ?? false;
    const maxFloorAdj = env.AI_TRANSITION_MAX_FLOOR_ADJ;

    // Candle direction summary: compress 8 closes into directional sequence
    const candleDirs = recentCloses.slice(-8).map((c, i, arr) =>
      i === 0 ? '·' : (c > arr[i - 1] ? '▲' : c < arr[i - 1] ? '▼' : '·')
    ).join('');

    const prompt = `Crypto spot trading system — ${pair} transition analysis.

Market data (15m candles, last 2h):
- Candle direction (oldest→newest): ${candleDirs}
- 1h momentum: ${mom1h}%  (context only — not an entry gate, lagging indicator)
- 2h momentum: ${mom2h}%  (just crossed 0 = recovery starting)
- 4h momentum: ${mom4h}%  (prior dump, still negative)
- Momentum slope: ${slope}%  (positive = accelerating)
- Intrabar: ${intrabar}%  (current price vs last close)
- Volume ratio: ${volRatio}x  (vs 20-candle avg)
- Trend score: ${trendScore}/3  (higher closes=${higherCloses})
- BTC 1h momentum: ${(btcMomentum1h).toFixed(3)}%

Question: Is this a GENUINE choppy→trending transition or a false bounce?
Consider: candle pattern consistency, volume trend, momentum acceleration, BTC confirmation.

Rules:
- False bounce = choppy candles + thin volume + slope decelerating → riskLevel=high, confidence<50, intrabarFloorAdjustment=0
- Genuine transition = consistent higher closes + volume building + slope positive → riskLevel=low/medium, confidence>65
- Ambiguous = mixed signals → riskLevel=medium, confidence 45-65, intrabarFloorAdjustment=0
- intrabarFloorAdjustment: 0 to ${maxFloorAdj} (how much to lower the intrabar entry floor — only if genuinely confident, 0 if any doubt)
- estimatedHoldMinutes: realistic hold time if entry taken (15-120)

Return ONLY raw JSON (no markdown, no backticks):
{"transitionConfidence":0-100,"riskLevel":"low|medium|high","estimatedHoldMinutes":15,"intrabarFloorAdjustment":0.0,"reasoning":"<max 25 words>"}`;

    const timeoutMs = env.AI_TRANSITION_AGENT_TIMEOUT_MS;
    const model = env.AI_TRANSITION_AGENT_MODEL;
    const cacheTtl = env.AI_TRANSITION_AGENT_CACHE_TTL_SECONDS;
    const cacheKey = `${CACHE_KEY_PREFIX}${pair}:${priceBucket(price, env.AI_TRANSITION_PRICE_BUCKET_PCT)}`;

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
            max_tokens: 120,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) throw new Error(`Claude API ${response.status}`);

      const data = await response.json();
      const text: string = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      const validRisk = ['low', 'medium', 'high'];

      const state: TransitionAgentState = {
        transitionConfidence: Math.min(100, Math.max(0, Math.round(Number(parsed.transitionConfidence) || 50))),
        riskLevel: validRisk.includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
        estimatedHoldMinutes: Math.min(120, Math.max(15, Math.round(Number(parsed.estimatedHoldMinutes) || 30))),
        mom1hFloorAdjustment: 0, // deprecated
        intrabarFloorAdjustment: Math.min(maxFloorAdj, Math.max(0, Number(parsed.intrabarFloorAdjustment) || 0)),
        reasoning: String(parsed.reasoning ?? '').slice(0, 150),
        timestamp: new Date().toISOString(),
        pair,
      };

      // Never lower floor on high risk — override if Claude got confused
      if (state.riskLevel === 'high') state.intrabarFloorAdjustment = 0;
      // Never lower floor if confidence below threshold
      if (state.transitionConfidence < env.AI_TRANSITION_AGENT_MIN_CONFIDENCE) state.intrabarFloorAdjustment = 0;

      const latencyMs = Date.now() - startMs;
      this.lastState.set(pair, state);
      this.lastAnalyzedAt.set(pair, Date.now());

      const today = new Date().toDateString();
      if (today !== this._callsResetAt) { this._callsToday = 0; this._callsResetAt = today; }
      this._callsToday++;

      await setCached(cacheKey, state, cacheTtl);

      logger.info('TransitionDetectorAgent: analysis complete', {
        pair, price,
        transitionConfidence: state.transitionConfidence,
        riskLevel: state.riskLevel,
        estimatedHoldMinutes: state.estimatedHoldMinutes,
        intrabarFloorAdjustment: state.intrabarFloorAdjustment,
        reasoning: state.reasoning,
        model, latencyMs,
      });

      return state;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      logger.warn('TransitionDetectorAgent: analysis failed, standard gates apply', { pair, error: msg });
      return null;
    }
  }
}

export const transitionDetectorAgent = new TransitionDetectorAgent();
