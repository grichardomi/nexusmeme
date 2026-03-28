/**
 * Admin parameter overrides — live runtime adjustments set via /admin/agents UI.
 * Stored in kv_cache so they survive restarts and apply immediately without a deploy.
 * The orchestrator calls getParamOverrides() and merges with env values.
 */

import { getCached } from '@/lib/redis';

export interface TradingParamOverrides {
  RISK_MIN_MOMENTUM_1H_BINANCE?: number;
  RISK_1H_BYPASS_4H_MIN?: number;
  RISK_1H_BYPASS_INTRABAR_MIN?: number;
  REGIME_SIZE_STRONG?: number;
  REGIME_SIZE_MODERATE?: number;
  REGIME_SIZE_WEAK?: number;
  REGIME_SIZE_TRANSITIONING?: number;
  REGIME_SIZE_CHOPPY?: number;
  PROFIT_TARGET_STRONG?: number;
  PROFIT_TARGET_MODERATE?: number;
  PROFIT_TARGET_WEAK?: number;
  PROFIT_TARGET_CHOPPY?: number;
  EROSION_PEAK_MIN_PCT?: number;
  EROSION_PEAK_RELATIVE_THRESHOLD?: number;
  RISK_BTC_MIN_VOLUME_RATIO?: number;
}

const OVERRIDES_KEY = 'admin:trading_param_overrides_v1';

let _cache: TradingParamOverrides | null = null;
let _cacheTs = 0;
const CACHE_MS = 10_000; // re-read from DB at most every 10s

export async function getParamOverrides(): Promise<TradingParamOverrides> {
  const now = Date.now();
  if (_cache !== null && now - _cacheTs < CACHE_MS) return _cache;
  try {
    const result = await getCached<TradingParamOverrides>(OVERRIDES_KEY);
    _cache = result ?? {};
    _cacheTs = now;
    return _cache;
  } catch {
    return _cache ?? {};
  }
}
