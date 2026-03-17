import { sleep } from './resilience';

/**
 * In-process token bucket rate limiter
 * Replaced Redis-backed distributed limiter — single Railway instance doesn't need
 * distributed coordination. Removes Upstash lock contention that was blocking live trades.
 */
export class DistributedRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private key: string,
    private maxTokens: number,
    private refillRatePerSecond: number
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  async acquire(tokensNeeded: number = 1): Promise<void> {
    const maxWaitMs = 10000;
    const startTime = Date.now();

    while (true) {
      this.refill();

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        return;
      }

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Rate limit wait exceeded ${maxWaitMs}ms for ${this.key}`);
      }

      await sleep(50);
    }
  }

  async getStats() {
    this.refill();
    return {
      key: this.key,
      maxTokens: this.maxTokens,
      availableTokens: Math.floor(this.tokens),
      utilizationPercent: ((this.maxTokens - this.tokens) / this.maxTokens) * 100,
    };
  }
}

/**
 * Singleton rate limiter for Binance API (1200 req/min = 20 req/sec)
 */
export const binanceRateLimiter = new DistributedRateLimiter('binance_api', 1200, 20);

/**
 * Singleton rate limiter for market data aggregator
 */
export const marketDataRateLimiter = new DistributedRateLimiter('market_data_aggregator', 60, 1);
