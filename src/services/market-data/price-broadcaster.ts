/**
 * Price Broadcaster for SSE clients
 * Manages subscriptions to price updates and broadcasts to connected clients
 * Provides fallback to Redis cache when WebSocket unavailable
 *
 * RATE LIMITING STRATEGY:
 * - Binance WebSocket: Single connection (unlimited from Binance)
 * - SSE broadcast: O(subscribers) complexity, debounced in hook
 * - REST fallback: ONLY if cache expires, not per-user polling
 * - Redis cache acts as circuit breaker for REST abuse
 */

import { logger } from '@/lib/logger';
import { getCached } from '@/lib/redis';
import { getBinanceWebSocketClient } from './websocket-client';
import { getPriceFromRedis } from './redis-price-distribution';
import { getPriceLeaderElection } from './leader-election';
import { getErrorRecoveryStrategy } from './error-recovery';
import type { PriceUpdate, PriceSubscriber } from '@/types/market-data';

interface BroadcasterSubscription {
  pair: string;
  callbacks: Set<PriceSubscriber>;
  unsubscribeFromWs: (() => void) | null;
}

/**
 * Price Broadcaster singleton
 * Manages subscriptions from SSE clients and broadcasts price updates
 *
 * Rate limiting:
 * - Max 1 REST request per pair per 15 seconds (cache TTL)
 * - Shared cache across all users (no per-user polling)
 * - WebSocket as primary (no rate limit concerns)
 */
class PriceBroadcaster {
  private subscriptions: Map<string, BroadcasterSubscription> = new Map();
  private initialized = false;
  private isLeader = false;
  private redisPollingInterval: NodeJS.Timeout | null = null;
  private lastRedisPrice: Map<string, PriceUpdate> = new Map(); // Track last seen prices to detect changes
  private errorRecovery = getErrorRecoveryStrategy(); // Local fallback cache

