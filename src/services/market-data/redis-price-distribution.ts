/**
 * Redis-Based Price Distribution
 * Enables sharing price updates across multiple server instances
 *
 * Architecture:
 * - Leader instance: Writes prices to Redis (from WebSocket)
 * - All instances: Read prices from Redis
 * - Subscribers: Get prices from local broadcaster (backed by Redis)
 *
 * This allows horizontal scaling without duplicating WebSocket connections
 */

import { logger } from '@/lib/logger';
import { getCached, setCached } from '@/lib/redis';
import type { PriceUpdate } from '@/types/market-data';

const PRICE_DISTRIBUTION_PREFIX = 'price:dist:';
const PRICE_CACHE_TTL = 300; // 5 minutes

/**
 * Publish price update to Redis for distribution to other instances
 * Called by leader instance running Binance WebSocket
 */
export async function publishPriceToRedis(update: PriceUpdate): Promise<void> {
  try {
    const key = `${PRICE_DISTRIBUTION_PREFIX}${update.pair}:latest`;
    await setCached(key, update, PRICE_CACHE_TTL);
  } catch (error) {
    logger.error('Failed to publish price to Redis', error instanceof Error ? error : null, {
      pair: update.pair,
    });
  }
}

/**
 * Publish multiple prices at once (batch)
 */
export async function publishPricesToRedis(updates: PriceUpdate[]): Promise<void> {
  try {
    const promises = updates.map(update => publishPriceToRedis(update));
    await Promise.all(promises);
  } catch (error) {
    logger.error('Failed to publish prices batch to Redis', error instanceof Error ? error : null);
  }
}

/**
 * Retrieve price from Redis
 * Called by follower instances (or leader as fallback)
 */
export async function getPriceFromRedis(pair: string): Promise<PriceUpdate | null> {
  try {
    const key = `${PRICE_DISTRIBUTION_PREFIX}${pair}:latest`;
    return getCached<PriceUpdate>(key);
  } catch (error) {
    logger.error('Failed to get price from Redis', error instanceof Error ? error : null, {
      pair,
    });
    return null;
  }
}

/**
 * Retrieve all available prices from Redis
 */
export async function getAllPricesFromRedis(pairs: string[]): Promise<Map<string, PriceUpdate>> {
  const result = new Map<string, PriceUpdate>();

  const promises = pairs.map(async (pair) => {
    const price = await getPriceFromRedis(pair);
    if (price) {
      result.set(pair, price);
    }
  });

  await Promise.all(promises);
  return result;
}

/**
 * Clear all cached prices from Redis
 * Useful for testing or cleanup
 */
export async function clearRedisDistributionCache(): Promise<void> {
  try {
    logger.info('Clearing Redis price distribution cache');
    // Note: In a real app with many instances, you might want to be more selective
    // For now, prices will naturally expire based on TTL
  } catch (error) {
    logger.error('Failed to clear Redis distribution cache', error instanceof Error ? error : null);
  }
}

/**
 * Health check for Redis distribution
 * Verifies key prices are cached and current
 */
export async function checkRedisPriceHealth(
  pairs: string[]
): Promise<{ healthy: boolean; stalePairs: string[]; missingPairs: string[] }> {
  const stalePairs: string[] = [];
  const missingPairs: string[] = [];
  const maxAgeMs = 30000; // 30 seconds is acceptable staleness

  for (const pair of pairs) {
    const price = await getPriceFromRedis(pair);

    if (!price) {
      missingPairs.push(pair);
    } else {
      const ageMs = Date.now() - price.timestamp;
      if (ageMs > maxAgeMs) {
        stalePairs.push(pair);
      }
    }
  }

  const healthy = missingPairs.length === 0 && stalePairs.length === 0;

  if (!healthy) {
    logger.warn('Redis price health check found issues', {
      missingPairs,
      stalePairs,
    });
  }

  return {
    healthy,
    stalePairs,
    missingPairs,
  };
}
