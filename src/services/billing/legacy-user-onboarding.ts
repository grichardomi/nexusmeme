import { getPool } from '@/lib/db';
import { initializeSubscription } from './subscription';
import { logger } from '@/lib/logger';

/**
 * Legacy User Onboarding Service
 * Handles automatic plan assignment for users who don't have active subscriptions.
 * This ensures users signup before the billing system was implemented still get access.
 */

export interface LegacyUserAssignmentResult {
  success: boolean;
  userId: string;
  email: string;
  action: 'created' | 'already_exists' | 'failed';
  message: string;
  subscriptionId?: string;
  trialEndsAt?: Date;
}

/**
 * Check if a user has an active subscription
 * Returns true if user has any active/trialing subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT id FROM subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trialing')
       LIMIT 1`,
      [userId]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Auto-assign live trial plan to a legacy user
 * Creates a live trading trial with 10-day duration if user doesn't have one
 *
 * @param userId - User ID
 * @param email - User email
 * @param name - User name (optional)
 * @returns Assignment result with subscription details
 */
export async function assignStarterPlanToLegacyUser(
  userId: string,
  email: string,
  name?: string
): Promise<LegacyUserAssignmentResult> {
  try {
    const client = await getPool().connect();

    try {
      // 1. Check if user already has an active subscription
      const hasSubscription = await hasActiveSubscription(userId);

      if (hasSubscription) {
        logger.info('User already has active subscription', { userId, email });
        return {
          success: true,
          userId,
          email,
          action: 'already_exists',
          message: 'User already has an active subscription',
        };
      }

      // 2. Check if user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [userId]
      );

      if (!userResult.rows[0]) {
        return {
          success: false,
          userId,
          email,
          action: 'failed',
          message: 'User not found',
        };
      }

      // 3. Initialize subscription for the user
      // This creates a live trial subscription in the database
      logger.info('Initializing live trial plan for legacy user', { userId, email });

      const subscription = await initializeSubscription(userId, email, name);

      logger.info('Successfully assigned live trial plan to legacy user', {
        userId,
        email,
        subscriptionId: subscription.id,
        trialEndsAt: subscription.trialEndsAt ?? (subscription as any).trial_ends_at ?? null,
      });

      const trialEndsAt = subscription.trialEndsAt ?? (subscription as any).trial_ends_at ?? null;

      return {
        success: true,
        userId,
        email,
        action: 'created',
        message: 'Live trial plan with 10-day trial assigned successfully',
        subscriptionId: subscription.id,
        trialEndsAt,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to assign live trial plan to legacy user', error instanceof Error ? error : null, {
      userId,
      email,
      error: errorMessage,
    });

    return {
      success: false,
      userId,
      email,
      action: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Find all users without active subscriptions
 * Optionally filter by creation date (for legacy user detection)
 *
 * @param createdBeforeDate - Optional: only get users created before this date
 * @param limit - Maximum number of users to return
 * @returns Array of users without subscriptions
 */
export async function findUsersWithoutSubscriptions(
  createdBeforeDate?: Date,
  limit: number = 100
): Promise<Array<{ id: string; email: string; name?: string; created_at: Date }>> {
  const client = await getPool().connect();

  try {
    let query = `
      SELECT u.id, u.email, u.name, u.created_at
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
      WHERE s.id IS NULL
    `;

    const params: any[] = [];

    if (createdBeforeDate) {
      query += ` AND u.created_at < $${params.length + 1}`;
      params.push(createdBeforeDate);
    }

    query += ` ORDER BY u.created_at ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Batch assign live trial plans to all legacy users without subscriptions
 * Useful for migrations or one-time onboarding flows
 *
 * @param createdBeforeDate - Optional: only process users created before this date
 * @param batchSize - Process in batches of this size
 * @returns Summary of assignment results
 */
export async function batchAssignStarterPlansToLegacyUsers(
  createdBeforeDate?: Date,
  batchSize: number = 10
): Promise<{
  total: number;
  successful: number;
  failed: number;
  alreadyHad: number;
  results: LegacyUserAssignmentResult[];
}> {
  logger.info('Starting batch assignment of live trial plans to legacy users', {
    createdBeforeDate,
    batchSize,
  });

  const results: LegacyUserAssignmentResult[] = [];
  let offset = 0;
  let hasMore = true;
  const summary = {
    total: 0,
    successful: 0,
    failed: 0,
    alreadyHad: 0,
    results,
  };

  while (hasMore) {
    // Get next batch of users
    const users = await findUsersWithoutSubscriptions(createdBeforeDate, batchSize);

    if (users.length === 0) {
      hasMore = false;
      break;
    }

    // Process each user in batch
    for (const user of users) {
      const result = await assignStarterPlanToLegacyUser(
        user.id,
        user.email,
        user.name || undefined
      );

      summary.results.push(result);
      summary.total++;

      if (result.success) {
        if (result.action === 'created') {
          summary.successful++;
        } else if (result.action === 'already_exists') {
          summary.alreadyHad++;
        }
      } else {
        summary.failed++;
      }

      // Add small delay between operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    offset += batchSize;

    // Check if there are more users
    if (users.length < batchSize) {
      hasMore = false;
    }
  }

  logger.info('Batch assignment completed', summary);
  return summary;
}

/**
 * Initialize onboarding for a specific user
 * Ensures user has subscription and performs any necessary onboarding setup
 *
 * @param userId - User ID
 * @returns Onboarding status
 */
export async function initializeUserOnboarding(userId: string): Promise<{
  requiresOnboarding: boolean;
  message: string;
  subscriptionDetails?: {
    plan: string;
    status: string;
    trialEndsAt?: Date;
  };
}> {
  const client = await getPool().connect();

  try {
    // 1. Get user info
    const userResult = await client.query(
      `SELECT id, email, name FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        requiresOnboarding: false,
        message: 'User not found',
      };
    }

    const user = userResult.rows[0];

    // 2. Check for active subscription
    const hasSubscription = await hasActiveSubscription(userId);

    if (!hasSubscription) {
      // 3. Assign live trial plan if missing
      const result = await assignStarterPlanToLegacyUser(
        userId,
        user.email,
        user.name || undefined
      );

      if (!result.success) {
        return {
          requiresOnboarding: true,
          message: `Failed to initialize trial: ${result.message}`,
        };
      }
    }

    // 4. Get current subscription details
    const subResult = await client.query(
      `SELECT plan, status, trial_ends_at FROM subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trialing')
       LIMIT 1`,
      [userId]
    );

    if (subResult.rows.length === 0) {
      return {
        requiresOnboarding: false,
        message: 'Trial initialized but could not retrieve details',
      };
    }

    const subscription = subResult.rows[0];

    return {
      requiresOnboarding: false,
      message: 'User successfully onboarded with 10-day live trading trial',
      subscriptionDetails: {
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt ?? subscription.trial_ends_at ?? null,
      },
    };
  } finally {
    client.release();
  }
}
