import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { passwordResetService } from '@/services/auth/password-reset';
import { apiRateLimits } from '@/middleware/rate-limit';
import { z } from 'zod';

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit check - strict for forgot password
    const rateLimitResponse = await apiRateLimits.auth(request);
    if (rateLimitResponse.status === 429) {
      return rateLimitResponse;
    }

    const body = await request.json();

    // Validate input
    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Request reset (doesn't reveal if email exists)
    await passwordResetService.requestReset(email);

    logger.info('Password reset requested', { email });

    // Always return success to prevent email enumeration
    return NextResponse.json(
      {
        message: 'If an account exists, password reset email has been sent',
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Forgot password request failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Request failed' },
      { status: 500 }
    );
  }
}
