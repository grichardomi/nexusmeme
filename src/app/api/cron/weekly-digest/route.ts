/**
 * Cron: Weekly Bot Digest
 * Schedule: "0 8 * * 1" — Every Monday at 8 AM UTC
 *
 * Sends each user a weekly summary of their bot's performance:
 * trades, win rate, P&L, best/worst trade, market note.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { sendWeeklyDigests } from '@/services/email/triggers';
import { processPendingEmails } from '@/services/email/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const env = getEnvironmentConfig();
  const secret = req.headers.get('x-cron-secret');

  if (secret !== env.CRON_SECRET) {
    logger.warn('Unauthorized cron request to weekly-digest');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron triggered: weekly-digest');

  try {
    const result = await sendWeeklyDigests();
    await processPendingEmails();
    logger.info('Cron weekly-digest complete', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error('Cron weekly-digest failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
