/**
 * Cron: Upcoming Billing Warning
 * Schedule: "0 9 28 * *" — 28th of every month at 9 AM UTC
 *
 * Sends a heads-up email 3 days before invoices are generated
 * so users know what to expect on the 1st.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { sendUpcomingBillingNotifications } from '@/services/billing/monthly-billing-job';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to billing-upcoming');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: billing-upcoming');

  try {
    const result = await sendUpcomingBillingNotifications();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Cron billing-upcoming failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
