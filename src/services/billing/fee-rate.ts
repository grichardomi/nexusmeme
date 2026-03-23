import { query } from '@/lib/db';
import { getEnvironmentConfig, getExchangeTakerFee } from '@/config/environment';

// In-process cache: refreshed every 5 minutes, survives across requests in same server instance
const feeCache = new Map<string, { value: number; expiresAt: number }>();
const FEE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get taker fee for an exchange — DB-first (admin panel), env fallback.
 * Sync-friendly via 5-minute in-process cache. Use everywhere instead of getExchangeTakerFee().
 * Cache is pre-warmed on first async call; subsequent sync reads use cached value.
 */
export function getCachedTakerFee(exchange: string): number {
  const key = exchange.startsWith('binance') ? 'binance' : 'kraken';
  const cached = feeCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  // Cache miss or expired — return env fallback synchronously, refresh async
  warmFeeCache(key as 'binance' | 'kraken');
  return getExchangeTakerFee(exchange);
}

async function warmFeeCache(exchange: 'binance' | 'kraken'): Promise<void> {
  try {
    const rates = await getExchangeFeeRates(exchange);
    feeCache.set(exchange, { value: rates.taker_fee, expiresAt: Date.now() + FEE_CACHE_TTL_MS });
  } catch {
    // silently ignore — next call will retry
  }
}

export interface ExchangeFeeRates {
  taker_fee: number;
  maker_fee: number;
  min_profit_weak: number;
  min_profit_moderate: number;
  min_profit_strong: number;
}

/**
 * Get exchange fee rates from billing_settings DB.
 * Admin-manageable — no deploy needed when fees are negotiated.
 * Priority: billing_settings > env fallback
 */
export async function getExchangeFeeRates(exchange: 'binance' | 'kraken'): Promise<ExchangeFeeRates> {
  const env = getEnvironmentConfig();
  const prefix = exchange;

  const fallbacks: ExchangeFeeRates = exchange === 'binance'
    ? { taker_fee: env.BINANCE_TAKER_FEE_DEFAULT, maker_fee: env.BINANCE_TAKER_FEE_DEFAULT, min_profit_weak: 0.02, min_profit_moderate: 0.05, min_profit_strong: 0.12 }
    : { taker_fee: env.KRAKEN_TAKER_FEE_DEFAULT, maker_fee: env.KRAKEN_MAKER_FEE_DEFAULT, min_profit_weak: 0.025, min_profit_moderate: 0.05, min_profit_strong: 0.12 };

  try {
    const keys = [
      `${prefix}_taker_fee`, `${prefix}_maker_fee`,
      `${prefix}_min_profit_weak`, `${prefix}_min_profit_moderate`, `${prefix}_min_profit_strong`,
    ];
    const rows = await query(
      'SELECT key, value FROM billing_settings WHERE key = ANY($1)',
      [keys]
    );
    const map = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, parseFloat(String(r.value))]));
    return {
      taker_fee:          map[`${prefix}_taker_fee`]          ?? fallbacks.taker_fee,
      maker_fee:          map[`${prefix}_maker_fee`]          ?? fallbacks.maker_fee,
      min_profit_weak:    map[`${prefix}_min_profit_weak`]    ?? fallbacks.min_profit_weak,
      min_profit_moderate:map[`${prefix}_min_profit_moderate`]?? fallbacks.min_profit_moderate,
      min_profit_strong:  map[`${prefix}_min_profit_strong`]  ?? fallbacks.min_profit_strong,
    };
  } catch (err) {
    console.error(`[fee-rate] DB error fetching ${exchange} fees, using fallback:`, err);
    return fallbacks;
  }
}

/**
 * Get the effective fee rate for a user.
 * Priority: user override > global billing_settings > env fallback
 * No caching — always fresh DB read.
 */
export async function getEffectiveFeeRate(userId: string): Promise<number> {
  try {
    // 1. Check user-specific override
    const overrideResult = await query(
      'SELECT fee_rate FROM user_billing_overrides WHERE user_id = $1',
      [userId]
    );
    if (overrideResult[0]) {
      return parseFloat(String(overrideResult[0].fee_rate));
    }

    // 2. Check global billing_settings
    const settingResult = await query(
      "SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'",
      []
    );
    if (settingResult[0]) {
      return parseFloat(String(settingResult[0].value));
    }
  } catch (err) {
    console.error('[fee-rate] DB error, using env fallback:', err);
  }

  // 3. Emergency env fallback — only reaches here during a DB outage.
  // The authoritative rate is managed in billing_settings via /admin/fees.
  const env = getEnvironmentConfig();
  console.warn('[fee-rate] WARNING: DB unavailable — using PERFORMANCE_FEE_RATE env fallback. Fee rate may not reflect admin-configured value.');
  return env.PERFORMANCE_FEE_RATE;
}
