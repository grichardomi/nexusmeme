// Cron: Trial Notifications
// Schedule: every 6 hours (0 every-6-hours * * *)
// Sends trial expiration warning emails (3-day and 1-day warnings)
// and transitions expired trials to performance_fees plan.
// Replaces the unreliable in-memory setTimeout scheduler which dies on server restart.

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { processTrialNotifications } from '@/services/billing/trial-notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to trial-notifications');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: trial-notifications');

  try {
    const result = await processTrialNotifications();
    logger.info('Cron trial-notifications complete', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Cron trial-notifications failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
