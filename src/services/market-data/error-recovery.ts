/**
 * Error Recovery Strategy for Price Streaming
 * Implements graceful degradation with multiple fallback levels
 *
 * Fallback Hierarchy:
 * 1. WebSocket (ideal, real-time)
 * 2. Redis Cache (good, 5 min old max)
 * 3. Local Cache (acceptable, may be stale)
 * 4. Degraded Mode (show warning to user)
 */

import { logger } from '@/lib/logger';
import { checkRedisPriceHealth } from './redis-price-distribution';
import type { PriceUpdate } from '@/types/market-data';

export enum FallbackLevel {
  WEBSOCKET = 'websocket',
  REDIS_CACHE = 'redis_cache',
  LOCAL_CACHE = 'local_cache',
  DEGRADED = 'degraded',
}

interface FallbackContext {
  pair: string;
  level: FallbackLevel;
  timestamp: number;
  ageMs: number;
  staleness: 'fresh' | 'acceptable' | 'stale';
}

/**
 * Error recovery strategy manager
 */
export class ErrorRecoveryStrategy {
  private localCache: Map<string, { price: PriceUpdate; timestamp: number }> = new Map();
  private redisHealthCheckInterval: NodeJS.Timeout | null = null;
  private redisHealthy = true;

  constructor() {
    // Periodically check Redis health
    this.startHealthChecks();
  }

  /**
   * Determine fallback level for a price
   */
  determineFallbackLevel(
    wsConnected: boolean,
    redisAvailable: boolean,
    localCached: boolean
  ): FallbackLevel {
    if (wsConnected) return FallbackLevel.WEBSOCKET;
    if (redisAvailable) return FallbackLevel.REDIS_CACHE;
    if (localCached) return FallbackLevel.LOCAL_CACHE;
    return FallbackLevel.DEGRADED;
  }

  /**
   * Analyze price staleness
   */
  analyzeStaleness(priceAge: number): 'fresh' | 'acceptable' | 'stale' {
    if (priceAge < 5000) return 'fresh'; // < 5 seconds
    if (priceAge < 60000) return 'acceptable'; // < 1 minute
    return 'stale'; // > 1 minute
  }

  /**
   * Log fallback context for debugging
   */
  logFallback(pair: string, context: FallbackContext): void {
    const level = context.level;
    const staleness = context.staleness;

    if (level === FallbackLevel.WEBSOCKET) {
      logger.debug('Price from WebSocket', { pair });
    } else if (level === FallbackLevel.REDIS_CACHE) {
      logger.info('Price fallback to Redis cache', {
        pair,
        ageMs: context.ageMs,
        staleness,
      });
    } else if (level === FallbackLevel.LOCAL_CACHE) {
      logger.warn('Price fallback to local cache', {
        pair,
        ageMs: context.ageMs,
        staleness,
      });
    } else {
      logger.error('Price completely unavailable', null, { pair });
    }
  }

  /**
   * Cache price locally as last-resort fallback
   */
  cacheLocalPrice(pair: string, price: PriceUpdate): void {
    this.localCache.set(pair, {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve locally cached price
   */
  getLocalCachedPrice(pair: string): PriceUpdate | null {
    const cached = this.localCache.get(pair);
    if (!cached) return null;

    const ageMs = Date.now() - cached.timestamp;
    if (ageMs > 300000) {
      // Expire after 5 minutes
      this.localCache.delete(pair);
      return null;
    }

    return cached.price;
  }

  /**
   * Check if Redis is healthy
   */
  isRedisHealthy(): boolean {
    return this.redisHealthy;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.redisHealthCheckInterval) {
      clearInterval(this.redisHealthCheckInterval);
    }

    // Check health every 30 seconds
    this.redisHealthCheckInterval = setInterval(async () => {
      try {
        const health = await checkRedisPriceHealth(['BTC/USDT', 'ETH/USDT']);
        const wasHealthy = this.redisHealthy;
        this.redisHealthy = health.healthy;

        if (!this.redisHealthy && wasHealthy) {
          logger.warn('Redis price distribution became unhealthy', {
            missing: health.missingPairs,
            stale: health.stalePairs,
          });
        } else if (this.redisHealthy && !wasHealthy) {
          logger.info('Redis price distribution recovered');
        }
      } catch (error) {
        logger.error('Health check failed', error instanceof Error ? error : null);
        this.redisHealthy = false;
      }
    }, 30000);
  }

  /**
   * Shutdown error recovery
   */
  shutdown(): void {
    if (this.redisHealthCheckInterval) {
      clearInterval(this.redisHealthCheckInterval);
      this.redisHealthCheckInterval = null;
    }
    this.localCache.clear();
  }

  /**
   * Get recovery status
   */
  getStatus(): {
    localCacheSize: number;
    redisHealthy: boolean;
    oldestCachedPrice: number | null;
  } {
    let oldestCachedPrice: number | null = null;

    for (const [, cached] of this.localCache.entries()) {
      const age = Date.now() - cached.timestamp;
      if (oldestCachedPrice === null || age > oldestCachedPrice) {
        oldestCachedPrice = age;
      }
    }

    return {
      localCacheSize: this.localCache.size,
      redisHealthy: this.redisHealthy,
      oldestCachedPrice,
    };
  }
}

/**
 * Singleton instance
 */
let instance: ErrorRecoveryStrategy | null = null;

export function getErrorRecoveryStrategy(): ErrorRecoveryStrategy {
  if (!instance) {
    instance = new ErrorRecoveryStrategy();
  }
  return instance;
}
