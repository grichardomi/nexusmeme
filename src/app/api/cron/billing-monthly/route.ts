/**
 * Cron: Monthly Billing Job
 * Schedule: "0 2 1 * *" — 1st of every month at 2 AM UTC
 *
 * Creates USDC invoices for all users with pending performance fees
 * and sends invoice emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { runMonthlyBillingJob } from '@/services/billing/monthly-billing-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — billing may process many users

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to billing-monthly');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: billing-monthly');

  try {
    const result = await runMonthlyBillingJob();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Cron billing-monthly failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
