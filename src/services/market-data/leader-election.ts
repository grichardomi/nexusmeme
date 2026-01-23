/**
 * Leader Election for Price Streaming
 * Ensures only ONE server instance connects to Binance WebSocket
 * All instances share prices via Redis
 *
 * When scaling to multiple Railway instances:
 * - Instance 1 (leader): Connects to Binance → publishes to Redis
 * - Instance 2-N (followers): Read from Redis → broadcast to SSE clients
 *
 * This prevents:
 * - Multiple WebSocket connections to Binance (wasteful)
 * - Duplicate REST API calls on cache miss
 * - Race conditions between instances
 */

import { logger } from '@/lib/logger';
import { getCached, setCached } from '@/lib/redis';

const LEADER_KEY = 'price_stream:leader';
const LEADER_HEARTBEAT_TTL = 30; // seconds
const LEADER_CHECK_INTERVAL = 10000; // 10 seconds

interface LeaderInfo {
  instanceId: string;
  hostname: string;
  timestamp: number;
}

/**
 * Leader election for price streaming
 */
export class PriceLeaderElection {
  private instanceId: string;
  private isLeader = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Generate unique instance ID (hostname + timestamp)
    this.instanceId = `${getHostname()}_${process.pid}_${Date.now()}`;
  }

  /**
   * Attempt to become leader
   * Returns true if this instance is now the leader
   */
  async becomeLeader(): Promise<boolean> {
    try {
      const currentLeader = await getCached<LeaderInfo>(LEADER_KEY);

      // If no leader or leader heartbeat expired, take leadership
      if (!currentLeader) {
        const leaderInfo: LeaderInfo = {
          instanceId: this.instanceId,
          hostname: getHostname(),
          timestamp: Date.now(),
        };

        await setCached(LEADER_KEY, leaderInfo, LEADER_HEARTBEAT_TTL);
        this.isLeader = true;
        logger.info('Became price stream leader', { instanceId: this.instanceId });
        this.startHeartbeat();
        return true;
      }

      // Check if leader heartbeat is stale (older than TTL)
      const ageMs = Date.now() - currentLeader.timestamp;
      if (ageMs > LEADER_HEARTBEAT_TTL * 1000) {
        const leaderInfo: LeaderInfo = {
          instanceId: this.instanceId,
          hostname: getHostname(),
          timestamp: Date.now(),
        };

        await setCached(LEADER_KEY, leaderInfo, LEADER_HEARTBEAT_TTL);
        this.isLeader = true;
        logger.info('Took over price stream leadership', {
          instanceId: this.instanceId,
          previousLeader: currentLeader.instanceId,
        });
        this.startHeartbeat();
        return true;
      }

      // Another instance is the leader
      this.isLeader = false;
      logger.debug('Another instance is price stream leader', {
        leader: currentLeader.instanceId,
        thisInstance: this.instanceId,
      });
      return false;
    } catch (error) {
      logger.error('Leader election error', error instanceof Error ? error : null);
      return false;
    }
  }

  /**
   * Start heartbeat to maintain leadership
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      try {
        const leaderInfo: LeaderInfo = {
          instanceId: this.instanceId,
          hostname: getHostname(),
          timestamp: Date.now(),
        };

        await setCached(LEADER_KEY, leaderInfo, LEADER_HEARTBEAT_TTL);
        logger.debug('Leader heartbeat sent', { instanceId: this.instanceId });
      } catch (error) {
        logger.error('Failed to send leader heartbeat', error instanceof Error ? error : null);
        this.isLeader = false;
      }
    }, LEADER_HEARTBEAT_TTL * 300); // Refresh at 30% TTL
  }

  /**
   * Check leadership status periodically
   */
  startLeadershipCheck(callback: (isLeader: boolean) => void): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(async () => {
      const isLeader = await this.becomeLeader();
      callback(isLeader);
    }, LEADER_CHECK_INTERVAL);

    // Initial check
    this.becomeLeader().then(isLeader => callback(isLeader)).catch(error => {
      logger.error('Initial leader check failed', error instanceof Error ? error : null);
    });
  }

  /**
   * Release leadership
   */
  async releaseLeadership(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isLeader = false;
    logger.info('Released price stream leadership', { instanceId: this.instanceId });
  }

  /**
   * Check if this instance is the leader
   */
  getIsLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Get current leader info
   */
  async getLeaderInfo(): Promise<LeaderInfo | null> {
    return getCached<LeaderInfo>(LEADER_KEY);
  }
}

/**
 * Get hostname for instance identification
 */
function getHostname(): string {
  try {
    const os = require('os');
    return os.hostname();
  } catch {
    return 'unknown-host';
  }
}

/**
 * Singleton instance
 */
let instance: PriceLeaderElection | null = null;

export function getPriceLeaderElection(): PriceLeaderElection {
  if (!instance) {
    instance = new PriceLeaderElection();
  }
  return instance;
}
