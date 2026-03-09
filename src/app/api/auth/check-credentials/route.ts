import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyHash } from '@/lib/crypto';
import { apiRateLimits } from '@/middleware/rate-limit';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { passwordResetService } from '@/services/auth/password-reset';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * POST /api/auth/check-credentials
 * Validates email+password and returns specific error messages.
 *
 * NextAuth swallows all authorize() errors into "CredentialsSignin".
 * This endpoint runs the same checks and returns readable errors + fires
 * security alert emails at the right thresholds.
 */

const WARN_THRESHOLD = 5;   // send "suspicious activity" email after this many failures
const LOCK_THRESHOLD = 10;  // lock account after this many failures

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

async function sendLoginAlert(opts: {
  userId: string;
  email: string;
  name: string | null;
  attemptCount: number;
  isLocked: boolean;
  lockedUntil?: string;
  ipAddress: string;
}) {
  try {
    // Generate a reset token so the user can unlock immediately from the email
    await passwordResetService.requestReset(opts.email);

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/forgot-password`;

    await jobQueueManager.enqueue(
      'send_email',
      {
        to: opts.email,
        subject: opts.isLocked
          ? 'Your NexusMeme account has been locked'
          : `Security alert: ${opts.attemptCount} failed login attempts`,
        template: 'login_alert',
        variables: {
          name: opts.name || undefined,
          email: opts.email,
          attemptCount: opts.attemptCount,
          isLocked: opts.isLocked,
          lockedUntil: opts.isLocked ? '15 minutes' : undefined,
          resetUrl,
          ipAddress: opts.ipAddress,
        },
      },
      { priority: 9, maxRetries: 3 }
    );

    logger.info('Login alert email queued', {
      userId: opts.userId,
      attemptCount: opts.attemptCount,
      isLocked: opts.isLocked,
    });
  } catch (err) {
    logger.error('Failed to queue login alert email', err instanceof Error ? err : null);
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await apiRateLimits.auth(request);
  if (rateLimitResponse.status === 429) return rateLimitResponse;

  try {
    const body = await request.json();
    const validation = schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
    }

    const { email, password } = validation.data;
    const ip = getClientIp(request);

    const result = await query<{
      id: string;
      name: string | null;
      password_hash: string | null;
      email_verified: boolean;
      failed_login_attempts: number;
      locked_until: string | null;
    }>(
      `SELECT id, name, password_hash, email_verified, failed_login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // Generic error for missing user — no enumeration
    if (result.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user = result[0];

    // Already locked check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return NextResponse.json(
        { error: 'locked', lockedUntil: user.locked_until },
        { status: 423 }
      );
    }

    // Password check — increment failure counter on wrong password
    const valid = user.password_hash && await verifyHash(password, user.password_hash);
    if (!valid) {
      const rows = await query<{ failed_login_attempts: number; locked_until: string | null }>(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE WHEN failed_login_attempts + 1 >= $2
                                 THEN NOW() + INTERVAL '15 minutes'
                                 ELSE locked_until END
         WHERE id = $1
         RETURNING failed_login_attempts, locked_until`,
        [user.id, LOCK_THRESHOLD]
      );
      const updated = rows[0];
      const newCount = updated?.failed_login_attempts ?? 1;
      const justLocked = !!updated?.locked_until;

      // Fire security alert email at warn threshold and on lockout (fire-and-forget)
      if (justLocked || newCount === WARN_THRESHOLD) {
        sendLoginAlert({
          userId: user.id,
          email: email.toLowerCase(),
          name: user.name,
          attemptCount: newCount,
          isLocked: justLocked,
          ipAddress: ip,
        });
      }

      if (justLocked) {
        return NextResponse.json(
          { error: 'locked', lockedUntil: updated!.locked_until },
          { status: 423 }
        );
      }

      const remaining = Math.max(0, LOCK_THRESHOLD - newCount);
      return NextResponse.json(
        { error: 'Invalid email or password', attemptsRemaining: remaining },
        { status: 401 }
      );
    }

    // Email verification check
    if (!user.email_verified) {
      return NextResponse.json(
        { error: 'Please verify your email before signing in. Check your inbox for a verification link.' },
        { status: 403 }
      );
    }

    // Success — clear failure counter
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    logger.info('Credentials pre-check passed', { userId: user.id });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error('check-credentials failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Sign in failed. Please try again.' }, { status: 500 });
  }
}
