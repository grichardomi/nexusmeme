/**
 * Cron: Billing Retry
 * Schedule: "0 10 * * 3" — every Wednesday at 10 AM UTC
 *
 * Retries billing for users whose fees are still pending_billing
 * after the monthly billing run (e.g., due to transient USDC/Coinbase errors).
 *
 * Only targets fees that are at least 2 days old (gave the monthly job a chance to run)
 * and not yet covered by an active pending invoice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { query } from '@/lib/db';
import { runMonthlyBillingJob } from '@/services/billing/monthly-billing-job';
import { processPendingEmails } from '@/services/email/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to billing-retry');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: billing-retry');

  try {
    // Only run if there are genuinely stranded fees:
    // pending_billing fees older than 2 days with no active invoice covering them
    const stranded = await query(
      `SELECT COUNT(DISTINCT pf.user_id) as cnt
       FROM performance_fees pf
       WHERE pf.status = 'pending_billing'
         AND pf.created_at < NOW() - INTERVAL '2 days'
         AND NOT EXISTS (
           SELECT 1 FROM usdc_payment_references r
           WHERE r.user_id = pf.user_id
             AND r.status = 'pending'
         )`,
      []
    );

    const stranderUsers = parseInt(String((stranded[0] as any).cnt));

    if (stranderUsers === 0) {
      logger.info('Billing retry: no stranded fees found');
      return NextResponse.json({ success: true, message: 'No stranded fees', retried: 0 });
    }

    logger.info(`Billing retry: ${stranderUsers} user(s) with stranded fees — re-running billing`);

    // Re-run the billing job (it will only pick up pending_billing fees)
    const result = await runMonthlyBillingJob();
    await processPendingEmails();

    logger.info('Billing retry complete', result);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Cron billing-retry failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
