/**
 * Cron: Dunning Check
 * Schedule: "0 9 * * *" — daily at 9 AM UTC
 *
 * Checks for overdue USDC invoices:
 *   - Day 7+  → sends reminder email
 *   - Day 14+ → suspends bots + sends suspension email
 *   - Expired → marks expired
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { runDunningCheck } from '@/services/billing/dunning';
import { processPendingEmails } from '@/services/email/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to billing-dunning');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: billing-dunning');

  try {
    const result = await runDunningCheck();
    await processPendingEmails();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Cron billing-dunning failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
