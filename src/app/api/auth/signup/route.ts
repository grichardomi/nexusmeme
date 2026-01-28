import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { hash } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { emailVerificationService } from '@/services/auth/email-verification';
import { initializeSubscription } from '@/services/billing/subscription';
import { apiRateLimits } from '@/middleware/rate-limit';
import { z } from 'zod';

/**
 * POST /api/auth/signup
 * Register a new user with email and password
 */

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
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
    const validation = signupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { email, password, name } = validation.data;

    // Check if user exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Create user in transaction
    const userId = await transaction(async client => {
      // Hash password
      const passwordHash = hash(password);

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
        [email.toLowerCase(), name, passwordHash]
      );

      return result.rows[0].id;
    });

    // Initialize free starter plan subscription
    let subscriptionInitialized = false;
    try {
      await initializeSubscription(userId, email, name);
      logger.info('Initialized free starter subscription', { userId });
      subscriptionInitialized = true;
    } catch (error) {
      logger.error(
        'Failed to initialize subscription during signup',
        error instanceof Error ? error : null
      );
      // Will retry during first login/onboarding
    }

    // Send verification email
    try {
      await emailVerificationService.sendVerificationEmail(userId, email);
    } catch (error) {
      logger.error(
        'Failed to send verification email during signup',
        error instanceof Error ? error : null
      );
      // Don't fail signup if email fails to send
    }

    logger.info('User signed up', {
      userId,
      email,
      subscriptionInitialized,
    });

    return NextResponse.json(
      {
        message: 'Account created successfully',
        userId,
        email,
        requiresEmailVerification: true,
        subscriptionInitialized,
        onboardingUrl: '/api/onboarding/initialize',
        note: subscriptionInitialized
          ? 'Live trading trial with 10-day duration activated (no capital limits)'
          : 'Please complete onboarding to activate your live trading trial',
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Signup failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 }
    );
  }
}
