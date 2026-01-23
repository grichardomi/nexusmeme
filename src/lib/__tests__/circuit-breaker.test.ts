import { CircuitBreaker, CircuitBreakerState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let stateChanges: Array<{ state: CircuitBreakerState; reason?: string }> = [];

  beforeEach(() => {
    stateChanges = [];
    circuitBreaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // Short timeout for testing
      onStateChange: (state, reason) => {
        stateChanges.push({ state, reason });
      },
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should have zero failures initially', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    it('should pass through successful operations', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset failure count on success', async () => {
      // Cause some failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Successful operation should reset
      await circuitBreaker.execute(async () => 'success');

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('Open Circuit', () => {
    it('should open after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(stateChanges.some(s => s.state === CircuitBreakerState.OPEN)).toBe(true);
    });

    it('should reject requests when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Try to execute while open
      await expect(
        circuitBreaker.execute(async () => 'success')
      ).rejects.toThrow('Circuit breaker test is OPEN');
    });
  });

  describe('Half-Open Transition', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('Recovery', () => {
    it('should close after threshold successes in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful operations
      for (let i = 0; i < 2; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(stateChanges.some(s => s.state === CircuitBreakerState.CLOSED && s.reason?.includes('Recovered')))
        .toBe(true);
    });

    it('should reopen if fail in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fail in half-open
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Manual Reset', () => {
    it('should reset to CLOSED state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track failure count', async () => {
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(2);
    });

    it('should track success count in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful operation
      await circuitBreaker.execute(async () => 'success');

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    it('should track last failure time', async () => {
      const beforeFailure = Date.now();

      try {
        await circuitBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeFailure);
    });
  });
});
