/**
 * WebSocket heartbeat utility for connection health monitoring
 * Sends periodic pings to keep connection alive and detect stale connections
 */

export class WebSocketHeartbeat {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs: number = 180000) {
    // Binance requires ping every 24 hours, but we'll ping every 3 minutes for safety
    this.intervalMs = intervalMs;
  }

  /**
   * Start heartbeat timer
   */
  start(onHeartbeat: () => void): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      onHeartbeat();
    }, this.intervalMs);
  }

  /**
   * Stop heartbeat timer
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Check if heartbeat is active
   */
  isActive(): boolean {
    return this.heartbeatTimer !== null;
  }
}

/**
 * Exponential backoff calculator for reconnection attempts
 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(baseDelayMs: number = 1000, maxDelayMs: number = 60000) {
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  /**
   * Get delay for current attempt
   */
  getDelay(): number {
    const delay = this.baseDelayMs * Math.pow(2, this.attempt);
    return Math.min(delay, this.maxDelayMs);
  }

  /**
   * Move to next attempt
   */
  next(): number {
    const delay = this.getDelay();
    this.attempt++;
    return delay;
  }

  /**
   * Reset to initial state (called on successful connection)
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Get current attempt count
   */
  getAttempt(): number {
    return this.attempt;
  }
}
