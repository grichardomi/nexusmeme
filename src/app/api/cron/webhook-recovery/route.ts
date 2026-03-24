/**
 * Cron: Webhook Recovery
 * Schedule: every 4 hours (0 x/4 x x x)
 *
 * Retries USDC transfers that failed DB processing when the Alchemy webhook
 * fired. Alchemy won't retry (we return 200), so this job closes the gap.
 *
 * Each row in webhook_failures is re-processed via processIncomingUSDCTransfer().
 * Resolved on success or when the transfer can no longer match any live invoice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { retryWebhookFailures } from '@/services/billing/usdc-payment';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to webhook-recovery');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: webhook-recovery');

  try {
    const result = await retryWebhookFailures();

    return NextResponse.json({
      ok: true,
      attempted: result.attempted,
      resolved: result.resolved,
      stillFailing: result.stillFailing,
    });
  } catch (error) {
    logger.error('webhook-recovery cron failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
