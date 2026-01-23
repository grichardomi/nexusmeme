import { logger } from './logger';

/**
 * Exponential Backoff Retry Utility
 * Retries with exponential delay: delay = min(baseDelay * 2^attempt, maxDelay)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelay: number;  // milliseconds
    maxDelay: number;
    retryableErrors?: (error: any) => boolean;
    onRetry?: (attempt: number, error: any) => void;
  }
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable (default: network and timeout errors)
      const isRetryable = options.retryableErrors ? options.retryableErrors(error) : isTransientError(error);

      if (!isRetryable || attempt === options.maxRetries) {
        throw error;
      }

      // Calculate exponential backoff delay
      const exponentialDelay = options.baseDelay * Math.pow(2, attempt);
      const delay = Math.min(exponentialDelay, options.maxDelay);

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      const totalDelay = delay + jitter;

      if (options.onRetry) {
        options.onRetry(attempt + 1, error);
      }

      logger.warn('Retry with exponential backoff', {
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        delayMs: Math.round(totalDelay),
        error: lastError.message,
      });

      await sleep(Math.round(totalDelay));
    }
  }

  throw lastError;
}

/**
 * Check if error is transient (retriable)
 * Transient: network errors, timeouts, 5xx errors, rate limits
 * Non-transient: auth errors, validation errors, 4xx (except 429)
 */
function isTransientError(error: any): boolean {
  // Network-level errors
  if (!error) return true;
  if (typeof error === 'string') {
    const msg = error.toLowerCase();
    return msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused');
  }

  if (!(error instanceof Error)) return true;

  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('etimedout')) {
    return true;
  }

  // Timeout errors
  if (message.includes('timeout')) return true;

  // HTTP status code errors (if available)
  if ('status' in error) {
    const status = (error as any).status;
    // Retry on 5xx and 429 (rate limit)
    if (status >= 500 || status === 429) return true;
    // Don't retry 4xx (except 429 handled above)
    if (status >= 400 && status < 500) return false;
  }

  // Binance-specific errors
  if (message.includes('binance')) {
    // Retry on connection issues and rate limits
    if (
      message.includes('-1001') || // DISCONNECTED
      message.includes('-1003') || // TOO_MANY_REQUESTS
      message.includes('-1000') // ILLEGAL_CHARS
    ) {
      return true;
    }
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Simple sleep utility
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when service is down
 *
 * States:
 * - CLOSED: Normal operation, requests go through
 * - OPEN: Service is down, all requests fail fast
 * - HALF_OPEN: Testing if service is recovered
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(
    private failureThreshold: number,  // Open circuit after N failures
    private successThreshold: number = 2, // Close circuit after N successes in half-open
    private resetTimeout: number = 60000  // Try half-open after N ms
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure > this.resetTimeout) {
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          timeSinceLastFailure,
          resetTimeout: this.resetTimeout,
        });
        this.state = 'half_open';
        this.successCount = 0;
      } else {
        // Circuit is open, fail fast
        const error = new Error(
          `Circuit breaker is OPEN. Service unavailable. Retry in ${Math.ceil((this.resetTimeout - timeSinceLastFailure) / 1000)}s`
        );
        (error as any).code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      }
    }

    // Execute the function
    try {
      const result = await fn();

      // Transition from HALF_OPEN to CLOSED on success
      if (this.state === 'half_open') {
        this.successCount++;

        if (this.successCount >= this.successThreshold) {
          logger.info('Circuit breaker CLOSED', { successCount: this.successCount });
          this.state = 'closed';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else if (this.state === 'closed') {
        // Reset failure count on success in CLOSED state
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      logger.warn('Circuit breaker request failed', {
        state: this.state,
        failureCount: this.failureCount,
        failureThreshold: this.failureThreshold,
        error: error instanceof Error ? error.message : String(error),
      });

      // Transition from HALF_OPEN to OPEN on failure
      if (this.state === 'half_open') {
        logger.error('Circuit breaker reopening after failed half-open test');
        this.state = 'open';
        this.successCount = 0;
      } else if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
        logger.error('Circuit breaker OPEN due to repeated failures', null, {
          count: this.failureCount,
          threshold: this.failureThreshold,
        });
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    logger.info('Circuit breaker reset');
  }
}

/**
 * Distributed Circuit Breaker with Redis backing
 * Allows circuit breaker state to be shared across instances
 */
export class DistributedCircuitBreaker extends CircuitBreaker {
  constructor(
    private redisClient: any,
    private key: string,
    failureThreshold: number,
    successThreshold: number = 2,
    resetTimeout: number = 60000
  ) {
    super(failureThreshold, successThreshold, resetTimeout);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Get current state from Redis
    const redisState = await this.redisClient.get(this.key);
    if (redisState) {
      // Circuit is open across all instances
      const parsed = JSON.parse(redisState);
      if (parsed.state === 'open') {
        const timeSinceLastFailure = Date.now() - parsed.lastFailureTime;
        const resetTimeout = parsed.resetTimeout || 60000;

        if (timeSinceLastFailure > resetTimeout) {
          // Transition to half-open
          await this.redisClient.set(
            this.key,
            JSON.stringify({ ...parsed, state: 'half_open' }),
            'EX',
            Math.ceil(resetTimeout / 1000)
          );
        } else {
          throw new Error(`Distributed circuit breaker is OPEN`);
        }
      }
    }

    // Execute the function
    try {
      const result = await fn();
      // On success, close the circuit
      await this.redisClient.del(this.key);
      return result;
    } catch (error) {
      // On failure, update Redis state
      await this.redisClient.set(
        this.key,
        JSON.stringify({
          state: 'open',
          lastFailureTime: Date.now(),
          resetTimeout: 60000,
        }),
        'EX',
        60 // Expire after 60 seconds
      );
      throw error;
    }
  }
}

/**
 * Rate Limiter with Token Bucket Algorithm
 * Ensures we don't exceed rate limits
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number = Date.now();

  constructor(
    private maxTokens: number,
    private refillRatePerSecond: number
  ) {
    this.tokens = maxTokens;
  }

  /**
   * Wait if necessary to stay within rate limit
   */
  async acquire(tokensNeeded: number = 1): Promise<void> {
    while (true) {
      const now = Date.now();
      const timeSinceLastRefill = (now - this.lastRefillTime) / 1000;
      const tokensToAdd = timeSinceLastRefill * this.refillRatePerSecond;

      // Refill tokens
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        return;
      }

      // Wait before retrying
      const waitTime = (tokensNeeded - this.tokens) / this.refillRatePerSecond * 1000;
      await sleep(Math.min(waitTime, 100)); // Max 100ms wait per iteration
    }
  }

  getAvailableTokens(): number {
    const now = Date.now();
    const timeSinceLastRefill = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = timeSinceLastRefill * this.refillRatePerSecond;
    return Math.min(this.maxTokens, this.tokens + tokensToAdd);
  }
}
