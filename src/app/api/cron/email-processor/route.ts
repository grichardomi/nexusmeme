/**
 * Cron: Email Processor
 * Schedule: "* /5 * * * *" — every 5 minutes
 *
 * Flushes pending emails from the DB queue (max 3 retries per email).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { processPendingEmails } from '@/services/email/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to email-processor');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: email-processor');

  try {
    const sent = await processPendingEmails();
    return NextResponse.json({ success: true, sent });
  } catch (error) {
    logger.error('Cron email-processor failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
