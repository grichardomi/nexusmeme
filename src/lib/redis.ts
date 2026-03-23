/**
 * PG-backed key-value cache — drop-in replacement for Upstash Redis.
 *
 * Uses the `kv_cache` table (see migrations/kv-cache.sql).
 * All functions silently return null/0/false on error so callers degrade
 * gracefully, matching the previous Upstash behaviour.
 */

import { query } from '@/lib/db';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS kv_cache (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS kv_cache_expires_at_idx ON kv_cache (expires_at)
  `);
}

let tableReady = false;
async function getReady(): Promise<void> {
  if (tableReady) return;
  await ensureTable();
  tableReady = true;
}

// Purge expired rows periodically (fire-and-forget, best-effort)
setInterval(() => {
  query(`DELETE FROM kv_cache WHERE expires_at < NOW()`).catch(() => {});
}, 60_000);

// ---------------------------------------------------------------------------
// Public API — same signatures as the old Upstash wrappers
// ---------------------------------------------------------------------------

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    await getReady();
    const rows = await query<{ value: string }>(
      `SELECT value FROM kv_cache WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );
    if (!rows.length) return null;
    return JSON.parse(rows[0].value) as T;
  } catch (error) {
    console.error(`getCached error for key ${key}:`, error);
    return null;
  }
}

export async function getCachedMultiple<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  try {
    await getReady();
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM kv_cache WHERE key IN (${placeholders}) AND expires_at > NOW()`,
      keys
    );
    const map = new Map(rows.map(r => [r.key, r.value]));
    return keys.map(k => {
      const raw = map.get(k);
      if (!raw) return null;
      try { return JSON.parse(raw) as T; } catch { return null; }
    });
  } catch (error) {
    console.error('getCachedMultiple error:', error);
    return keys.map(() => null);
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getReady();
    await query(
      `INSERT INTO kv_cache (key, value, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(value), ttlSeconds]
    );
  } catch (error) {
    console.error(`setCached error for key ${key}:`, error);
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    await getReady();
    await query(`DELETE FROM kv_cache WHERE key = $1`, [key]);
  } catch (error) {
    console.error(`deleteCached error for key ${key}:`, error);
  }
}

export async function deleteCachedMultiple(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await getReady();
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    await query(`DELETE FROM kv_cache WHERE key IN (${placeholders})`, keys);
  } catch (error) {
    console.error('deleteCachedMultiple error:', error);
  }
}

export async function incrementCounter(key: string, expireSeconds?: number): Promise<number> {
  try {
    await getReady();
    const ttl = expireSeconds ?? 3600;
    const rows = await query<{ value: string }>(
      `INSERT INTO kv_cache (key, value, expires_at)
       VALUES ($1, '1', NOW() + ($2 || ' seconds')::INTERVAL)
       ON CONFLICT (key) DO UPDATE
         SET value = (kv_cache.value::BIGINT + 1)::TEXT
       RETURNING value`,
      [key, ttl]
    );
    return parseInt(rows[0]?.value ?? '0', 10);
  } catch (error) {
    console.error(`incrementCounter error for key ${key}:`, error);
    return 0;
  }
}

export async function getCounter(key: string): Promise<number> {
  try {
    const raw = await getCached<string>(key);
    return raw ? parseInt(String(raw), 10) : 0;
  } catch {
    return 0;
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  try {
    await getReady();
    const rows = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM kv_cache WHERE key = $1 AND expires_at > NOW()
       ) AS exists`,
      [key]
    );
    return rows[0]?.exists ?? false;
  } catch (error) {
    console.error(`cacheExists error for key ${key}:`, error);
    return false;
  }
}

export async function invalidateTradesCache(userId: string, botId?: string): Promise<void> {
  const commonLimits = [5, 10, 20, 30, 50, 100];
  const keysToDelete: string[] = [];

  if (botId) {
    for (const limit of commonLimits) {
      keysToDelete.push(`trades:user:${userId}:bot:${botId}:limit:${limit}`);
    }
    keysToDelete.push(`trades:stats:user:${userId}:bot:${botId}`);
  }

  for (const limit of commonLimits) {
    keysToDelete.push(`trades:user:${userId}:allbots:limit:${limit}`);
  }

  await deleteCachedMultiple(keysToDelete);
}
