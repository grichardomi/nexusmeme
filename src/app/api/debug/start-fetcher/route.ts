/**
 * DEBUG: Manual trigger to start the background market data fetcher
 * Use this to test if there are errors during initialization
 * PROTECTED: Admin-only access
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { initializeBackgroundFetcher, getBackgroundMarketDataFetcher } from '@/services/market-data/background-fetcher';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminCheck = await query(`SELECT role FROM users WHERE id = $1`, [session.user.id]);
    if (!adminCheck[0] || adminCheck[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[DEBUG] Manually starting background fetcher...');

    // Try to initialize the fetcher
    await initializeBackgroundFetcher();

    console.log('[DEBUG] Fetcher initialization completed');

    // Get status
    const fetcher = getBackgroundMarketDataFetcher();
    const isRunning = fetcher.isActive();
    const stats = fetcher.getStats();
    const health = fetcher.getCacheHealth();

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

    logger.error('Manual fetcher startup failed', error instanceof Error ? error : null);

    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to start fetcher',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
