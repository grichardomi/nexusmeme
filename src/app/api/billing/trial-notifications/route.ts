import { NextRequest, NextResponse } from 'next/server';
import { processTrialNotifications } from '@/services/billing/trial-notifications';
import { logger } from '@/lib/logger';

/**
 * POST /api/billing/trial-notifications
 * Process and send trial expiration notifications
 *
 * DEPRECATED: This endpoint is kept as a backup manual trigger only.
 * Trial notifications are now processed automatically by TrialNotificationsScheduler
 * which runs every 6 hours on app startup (see /src/services/cron/trial-notifications-scheduler.ts)
 *
 * This endpoint can still be used to manually trigger processing if needed.
 * Requires authorization via CRON_SECRET env var
 */

export async function POST(req: NextRequest) {
  try {
    // Verify authorization via cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('Unauthorized trial notification request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Process trial notifications
    const result = await processTrialNotifications();

    logger.info('Trial notifications processed', result);

    return NextResponse.json(
      {
        success: true,
        message: 'Trial notifications processed',
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error('Trial notification endpoint error', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to process trial notifications' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/billing/trial-notifications (health check - DEPRECATED)
 *
 * DEPRECATED: This endpoint is kept as a backup for manual verification only.
 * Trial notifications are now processed automatically by TrialNotificationsScheduler.
 *
 * Can still be used to verify the endpoint is working.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      {
        status: 'ok',
        message: 'Trial notification endpoint is ready',
        instructions: 'Send a POST request to process trial notifications',
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 },
    );
  }
}
