import { Redis } from '@upstash/redis';
import { redisConfig } from '@/config/environment';

/**
 * Singleton Redis client for Upstash
 * Cached after first initialization
 */
let redisClient: Redis | null = null;

/**
 * Get or create Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: redisConfig.url,
      token: redisConfig.token,
    });
  }
  return redisClient;
}

/**
 * Get a cached value from Redis
 * @param key Redis key
 * @returns Parsed JSON value or null if not found
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const value = await redis.get(key);
    return await parseCachedValue<T>(redis, key, value);
  } catch (error) {
    console.error(`Failed to get cached value for key ${key}:`, error);
    return null;
  }
}

/**
 * Get multiple cached values from Redis in one round trip
 * @param keys Redis keys
 * @returns Array of parsed JSON values (or null) in the same order as keys
 */
export async function getCachedMultiple<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];

  try {
    const redis = getRedisClient();
    const values = await redis.mget(...keys);

    return await Promise.all(
      values.map((value, index) => parseCachedValue<T>(redis, keys[index], value))
    );
  } catch (error) {
    console.error('Failed to get multiple cached values:', error);
    return keys.map(() => null);
  }
}

/**
 * Set a cached value in Redis with TTL
 * @param key Redis key
 * @param value Value to cache (will be JSON stringified)
 * @param ttlSeconds Time to live in seconds
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to set cached value for key ${key}:`, error);
  }
}

/**
 * Delete a cached value from Redis
 * @param key Redis key
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    console.error(`Failed to delete cached value for key ${key}:`, error);
  }
}

/**
 * Delete multiple cached values from Redis
 * @param keys Redis keys to delete
 */
export async function deleteCachedMultiple(keys: string[]): Promise<void> {
  try {
    const redis = getRedisClient();
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Failed to delete multiple cached values:`, error);
  }
}

/**
 * Increment a counter in Redis (for rate limiting)
 * @param key Redis key
 * @param expireSeconds Optional expiration time for the key
 * @returns New counter value
 */
export async function incrementCounter(
  key: string,
  expireSeconds?: number
): Promise<number> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(key);

    // Set expiration only on first increment
    if (count === 1 && expireSeconds) {
      await redis.expire(key, expireSeconds);
    }

    return count;
  } catch (error) {
    console.error(`Failed to increment counter for key ${key}:`, error);
    return 0;
  }
}

/**
 * Get a counter value from Redis
 * @param key Redis key
 * @returns Counter value or 0 if not found
 */
export async function getCounter(key: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const value = await redis.get<number>(key);
    return value ?? 0;
  } catch (error) {
    console.error(`Failed to get counter for key ${key}:`, error);
    return 0;
  }
}

/**
 * Check if a Redis key exists
 * @param key Redis key
 * @returns true if key exists, false otherwise
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    console.error(`Failed to check if key exists: ${key}:`, error);
    return false;
  }
}

/**
 * Invalidate all trades cache keys for a bot when it's updated or deleted
 * Covers both single-bot and all-bots cache variants across common limit values
 * @param userId User ID
 * @param botId Bot ID (optional - if not provided, only invalidates all-bots keys)
 */
export async function invalidateTradesCache(
  userId: string,
  botId?: string
): Promise<void> {
  // Common limit values that users might request
  const commonLimits = [5, 10, 20, 30, 50, 100];

  // Build keys to delete
  const keysToDelete: string[] = [];

  // Invalidate single-bot cache for all common limits
  if (botId) {
    for (const limit of commonLimits) {
      keysToDelete.push(`trades:user:${userId}:bot:${botId}:limit:${limit}`);
    }
    // Also try to invalidate stats key if it exists
    keysToDelete.push(`trades:stats:user:${userId}:bot:${botId}`);
  }

  // Invalidate all-bots cache for all common limits
  for (const limit of commonLimits) {
    keysToDelete.push(`trades:user:${userId}:allbots:limit:${limit}`);
  }

  // Delete all keys in batch
  if (keysToDelete.length > 0) {
    await deleteCachedMultiple(keysToDelete);
  }
}

/**
 * Parse a Redis value into JSON with validation and cleanup on bad entries
 */
async function parseCachedValue<T>(
  redis: Redis,
  key: string,
  value: unknown
): Promise<T | null> {
  // Nothing cached
  if (value === null || value === undefined) return null;

  // Already a parsed object (Upstash can return objects)
  if (typeof value === 'object') {
    return value as T;
  }

  // String payload - attempt to parse JSON
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      // Bad cache entry: clear and refetch
      await redis.del(key);
      console.error(`Invalid JSON in cache for key ${key}, entry cleared`);
      return null;
    }
  }

  // Unknown type: clear and refetch
  await redis.del(key);
  console.error(`Unexpected cache type for key ${key}, entry cleared`);
  return null;
}
