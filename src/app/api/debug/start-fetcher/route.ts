/**
 * DEBUG: Manual trigger to start the background market data fetcher
 * Use this to test if there are errors during initialization
 */

import { NextResponse } from 'next/server';
import { initializeBackgroundFetcher, getBackgroundMarketDataFetcher } from '@/services/market-data/background-fetcher';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    console.log('[DEBUG] Manually starting background fetcher...');

    // Try to initialize the fetcher
    await initializeBackgroundFetcher();

    console.log('[DEBUG] Fetcher initialization completed');

    // Get status
    const fetcher = getBackgroundMarketDataFetcher();
    const isRunning = fetcher.isActive();
    const stats = fetcher.getStats();
    const health = fetcher.getCacheHealth();

    console.log('[DEBUG] Fetcher status after init:', {
      isRunning,
      stats,
      health,
    });

    return NextResponse.json(
      {
        status: 'ok',
        message: 'Fetcher started',
        isRunning,
        stats,
        health,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[DEBUG] Error starting fetcher:', error);
    logger.error('Manual fetcher startup failed', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to start fetcher',
        error: errorMessage,
        stack: errorStack?.split('\n').slice(0, 10),
      },
      { status: 500 }
    );
  }
}
