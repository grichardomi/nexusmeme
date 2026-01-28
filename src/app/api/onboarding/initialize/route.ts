import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { initializeUserOnboarding } from '@/services/billing/legacy-user-onboarding';
import { logger } from '@/lib/logger';

/**
 * POST /api/onboarding/initialize
 *
 * Initialize onboarding for the current user.
 * This endpoint ensures the user has a plan (live_trial or performance_fees) and triggers any
 * necessary onboarding setup (e.g., assigning live_trial to new users).
 *
 * Response:
 * - 200: Onboarding initialized successfully
 * - 401: User not authenticated
 * - 500: Server error
 */
export async function POST() {
  try {
    // Get the current user session
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    logger.info('Initializing onboarding for user', { userId, email: session.user.email });

    // Initialize onboarding (this will create subscription if missing)
    const result = await initializeUserOnboarding(userId);

    if (result.requiresOnboarding && !result.subscriptionDetails) {
      logger.error('Failed to initialize onboarding', null, { userId, reason: result.message });
      return NextResponse.json(
        {
          error: 'Failed to initialize onboarding',
          message: result.message,
        },
        { status: 500 }
      );
    }

    logger.info('Onboarding initialized successfully', {
      userId,
      subscriptionPlan: result.subscriptionDetails?.plan,
      subscriptionStatus: result.subscriptionDetails?.status,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        subscription: result.subscriptionDetails
          ? {
              plan: result.subscriptionDetails.plan,
              status: result.subscriptionDetails.status,
              trialEndsAt: result.subscriptionDetails.trialEndsAt,
              featureLimits: getFeatureLimits(result.subscriptionDetails.plan),
            }
          : null,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Onboarding initialization failed', error instanceof Error ? error : null, {
      error: errorMessage,
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to get feature limits for a plan
 */
function getFeatureLimits(plan: string): Record<string, any> {
  const limits: Record<string, Record<string, any>> = {
    live_trial: {
      botsPerUser: 1,
      tradingPairsPerBot: 5,
      tradingMode: 'live',
    },
    performance_fees: {
      botsPerUser: 1,
      tradingPairsPerBot: 5,
      tradingMode: 'live',
    },
  };

  return limits[plan] || limits.live_trial;
}