  /**
   * Initialize broadcaster and start appropriate streaming
   * - Leaders: Connect to Binance WebSocket
   * - Followers: Poll Redis for price updates
   */
  async initialize(pairs: string[]): Promise<void> {
    if (this.initialized || pairs.length === 0) {
      return;
    }

    try {
      // Determine if we're the leader
      const leaderElection = getPriceLeaderElection();
      this.isLeader = await leaderElection.becomeLeader();

      if (this.isLeader) {
        // LEADER PATH: Connect to Binance WebSocket
        const client = getBinanceWebSocketClient();
        await client.connect(pairs);
        logger.info('Price broadcaster initialized as LEADER', { pairs: pairs.length });
      } else {
        // FOLLOWER PATH: Start polling Redis for price updates
        await this.startRedisPolling(pairs);
        logger.info('Price broadcaster initialized as FOLLOWER, polling Redis', { pairs: pairs.length });
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize price broadcaster', error instanceof Error ? error : null);
      // Continue - will fall back to cached data
    }
  }

  /**
   * Start polling Redis for price updates (for follower instances)
   * This enables followers to stream prices to SSE clients without connecting to Binance
   */
  private async startRedisPolling(pairs: string[]): Promise<void> {
    if (this.redisPollingInterval) {
      clearInterval(this.redisPollingInterval);
    }

    // Store pairs in a ref so new pairs can be added dynamically
    const pollingPairs = new Set(pairs);

    const pollPrices = async () => {
      try {
        for (const pair of pollingPairs) {
          const price = await getPriceFromRedis(pair);

          if (price) {
            // Check if price has changed since last poll
            const lastPrice = this.lastRedisPrice.get(pair);
            if (!lastPrice || lastPrice.timestamp !== price.timestamp) {
              // Price changed - broadcast to local subscribers
              this.lastRedisPrice.set(pair, price);
              this.broadcast(pair, price);
            }
          }
        }
      } catch (error) {
        logger.error('Error polling Redis for prices', error instanceof Error ? error : null);
      }
    };

    // Store pollPrices and pollingPairs on instance for dynamic updates
    (this as any).__redisPollingPairs = pollingPairs;
    (this as any).__pollPricesFunc = pollPrices;

    // Poll Redis every 1 second for price updates
    // This provides near-real-time updates while minimizing Redis requests
    this.redisPollingInterval = setInterval(pollPrices, 1000);

    // Do initial poll immediately
    await pollPrices();

    logger.info('Redis polling started for follower instance', { pairs: pairs.length });
  }

  /**
   * Add a new pair to Redis polling (for followers receiving new subscriptions)
   */
  private addPairToRedisPolling(pair: string): void {
    if (!this.isLeader && (this as any).__redisPollingPairs) {
      const pollingPairs = (this as any).__redisPollingPairs as Set<string>;
      if (!pollingPairs.has(pair)) {
        pollingPairs.add(pair);
        logger.info('Added pair to Redis polling set', { pair, totalPairs: pollingPairs.size });
      }
    }
  }

  /**
   * Subscribe to price updates for a pair
   * Manages internal subscriptions and WebSocket subscriptions
   * Dynamically adds new pairs to WebSocket/Redis if needed
   */
  subscribe(pair: string, callback: PriceSubscriber): () => void {
    let subscription = this.subscriptions.get(pair);

    // Create new subscription if doesn't exist
    if (!subscription) {
      subscription = {
        pair,
        callbacks: new Set(),
        unsubscribeFromWs: null,
      };

      // Subscribe to WebSocket updates
      const client = getBinanceWebSocketClient();
      subscription.unsubscribeFromWs = client.subscribe(pair, (update: PriceUpdate) => {
        this.broadcast(pair, update);
      });

      this.subscriptions.set(pair, subscription);
      logger.debug('New price subscription created', { pair });

      // If we're already initialized, add pair to appropriate source
      if (this.initialized) {
        if (this.isLeader) {
          // Leader: add to WebSocket subscription
          const currentPairs = client.getSubscribedPairs();
          if (!currentPairs.includes(pair)) {
            logger.info('Adding new pair to WebSocket subscription', { pair });
            client.addPairs([pair]).catch(error => {
              logger.error('Failed to add pair to WebSocket', error instanceof Error ? error : undefined, { pair });
            });
          }
        } else {
          // Follower: add to Redis polling set
          this.addPairToRedisPolling(pair);
        }
      }
    }

    // Add callback to subscription
    subscription.callbacks.add(callback);
    logger.debug('Callback added to subscription', { pair, callbacks: subscription.callbacks.size });

    // Return unsubscribe function
    return () => {
      subscription!.callbacks.delete(callback);
      logger.debug('Callback removed from subscription', { pair, remaining: subscription!.callbacks.size });

      // Clean up subscription if no more callbacks
      if (subscription!.callbacks.size === 0) {
        if (subscription!.unsubscribeFromWs) {
          subscription!.unsubscribeFromWs();
        }
        this.subscriptions.delete(pair);
        logger.debug('Subscription cleaned up', { pair });
      }
    };
  }

  /**
   * Broadcast price update to all subscribers
   * Also caches locally for fallback
   */
  private broadcast(pair: string, update: PriceUpdate): void {
    const subscription = this.subscriptions.get(pair);
    if (!subscription) return;

    // Cache locally for fallback/recovery
    this.errorRecovery.cacheLocalPrice(pair, update);

    subscription.callbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        logger.error('Broadcast callback failed', error instanceof Error ? error : null, { pair });
      }
    });
  }

  /**
   * Get cached price with 4-level fallback cascade
   * 1. Redis distribution (from leader via Redis)
   * 2. Local error recovery cache (most recent price seen)
   * 3. Legacy cache key
   * 4. None available
   */
  async getCachedPrice(pair: string): Promise<PriceUpdate | null> {
    try {
      // Level 1: Check Redis distribution (from leader instance)
      const redisPrice = await getPriceFromRedis(pair);
      if (redisPrice) {
        logger.debug('Retrieved price from Redis distribution', { pair });
        return redisPrice;
      }

      // Level 2: Check local error recovery cache (most recent price broadcasted)
      const localPrice = this.errorRecovery.getLocalCachedPrice(pair);
      if (localPrice) {
        logger.debug('Retrieved price from local recovery cache', { pair });
        return localPrice;
      }

      // Level 3: Fall back to legacy cache key
      const cacheKey = `price:${pair}:latest`;
      const legacyPrice = await getCached<PriceUpdate>(cacheKey);
      if (legacyPrice) {
        logger.debug('Retrieved price from legacy cache', { pair });
        return legacyPrice;
      }

      // Level 4: No cache available
      logger.debug('No cached price available', { pair });
      return null;
    } catch (error) {
      logger.error('Error getting cached price', error instanceof Error ? error : null, { pair });
      // Last resort: try recovery cache even on error
      return this.errorRecovery.getLocalCachedPrice(pair);
    }
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Shutdown broadcaster
   */
  shutdown(): void {
    logger.info('Shutting down price broadcaster');

    // Stop Redis polling if running (follower mode)
    if (this.redisPollingInterval) {
      clearInterval(this.redisPollingInterval);
      this.redisPollingInterval = null;
    }

    // Unsubscribe from all pairs
    for (const subscription of this.subscriptions.values()) {
      if (subscription.unsubscribeFromWs) {
        subscription.unsubscribeFromWs();
      }
    }

    this.subscriptions.clear();
    this.lastRedisPrice.clear();
    this.initialized = false;

    // Disconnect WebSocket (if leader)
    if (this.isLeader) {
      const client = getBinanceWebSocketClient();
      client.disconnect();
    }
  }

  /**
   * Get broadcaster status
   */
  getStatus(): {
    initialized: boolean;
    role: 'leader' | 'follower';
    activeSubscriptions: number;
    subscribedPairs: string[];
    recoveryStatus: {
      localCacheSize: number;
      redisHealthy: boolean;
      oldestCachedPrice: number | null;
    };
  } {
    const recoveryStatus = this.errorRecovery.getStatus();
    return {
      initialized: this.initialized,
      role: this.isLeader ? 'leader' : 'follower',
      activeSubscriptions: this.subscriptions.size,
      subscribedPairs: Array.from(this.subscriptions.keys()),
      recoveryStatus,
    };
  }
}

/**
 * Singleton instance
 */
let instance: PriceBroadcaster | null = null;

export function getPriceBroadcaster(): PriceBroadcaster {
  if (!instance) {
    instance = new PriceBroadcaster();
  }
  return instance;
}
