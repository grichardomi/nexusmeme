/**
 * Market Data Initialization Endpoint
 * Triggers one-time startup of background market data fetcher
 *
 * This endpoint should be called early in the app lifecycle to start
 * the background task that keeps the price cache warm.
 *
 * Idempotent: Multiple calls are safe (fetcher won't double-start)
 */

import { NextResponse } from 'next/server';
import { initializeBackgroundFetcher, getBackgroundMarketDataFetcher } from '@/services/market-data/background-fetcher';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    // Initialize background fetcher (idempotent - safe to call multiple times)
    await initializeBackgroundFetcher();

    const fetcher = getBackgroundMarketDataFetcher();
    const stats = fetcher.getStats();
    const health = fetcher.getCacheHealth();

    return NextResponse.json(
      {
        status: 'ok',
        message: 'Market data fetcher initialized',
        fetcher: {
          isRunning: fetcher.isActive(),
          stats,
          health,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Failed to initialize market data', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to initialize market data fetcher',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Force immediate refresh and check health
 */
export async function POST(): Promise<Response> {
  try {
    const fetcher = getBackgroundMarketDataFetcher();
    const health = fetcher.getCacheHealth();
    const stats = fetcher.getStats();

    return NextResponse.json(
      {
        status: 'ok',
        message: 'Market data fetcher status',
        fetcher: {
          isRunning: fetcher.isActive(),
          stats,
          health,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Failed to get market data status', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to get fetcher status',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
