import { NextResponse } from 'next/server';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { adapterRegistry } from '@/services/exchanges/singleton';
import { binanceRateLimiter } from '@/lib/distributed-rate-limiter';
import { logger } from '@/lib/logger';

/**
 * GET /api/health/worker
 * Health check and metrics for job queue worker
 * Used by monitoring systems and readiness probes
 */
export async function GET() {
  try {
    const inFlightCount = jobQueueManager.getInFlightJobCount();
    const isIdle = jobQueueManager.isIdle();
    const rateLimiterStats = await binanceRateLimiter.getStats();
    const adapterStats = adapterRegistry.getStats();

    const health = {
      status: isIdle ? 'healthy' : 'processing',
      timestamp: new Date().toISOString(),
      metrics: {
        job_queue: {
          in_flight_count: inFlightCount,
          is_idle: isIdle,
        },
        rate_limiter: rateLimiterStats,
        adapters: adapterStats,
      },
    };

    // Determine HTTP status
    const httpStatus = isIdle ? 200 : 202; // 202 = Accepted (still processing)

    return NextResponse.json(health, { status: httpStatus });
  } catch (error) {
    logger.error('Health check failed', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
