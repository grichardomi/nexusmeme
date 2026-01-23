/**
 * Market Data Health Check Endpoint
 * Debugging endpoint to check aggregator, background fetcher, and cache status
 */

import { NextResponse } from 'next/server';
import { getCached } from '@/lib/redis';
import { getBackgroundMarketDataFetcher } from '@/services/market-data/background-fetcher';
import { tradingConfig } from '@/config/environment';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const fetcher = getBackgroundMarketDataFetcher();
    const stats = fetcher.getStats();
    const health = fetcher.getCacheHealth();

    // Check what pairs are configured
    const configuredPairs = tradingConfig.allowedPairs;

    // Check Redis cache for each pair
    const cacheStatus: Record<string, any> = {};
    for (const pair of configuredPairs) {
      const cacheKey = `market_data:${pair}`;
      try {
        const cached = await getCached<any>(cacheKey);
        cacheStatus[pair] = cached
          ? {
              cached: true,
              price: cached.price,
              timestamp: cached.timestamp,
              age: Date.now() - (cached.timestamp || 0),
            }
          : { cached: false };
      } catch (error) {
        cacheStatus[pair] = { cached: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: Date.now(),
        fetcher: {
          isRunning: fetcher.isActive(),
          stats,
          health,
        },
        configuration: {
          configuredPairs,
          pairCount: configuredPairs.length,
        },
        cache: cacheStatus,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Market data health check failed', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
