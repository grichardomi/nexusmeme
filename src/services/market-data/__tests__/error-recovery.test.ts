/**
 * Tests for Error Recovery Strategy
 * Tests fallback mechanisms and degraded mode handling
 */

import { ErrorRecoveryStrategy, FallbackLevel } from '../error-recovery';
import type { PriceUpdate } from '@/types/market-data';

describe('ErrorRecoveryStrategy', () => {
  let strategy: ErrorRecoveryStrategy;

  beforeEach(() => {
    strategy = new ErrorRecoveryStrategy();
  });

  afterEach(() => {
    strategy.shutdown();
  });

  describe('Fallback Level Determination', () => {
    it('should return WEBSOCKET when all connected', () => {
      const level = strategy.determineFallbackLevel(
        true,  // wsConnected
        true,  // redisAvailable
        true   // localCached
      );

      expect(level).toBe(FallbackLevel.WEBSOCKET);
    });

    it('should fall back to REDIS_CACHE when WebSocket fails', () => {
      const level = strategy.determineFallbackLevel(
        false,  // wsConnected
        true,   // redisAvailable
        true    // localCached
      );

      expect(level).toBe(FallbackLevel.REDIS_CACHE);
    });

    it('should fall back to LOCAL_CACHE when Redis fails', () => {
      const level = strategy.determineFallbackLevel(
        false,  // wsConnected
        false,  // redisAvailable
        true    // localCached
      );

      expect(level).toBe(FallbackLevel.LOCAL_CACHE);
    });

    it('should use DEGRADED mode when all fail', () => {
      const level = strategy.determineFallbackLevel(
        false,  // wsConnected
        false,  // redisAvailable
        false   // localCached
      );

      expect(level).toBe(FallbackLevel.DEGRADED);
    });
  });

  describe('Staleness Analysis', () => {
    it('should classify fresh prices', () => {
      const freshAge = 2000; // 2 seconds
      const staleness = strategy.analyzeStaleness(freshAge);

      expect(staleness).toBe('fresh');
    });

    it('should classify acceptable prices', () => {
      const acceptableAge = 45000; // 45 seconds
      const staleness = strategy.analyzeStaleness(acceptableAge);

      expect(staleness).toBe('acceptable');
    });

    it('should classify stale prices', () => {
      const staleAge = 90000; // 90 seconds
      const staleness = strategy.analyzeStaleness(staleAge);

      expect(staleness).toBe('stale');
    });

    it('should use correct boundaries', () => {
      expect(strategy.analyzeStaleness(4999)).toBe('fresh');
      expect(strategy.analyzeStaleness(5000)).toBe('acceptable');
      expect(strategy.analyzeStaleness(59999)).toBe('acceptable');
      expect(strategy.analyzeStaleness(60000)).toBe('stale');
    });
  });

  describe('Local Caching', () => {
    it('should cache prices locally', () => {
      const mockPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: Date.now(),
      };

      strategy.cacheLocalPrice('BTC/USD', mockPrice);

      const cached = strategy['localCache'].get('BTC/USD');
      expect(cached).toBeDefined();
      expect(cached?.price).toBe(mockPrice);
    });

    it('should retrieve cached prices', () => {
      const mockPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: Date.now(),
      };

      strategy.cacheLocalPrice('BTC/USD', mockPrice);

      const retrieved = strategy.getLocalCachedPrice('BTC/USD');
      expect(retrieved).toEqual(mockPrice);
    });

    it('should expire local cache after 5 minutes', () => {
      const oldTime = Date.now() - 310000; // 310 seconds ago

      const mockPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: oldTime,
      };

      strategy.cacheLocalPrice('BTC/USD', mockPrice);
      strategy['localCache'].get('BTC/USD')!.timestamp = oldTime;

      const retrieved = strategy.getLocalCachedPrice('BTC/USD');
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent cache entries', () => {
      const retrieved = strategy.getLocalCachedPrice('NONEXISTENT/USD');
      expect(retrieved).toBeNull();
    });
  });

  describe('Health Checks', () => {
    it('should report Redis health status', () => {
      expect(strategy.isRedisHealthy()).toBe(true); // Initially healthy
    });
  });

  describe('Status Reporting', () => {
    it('should report current status', () => {
      const mockPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: Date.now(),
      };

      strategy.cacheLocalPrice('BTC/USD', mockPrice);
      strategy.cacheLocalPrice('ETH/USD', mockPrice);

      const status = strategy.getStatus();

      expect(status.localCacheSize).toBe(2);
      expect(status.redisHealthy).toBe(true);
      expect(status.oldestCachedPrice).toBeDefined();
    });

    it('should report zero cache size when empty', () => {
      const status = strategy.getStatus();

      expect(status.localCacheSize).toBe(0);
      expect(status.oldestCachedPrice).toBeNull();
    });

    it('should track oldest cached price', () => {
      const newTime = Date.now();
      const oldTime = Date.now() - 60000;

      const newPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: newTime,
      };

      const oldPrice: PriceUpdate = {
        ...newPrice,
        pair: 'ETH/USD',
        timestamp: oldTime,
      };

      strategy.cacheLocalPrice('BTC/USD', newPrice);
      strategy.cacheLocalPrice('ETH/USD', oldPrice);
      strategy['localCache'].get('ETH/USD')!.timestamp = oldTime;

      const status = strategy.getStatus();

      expect(status.oldestCachedPrice).toBeGreaterThan(50000);
    });
  });

  describe('Multiple Prices', () => {
    it('should cache multiple pairs independently', () => {
      const btcPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: Date.now(),
      };

      const ethPrice: PriceUpdate = {
        pair: 'ETH/USD',
        price: 3124.50,
        bid: 3124.00,
        ask: 3125.00,
        high24h: 3200,
        low24h: 3000,
        change24h: 50,
        changePercent24h: 1.63,
        volume24h: 987654321,
        timestamp: Date.now(),
      };

      strategy.cacheLocalPrice('BTC/USD', btcPrice);
      strategy.cacheLocalPrice('ETH/USD', ethPrice);

      expect(strategy.getLocalCachedPrice('BTC/USD')?.price).toBe(93245.67);
      expect(strategy.getLocalCachedPrice('ETH/USD')?.price).toBe(3124.50);
    });
  });

  describe('Cache Eviction', () => {
    it('should evict expired entries on retrieval', () => {
      const oldTime = Date.now() - 310000; // 310 seconds ago

      const mockPrice: PriceUpdate = {
        pair: 'BTC/USD',
        price: 93245.67,
        bid: 93244.50,
        ask: 93246.84,
        high24h: 95000,
        low24h: 91000,
        change24h: -500,
        changePercent24h: -0.53,
        volume24h: 1234567890,
        timestamp: oldTime,
      };

      strategy.cacheLocalPrice('BTC/USD', mockPrice);
      strategy['localCache'].get('BTC/USD')!.timestamp = oldTime;

      expect(strategy['localCache'].has('BTC/USD')).toBe(true);

      strategy.getLocalCachedPrice('BTC/USD');

      expect(strategy['localCache'].has('BTC/USD')).toBe(false);
    });
  });
});
