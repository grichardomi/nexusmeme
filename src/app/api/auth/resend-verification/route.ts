import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { emailVerificationService } from '@/services/auth/email-verification';
import { apiRateLimits } from '@/middleware/rate-limit';
import { z } from 'zod';

/**
 * POST /api/auth/resend-verification
 * Re-send email verification link for a given email address.
 *
 * Always returns 200 regardless of whether the email exists or is already verified
 * to prevent email enumeration.
 */

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await apiRateLimits.auth(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const validation = schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const { email } = validation.data;

    const result = await query<{ id: string; email_verified: boolean }>(
      `SELECT id, email_verified FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // Silently succeed if email not found or already verified — no enumeration
    if (result.length > 0 && !result[0].email_verified) {
      await emailVerificationService.sendVerificationEmail(result[0].id, email.toLowerCase());
      logger.info('Resent verification email', { userId: result[0].id });
    }

    return NextResponse.json(
      { message: 'If your account exists and is unverified, a new verification email has been sent.' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Resend verification failed', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
