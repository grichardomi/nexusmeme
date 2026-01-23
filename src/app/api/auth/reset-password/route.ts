import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { passwordResetService } from '@/services/auth/password-reset';
import { apiRateLimits } from '@/middleware/rate-limit';
import { z } from 'zod';

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = await apiRateLimits.auth(request);
    if (rateLimitResponse.status === 429) {
      return rateLimitResponse;
    }

    const body = await request.json();

    // Validate input
    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { token, password } = validation.data;

    // Check password requirements
    const passwordError = passwordResetService.getPasswordValidationError(password);
    if (passwordError) {
      return NextResponse.json(
        { error: passwordError },
        { status: 400 }
      );
    }

    // Reset password
    const result = await passwordResetService.resetPassword(token, password);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    logger.info('Password reset completed', { userId: result.userId });

    return NextResponse.json(
      {
        message: 'Password reset successfully',
        userId: result.userId,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Password reset failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Reset failed' },
      { status: 500 }
    );
  }
}
