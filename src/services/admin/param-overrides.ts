/**
 * Admin parameter overrides — live runtime adjustments set via /admin/agents UI.
 * Stored in kv_cache so they survive restarts and apply immediately without a deploy.
 * The orchestrator calls getParamOverrides() and merges with env values.
 */

import { getCached } from '@/lib/redis';
import type { TradingParamOverrides } from '@/app/api/admin/trading-params/route';

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
