/**
 * Admin Health Check Endpoint
 * GET  /api/admin/health-check          — run check, email admin if unhealthy
 * POST /api/admin/health-check          — force email regardless of status
 *
 * Protected by CRON_SECRET header (set same value in Railway cron job config).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runSystemHealthCheck, sendSystemHealthAlert } from '@/services/monitoring/error-notifier';
import { getEnvironmentConfig } from '@/config/environment';

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Accept CRON_SECRET header (Railway cron / external callers)
  const env = getEnvironmentConfig();
  const secret = env.CRON_SECRET;
  if (secret && (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )) return true;

  // Accept admin session (browser dashboard)
  const session = await getServerSession(authOptions);
  return session?.user != null && (session.user as any).role === 'admin';
}

export async function GET(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runSystemHealthCheck();
  await sendSystemHealthAlert(false); // emails only if not healthy

  return NextResponse.json(result, {
    status: result.status === 'unhealthy' ? 503 : 200,
  });
}

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runSystemHealthCheck();
  await sendSystemHealthAlert(true); // force email

  return NextResponse.json({ ...result, emailSent: true });
}
