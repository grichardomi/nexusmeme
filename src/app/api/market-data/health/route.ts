/**
 * Health check and monitoring endpoint for price streaming
 * GET /api/market-data/health
 *
 * Returns:
 * - WebSocket connection state with circuit breaker status
 * - Active SSE connections
 * - Subscribed pairs
 * - Cache and error recovery status
 * - Scaling recommendations
 */

import { NextResponse } from 'next/server';
import { getBinanceWebSocketClient } from '@/services/market-data/websocket-client';
import { getPriceBroadcaster } from '@/services/market-data/price-broadcaster';
import { getErrorRecoveryStrategy } from '@/services/market-data/error-recovery';
import { getPriceLeaderElection } from '@/services/market-data/leader-election';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const wsClient = getBinanceWebSocketClient();
    const broadcaster = getPriceBroadcaster();
    const errorRecovery = getErrorRecoveryStrategy();
    const leaderElection = getPriceLeaderElection();

    const wsStats = wsClient.getStats();
    const broadcasterStatus = broadcaster.getStatus();
    const errorRecoveryStatus = errorRecovery.getStatus();
    const leaderInfo = await leaderElection.getLeaderInfo();

    // Determine overall health status
    let overallStatus = 'healthy';
    if (wsStats.circuitBreaker.state === 'open') {
      overallStatus = 'degraded';
    } else if (broadcasterStatus.activeSubscriptions > 8000) {
      overallStatus = 'at_capacity';
    }

    const health = {
      status: overallStatus,
      timestamp: Date.now(),
      websocket: {
        state: wsStats.state,
        isLeader: wsStats.isLeader,
        uptime: wsStats.uptime,
        connectionAttempts: wsStats.connectionAttempts,
        consecutiveErrors: wsStats.consecutiveErrors,
        subscribedPairs: wsStats.subscribedPairs,
        totalSubscribers: wsStats.totalSubscribers,
        circuitBreaker: {
          state: wsStats.circuitBreaker.state,
          failureCount: wsStats.circuitBreaker.failureCount,
          successCount: wsStats.circuitBreaker.successCount,
          timeSinceLastFailure: wsStats.circuitBreaker.timeSinceLastFailure,
        },
      },
      broadcasting: {
        initialized: broadcasterStatus.initialized,
        role: broadcasterStatus.role,
        activeSubscriptions: broadcasterStatus.activeSubscriptions,
        subscribedPairs: broadcasterStatus.subscribedPairs,
        recovery: broadcasterStatus.recoveryStatus,
      },
      errorRecovery: {
        localCacheSize: errorRecoveryStatus.localCacheSize,
        redisHealthy: errorRecoveryStatus.redisHealthy,
        oldestCachedPriceMs: errorRecoveryStatus.oldestCachedPrice,
      },
      leadership: {
        isLeader: wsStats.isLeader,
        currentLeader: leaderInfo?.instanceId || 'unknown',
        leaderHostname: leaderInfo?.hostname || 'unknown',
      },
      scaling: {
        activeConnections: broadcasterStatus.activeSubscriptions,
        recommendation:
          broadcasterStatus.activeSubscriptions > 8000
            ? 'SCALE_UP_REQUIRED'
            : broadcasterStatus.activeSubscriptions > 5000
              ? 'MONITOR_CAPACITY'
              : 'HEALTHY',
        capacityPercentage: Math.round((broadcasterStatus.activeSubscriptions / 10000) * 100),
      },
      alerts: (() => {
        const alerts: string[] = [];
        if (wsStats.circuitBreaker.state === 'open') {
          alerts.push('WebSocket circuit breaker is OPEN');
        }
        if (wsStats.consecutiveErrors > 3) {
          alerts.push(`High error rate: ${wsStats.consecutiveErrors} consecutive errors`);
        }
        if (!errorRecoveryStatus.redisHealthy) {
          alerts.push('Redis price distribution is unhealthy');
        }
        if (broadcasterStatus.activeSubscriptions > 8000) {
          alerts.push('Server approaching capacity');
        }
        return alerts;
      })(),
    };

    const httpStatus = overallStatus === 'healthy' ? 200 : 503;

    return NextResponse.json(health, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: Date.now(),
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
