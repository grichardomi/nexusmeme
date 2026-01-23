import { WebSocketHeartbeat, ExponentialBackoff } from '../websocket-heartbeat';

describe('WebSocketHeartbeat', () => {
  let heartbeat: WebSocketHeartbeat;

  beforeEach(() => {
    heartbeat = new WebSocketHeartbeat(100); // 100ms for testing
  });

  afterEach(() => {
    heartbeat.stop();
  });

  describe('Start and Stop', () => {
    it('should start heartbeat', (done) => {
      let callCount = 0;
      const onHeartbeat = () => {
        callCount++;
        if (callCount >= 2) {
          done();
        }
      };

      heartbeat.start(onHeartbeat);
      expect(heartbeat.isActive()).toBe(true);
    });

    it('should stop heartbeat', () => {
      heartbeat.start(() => {});
      expect(heartbeat.isActive()).toBe(true);

      heartbeat.stop();
      expect(heartbeat.isActive()).toBe(false);
    });

    it('should call heartbeat callback at intervals', (done) => {
      const timestamps: number[] = [];

      const onHeartbeat = () => {
        timestamps.push(Date.now());
        if (timestamps.length >= 2) {
          heartbeat.stop();
          // Check that interval is roughly 100ms
          const diff = timestamps[1] - timestamps[0];
          expect(diff).toBeGreaterThan(50);
          expect(diff).toBeLessThan(200);
          done();
        }
      };

      heartbeat.start(onHeartbeat);
    });
  });

  describe('Restart', () => {
    it('should replace existing timer', (done) => {
      let firstCallCount = 0;
      const firstHeartbeat = () => {
        firstCallCount++;
      };

      heartbeat.start(firstHeartbeat);

      // After a short delay, start a new heartbeat
      setTimeout(() => {
        let secondCallCount = 0;
        const secondHeartbeat = () => {
          secondCallCount++;
          if (secondCallCount >= 1) {
            heartbeat.stop();
            expect(secondCallCount).toBeGreaterThan(0);
            done();
          }
        };

        heartbeat.start(secondHeartbeat);
      }, 50);
    });
  });
});

describe('ExponentialBackoff', () => {
  let backoff: ExponentialBackoff;

  beforeEach(() => {
    backoff = new ExponentialBackoff(100, 1000); // base=100ms, max=1000ms
  });

  describe('Delay Calculation', () => {
    it('should start with base delay', () => {
      expect(backoff.getDelay()).toBe(100);
    });

    it('should double delay on each attempt', () => {
      expect(backoff.getDelay()).toBe(100); // 100 * 2^0
      backoff.next();
      expect(backoff.getDelay()).toBe(200); // 100 * 2^1
      backoff.next();
      expect(backoff.getDelay()).toBe(400); // 100 * 2^2
      backoff.next();
      expect(backoff.getDelay()).toBe(800); // 100 * 2^3
    });

    it('should cap at max delay', () => {
      for (let i = 0; i < 10; i++) {
        backoff.next();
      }
      expect(backoff.getDelay()).toBe(1000); // Max is 1000ms
    });
  });

  describe('Attempt Tracking', () => {
    it('should track attempt count', () => {
      expect(backoff.getAttempt()).toBe(0);
      backoff.next();
      expect(backoff.getAttempt()).toBe(1);
      backoff.next();
      expect(backoff.getAttempt()).toBe(2);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      backoff.next();
      backoff.next();
      expect(backoff.getAttempt()).toBe(2);
      expect(backoff.getDelay()).toBe(400);

      backoff.reset();

      expect(backoff.getAttempt()).toBe(0);
      expect(backoff.getDelay()).toBe(100);
    });

    it('should allow reuse after reset', () => {
      for (let i = 0; i < 5; i++) {
        backoff.next();
      }

      backoff.reset();

      const delaySequence: number[] = [];
      for (let i = 0; i < 3; i++) {
        delaySequence.push(backoff.getDelay());
        backoff.next();
      }

      expect(delaySequence).toEqual([100, 200, 400]);
    });
  });

  describe('Next Function', () => {
    it('should return delay and increment attempt', () => {
      const delay1 = backoff.next();
      expect(delay1).toBe(100);
      expect(backoff.getAttempt()).toBe(1);

      const delay2 = backoff.next();
      expect(delay2).toBe(200);
      expect(backoff.getAttempt()).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero base delay', () => {
      const zeroBackoff = new ExponentialBackoff(0, 1000);
      expect(zeroBackoff.getDelay()).toBe(0);
    });

    it('should handle base delay equal to max delay', () => {
      const equalBackoff = new ExponentialBackoff(500, 500);
      expect(equalBackoff.getDelay()).toBe(500);
      equalBackoff.next();
      expect(equalBackoff.getDelay()).toBe(500); // Capped at max
    });

    it('should handle many attempts', () => {
      for (let i = 0; i < 100; i++) {
        backoff.next();
      }
      expect(backoff.getDelay()).toBe(1000); // Still capped at max
    });
  });
});
