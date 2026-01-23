/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unavailable
 *
 * States:
 * - CLOSED: Normal operation (requests pass through)
 * - OPEN: Service failing (requests rejected fast without trying)
 * - HALF_OPEN: Testing if service recovered (limited requests allowed)
 */

import { logger } from './logger';

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Failures before opening (default: 5)
  successThreshold?: number; // Successes in half-open before closing (default: 3)
  timeout?: number; // Time in ms before half-open timeout (default: 60000)
  onStateChange?: (state: CircuitBreakerState, reason?: string) => void;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly onStateChange: (state: CircuitBreakerState, reason?: string) => void;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.timeout = options.timeout ?? 60000;
    this.onStateChange = options.onStateChange ?? (() => {});
  }

  /**
   * Execute operation through circuit breaker
   * Throws error if circuit is open
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      throw new Error(`Circuit breaker ${this.name} is OPEN. Service temporarily unavailable.`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record success - move toward closing if half-open
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      logger.debug(`Circuit breaker ${this.name} success in half-open`, {
        successCount: this.successCount,
        threshold: this.successThreshold,
      });

      if (this.successCount >= this.successThreshold) {
        this.setState(CircuitBreakerState.CLOSED, 'Recovered after timeout');
        this.successCount = 0;
      }
    }
  }

  /**
   * Record failure - move toward opening if threshold exceeded
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.debug(`Circuit breaker ${this.name} failure`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
    });

    if (this.state === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.setState(CircuitBreakerState.OPEN, `Threshold exceeded: ${this.failureCount}/${this.failureThreshold}`);
      this.scheduleReset();
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.OPEN, 'Failed during recovery');
      this.successCount = 0;
      this.scheduleReset();
    }
  }

  /**
   * Schedule transition to half-open after timeout
   */
  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.setState(CircuitBreakerState.HALF_OPEN, `Timeout (${this.timeout}ms) expired`);
      this.failureCount = 0;
      this.successCount = 0;
    }, this.timeout);
  }

  /**
   * Transition to new state
   */
  private setState(newState: CircuitBreakerState, reason?: string): void {
    if (newState !== this.state) {
      logger.info(`Circuit breaker ${this.name} state changed`, {
        from: this.state,
        to: newState,
        reason,
      });
      this.state = newState;
      this.onStateChange(newState, reason);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    timeSinceLastFailure: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: this.lastFailureTime > 0 ? Date.now() - this.lastFailureTime : 0,
    };
  }

  /**
   * Manual reset (for testing or manual recovery)
   */
  reset(): void {
    logger.info(`Circuit breaker ${this.name} manually reset`);
    this.setState(CircuitBreakerState.CLOSED, 'Manual reset');
    this.failureCount = 0;
    this.successCount = 0;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
