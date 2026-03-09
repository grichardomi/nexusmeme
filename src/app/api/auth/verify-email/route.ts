import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { emailVerificationService } from '@/services/auth/email-verification';
import { apiRateLimits } from '@/middleware/rate-limit';

/**
 * POST /api/auth/verify-email
 * Verify user's email with token
 */

export async function POST(request: NextRequest) {
  const rateLimitResponse = await apiRateLimits.auth(request);
  if (rateLimitResponse.status === 429) return rateLimitResponse;

  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify email
    const result = await emailVerificationService.verifyEmail(token);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: 'Email verified successfully',
        userId: result.userId,
        email: result.email,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Email verification failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/verify-email
 * Verify email with token from query params (for email links)
 */

export async function GET(request: NextRequest) {
  const rateLimitResponse = await apiRateLimits.auth(request);
  if (rateLimitResponse.status === 429) {
    return NextResponse.redirect(new URL('/auth/verify-email/error?reason=rate_limited', request.url), { status: 302 });
  }

  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify email
    const result = await emailVerificationService.verifyEmail(token);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    // Redirect to success page
    return NextResponse.redirect(new URL('/auth/verify-email/success', request.url), { status: 302 });
  } catch (error) {
    logger.error('Email verification failed', error instanceof Error ? error : null);
    return NextResponse.redirect(new URL('/auth/verify-email/error', request.url), { status: 302 });
  }
}
