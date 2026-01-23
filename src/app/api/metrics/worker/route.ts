import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { adapterRegistry } from '@/services/exchanges/singleton';
import { binanceRateLimiter } from '@/lib/distributed-rate-limiter';
import { logger } from '@/lib/logger';

/**
 * GET /api/metrics/worker
 * Detailed metrics for monitoring and dashboards
 * Requires authentication
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Only admin can view worker metrics
    if (!session || (session.user && 'role' in session.user && session.user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inFlightCount = jobQueueManager.getInFlightJobCount();
    const rateLimiterStats = await binanceRateLimiter.getStats();
    const adapterStats = adapterRegistry.getStats();

    const metrics = {
      timestamp: new Date().toISOString(),
      worker: {
        in_flight_jobs: inFlightCount,
        is_idle: jobQueueManager.isIdle(),
      },
      rate_limiting: {
        ...rateLimiterStats,
        description: 'Redis-backed distributed rate limiter (shared across instances)',
      },
      adapters: {
        ...adapterStats,
        description: 'Singleton adapters maintain circuit breaker state',
      },
      thresholds: {
        warning_in_flight: 10,
        critical_in_flight: 50,
        warning_rate_utilization: 0.8,
      },
      alerts: generateAlerts(inFlightCount, rateLimiterStats),
    };

    return NextResponse.json(metrics);
  } catch (error) {
    logger.error('Metrics endpoint error', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Generate alerts based on current metrics
 */
function generateAlerts(inFlightCount: number, rateLimiterStats: any): string[] {
  const alerts: string[] = [];

  if (inFlightCount > 50) {
    alerts.push('CRITICAL: Over 50 jobs in-flight');
  } else if (inFlightCount > 10) {
    alerts.push('WARNING: Over 10 jobs in-flight');
  }

  if (
    rateLimiterStats.utilizationPercent &&
    rateLimiterStats.utilizationPercent > 90
  ) {
    alerts.push('WARNING: Rate limiter at 90%+ utilization (may cause throttling)');
  }

  return alerts;
}
