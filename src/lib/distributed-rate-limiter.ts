import { getRedisClient } from './redis';
import { sleep } from './resilience';

/**
 * Distributed Rate Limiter (Redis-backed)
 * Coordinates rate limiting across multiple web/worker instances
 * Ensures 5000+ users don't burst past Binance 1200 req/min limit
 *
 * Uses Redis with SET operations for atomic token management
 */
export class DistributedRateLimiter {
  constructor(
    private key: string, // Redis key prefix
    private maxTokens: number, // Max tokens in bucket
    private refillRatePerSecond: number // Tokens added per second
  ) {}

  /**
   * Get Redis client for this operation
   */
  private getRedis() {
    return getRedisClient();
  }

  /**
   * Acquire tokens with distributed coordination
   * Blocks if insufficient tokens available
   */
  async acquire(tokensNeeded: number = 1): Promise<void> {
    const maxWaitMs = 60000; // Max 60 second wait
    const startTime = Date.now();

    while (true) {
      const available = await this.getAvailableTokens();

      if (available >= tokensNeeded) {
        // Try to claim tokens atomically
        const claimed = await this.tryClaimTokens(tokensNeeded);
        if (claimed) {
          return;
        }
        // Race condition: another instance claimed tokens, retry
      }

      // Wait before retrying
      const waitTime = ((tokensNeeded - available) / this.refillRatePerSecond) * 1000;
      const delayMs = Math.min(Math.max(waitTime, 10), 100);

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Rate limit wait exceeded ${maxWaitMs}ms for ${this.key}`);
      }

      await sleep(delayMs);
    }
  }

  /**
   * Get available tokens (non-blocking, for monitoring)
   */
  private async getAvailableTokens(): Promise<number> {
    try {
      const redis = this.getRedis();
      const stored = await redis.get<string>(this.buildKey('tokens'));
      if (!stored) {
        return this.maxTokens;
      }

      const { tokens, refillTime } = JSON.parse(stored);
      const now = Date.now();
      const timeSinceRefill = (now - refillTime) / 1000;
      const tokensToAdd = timeSinceRefill * this.refillRatePerSecond;

      return Math.min(this.maxTokens, tokens + tokensToAdd);
    } catch (error) {
      // Silent fallback to full bucket - this is normal during transient redis issues
      return this.maxTokens;
    }
  }

  /**
   * Try to atomically claim tokens using Redis SET with NX
   */
  private async tryClaimTokens(tokensNeeded: number): Promise<boolean> {
    try {
      const redis = this.getRedis();
      const tokensKey = this.buildKey('tokens');
      const lockKey = this.buildKey('lock');

      // Use Redis SET with NX for atomic update
      // Acquire lock first (1 second expiration)
      const lockAcquired = await redis.set(lockKey, Date.now().toString(), { nx: true, ex: 1 });

      if (!lockAcquired) {
        return false; // Another instance holds lock
      }

      try {
        // Read current state
        const stored = await redis.get<string>(tokensKey);
        let tokens = this.maxTokens;
        let refillTime = Date.now();

        if (stored) {
          const state = JSON.parse(stored);
          tokens = state.tokens;
          refillTime = state.refillTime;

          // Refill tokens based on time elapsed
          const now = Date.now();
          const timeSinceRefill = (now - refillTime) / 1000;
          const tokensToAdd = timeSinceRefill * this.refillRatePerSecond;

          tokens = Math.min(this.maxTokens, tokens + tokensToAdd);
          refillTime = now;
        }

        // Check if we have enough tokens
        if (tokens < tokensNeeded) {
          return false;
        }

        // Deduct tokens and update
        tokens -= tokensNeeded;
        await redis.set(tokensKey, JSON.stringify({ tokens, refillTime }), { ex: 3600 });

        return true;
      } finally {
        // Release lock
        await redis.del(lockKey);
      }
    } catch (error) {
      // Silent failure - expected in race conditions, acquire() will retry
      return false;
    }
  }

  private buildKey(suffix: string): string {
    return `${this.key}:${suffix}`;
  }

  /**
   * Get limiter stats for monitoring
   */
  async getStats() {
    try {
      const available = await this.getAvailableTokens();
      return {
        key: this.key,
        maxTokens: this.maxTokens,
        availableTokens: available,
        utilizationPercent: ((this.maxTokens - available) / this.maxTokens) * 100,
      };
    } catch (error) {
      return {
        key: this.key,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Singleton instance for Binance API rate limiting (1200 req/min = 20 req/sec)
 * Shared across all web/worker instances via Redis
 */
export const binanceRateLimiter = new DistributedRateLimiter('binance_api', 1200, 20);

/**
 * Singleton instance for market data fetching (background aggregator only)
 * Allows up to 60 requests per minute (1 per second) to spread load
 * Binance allows 1200/min, so we only use ~15/min - this limiter ensures we never burst
 */
export const marketDataRateLimiter = new DistributedRateLimiter('market_data_aggregator', 60, 1);
