/**
 * Admin proxy: trigger a cron job server-side so CRON_SECRET never reaches the client.
 * POST /api/admin/cron/trigger  { jobId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEnvironmentConfig } from '@/config/environment';
import { logger } from '@/lib/logger';

const JOB_URLS: Record<string, string> = {
  'billing-monthly':  '/api/cron/billing-monthly',
  'billing-upcoming': '/api/cron/billing-upcoming',
  'billing-dunning':  '/api/cron/billing-dunning',
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { jobId } = await req.json();
  const path = JOB_URLS[jobId];
  if (!path) {
    return NextResponse.json({ error: 'Unknown job' }, { status: 400 });
  }

  const env = getEnvironmentConfig();
  const baseUrl = req.nextUrl.origin;

  logger.info(`Admin cron trigger: ${jobId} by ${session.user.email}`);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'x-cron-secret': env.CRON_SECRET,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();
  return NextResponse.json(
    { ok: res.ok, status: res.status, body: text.slice(0, 500) },
    { status: res.ok ? 200 : 502 }
  );
}
