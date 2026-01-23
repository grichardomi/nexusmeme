import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { emailVerificationService } from '@/services/auth/email-verification';

/**
 * POST /api/auth/verify-email
 * Verify user's email with token
 */

export async function POST(request: NextRequest) {
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
    return NextResponse.redirect(new URL('/auth/verify-success', request.url), { status: 302 });
  } catch (error) {
    logger.error('Email verification failed', error instanceof Error ? error : null);
    return NextResponse.redirect(new URL('/auth/verify-error', request.url), { status: 302 });
  }
}
