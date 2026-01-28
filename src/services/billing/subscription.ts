import { getPool, query } from '@/lib/db';
import {
  createStripeCustomer,
  createSubscription as createStripeSubscription,
  cancelSubscription as cancelStripeSubscription,
  updateSubscriptionPlan as updateStripeSubscriptionPlan,
  checkPlanLimits,
} from './stripe';
import { PRICING_PLANS } from '@/config/pricing';
import { Subscription, SubscriptionPlan, BillingPeriod } from '@/types/billing';

/**
 * Subscription Management Service
 * Handles business logic for subscription management including:
 * - Creating subscriptions for new users
 * - Managing subscription lifecycle
 * - Enforcing plan limits
 * - Handling downgrades/upgrades
 */

/**
 * Initialize subscription for a new user
 * Creates a free trial subscription and Stripe customer
 */
export async function initializeSubscription(
  userId: string,
  email: string,
  name?: string
): Promise<Subscription> {
  const client = await getPool().connect();

  try {
    // Create Stripe customer
    const stripeCustomerId = await createStripeCustomer(userId, email, name);

    // Save Stripe customer ID to user record
    await client.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
      stripeCustomerId,
      userId,
    ]);

    // Create live_trial subscription (free plan no longer exists)
    const subscription = await createStripeSubscription(
      userId,
      stripeCustomerId,
      'live_trial',
      'monthly'
    );

    return subscription;
  } finally {
    client.release();
  }
}

/**
 * Get user's current subscription
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status != 'cancelled'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Upgrade or downgrade subscription plan
 */
export async function upgradeSubscription(
  userId: string,
  newPlan: SubscriptionPlan,
  period: BillingPeriod
): Promise<Subscription> {
  const client = await getPool().connect();

  try {
    // Get current subscription
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      throw new Error('User has no active subscription');
    }

    // Validate plan change
    const newPlanConfig = PRICING_PLANS[newPlan];

    if (!newPlanConfig) {
      throw new Error(`Invalid plan: ${newPlan}`);
    }

    // Update Stripe subscription
    const updatedSub = await updateStripeSubscriptionPlan(
      (subscription as any).stripe_subscription_id,
      newPlan,
      period
    );

    return updatedSub;
  } finally {
    client.release();
  }
}

/**
 * Cancel user's subscription
 */
export async function cancelUserSubscription(
  userId: string,
  immediate = false
): Promise<void> {
  const client = await getPool().connect();

  try {
    // Get current subscription
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      throw new Error('User has no active subscription');
    }

    // Cancel Stripe subscription
    await cancelStripeSubscription((subscription as any).stripe_subscription_id, immediate);
  } finally {
    client.release();
  }
}

/**
 * Check if user's action is allowed by plan limits
 */
export async function checkActionAllowed(
  userId: string,
  action: 'createBot' | 'addPair' | 'makeApiCall'
): Promise<{ allowed: boolean; reason?: string; limit?: number }> {
  // Block bot creation/startup if billing is suspended
  if (action === 'createBot') {
    const billingResult = await query(
      `SELECT billing_status FROM user_stripe_billing WHERE user_id = $1`,
      [userId]
    );
    if (billingResult[0]?.billing_status === 'suspended') {
      return {
        allowed: false,
        reason: 'Your billing is suspended due to failed payments. Please update your payment method to resume trading.',
      };
    }
  }

  const subscription = await getUserSubscription(userId);

  // If no subscription, assume live_trial tier (free plan no longer exists)
  const plan = subscription?.plan || 'live_trial';
  const planConfig = PRICING_PLANS[plan];

  // Safety check: if plan doesn't exist in PRICING_PLANS, default to live_trial config
  if (!planConfig) {
    const fallbackConfig = PRICING_PLANS['live_trial'] || { limits: { botsPerUser: 1, tradingPairsPerBot: 5 } };

    switch (action) {
      case 'createBot':
        return {
          allowed: true,
          limit: fallbackConfig.limits.botsPerUser,
          reason: undefined,
        };
      case 'addPair':
        return {
          allowed: true,
          limit: fallbackConfig.limits.tradingPairsPerBot,
          reason: undefined,
        };
      default:
        return { allowed: true };
    }
  }

  switch (action) {
    case 'createBot': {
      const result = await checkPlanLimits(userId, plan, 'botsPerUser');
      return {
        allowed: !result.exceeded,
        limit: result.limit,
        reason: result.exceeded
          ? `You've reached the maximum of ${result.limit} bot${result.limit !== 1 ? 's' : ''} for your plan. Upgrade to create more.`
          : undefined,
      };
    }

    case 'addPair': {
      // For trading pairs, just return the plan limit (not checked per actual usage)
      const limit = planConfig.limits.tradingPairsPerBot;
      return {
        allowed: true, // Always allowed at plan level; will be checked in API
        limit,
        reason: undefined,
      };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Get plan usage for user
 */
export async function getPlanUsage(userId: string) {
  const client = await getPool().connect();

  try {
    const subscription = await getUserSubscription(userId);
    // Default to 'live_trial' since 'free' plan no longer exists in PRICING_PLANS
    const plan = subscription?.plan || 'live_trial';
    const planConfig = PRICING_PLANS[plan];

    // Safety check: if plan doesn't exist in PRICING_PLANS, default to live_trial config
    if (!planConfig) {
      const fallbackConfig = PRICING_PLANS['live_trial'] || { limits: { botsPerUser: 1, tradingPairsPerBot: 5 }, features: [] };
      // Determine trading mode from environment (no hardcoding)
      const isPaperTrading = process.env.KRAKEN_BOT_PAPER_TRADING === 'true';
      const tradingMode = isPaperTrading ? 'paper' : 'live';
      console.log('[BILLING] Plan not found, using fallback. KRAKEN_BOT_PAPER_TRADING:', process.env.KRAKEN_BOT_PAPER_TRADING, 'tradingMode:', tradingMode);
      return {
        plan,
        subscription: subscription || null,
        limits: {
          ...fallbackConfig.limits,
          tradingMode, // Include trading mode from environment
        },
        usage: { bots: 0, apiCalls: 0, trades: 0 },
        features: fallbackConfig.features,
      };
    }

    // Get current usage - bot count
    let botCount = 0;
    try {
      const botResult = await client.query(
        'SELECT COUNT(*) as count FROM bot_instances WHERE user_id = $1',
        [userId]
      );
      botCount = parseInt(botResult.rows[0]?.count || 0, 10);
    } catch (err) {
      // Table may not exist, default to 0
      botCount = 0;
    }

    // Get trade count (last 30 days)
    let tradeCount = 0;
    try {
      const tradeResult = await client.query(
        `SELECT COUNT(*) as count FROM trades
         WHERE bot_id IN (SELECT id FROM bot_instances WHERE user_id = $1)
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
        [userId]
      );
      tradeCount = parseInt(tradeResult.rows[0]?.count || 0, 10);
    } catch (err) {
      // Table may not exist, default to 0
      tradeCount = 0;
    }

    // Determine actual trading mode from environment (no hardcoding)
    // Read directly from process.env to avoid any caching issues
    const isPaperTradingEnv = process.env.KRAKEN_BOT_PAPER_TRADING === 'true';
    let actualTradingMode: 'live' | 'paper' = isPaperTradingEnv ? 'paper' : 'live';

    // Debug logging
    console.log('[BILLING] Trading mode detection:', {
      KRAKEN_BOT_PAPER_TRADING: process.env.KRAKEN_BOT_PAPER_TRADING,
      BINANCE_BOT_PAPER_TRADING: process.env.BINANCE_BOT_PAPER_TRADING,
      isPaperTradingEnv,
      initialMode: actualTradingMode,
    });

    // Check user's bot for exchange-specific setting
    try {
      const botConfigResult = await client.query(
        `SELECT exchange FROM bot_instances WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      console.log('[BILLING] Bot config query result:', botConfigResult.rows[0]);

      if (botConfigResult.rows[0]) {
        const exchange = botConfigResult.rows[0].exchange?.toLowerCase() || 'kraken';
        const isPaperTrading = exchange === 'binance'
          ? process.env.BINANCE_BOT_PAPER_TRADING === 'true'
          : process.env.KRAKEN_BOT_PAPER_TRADING === 'true';
        actualTradingMode = isPaperTrading ? 'paper' : 'live';
        console.log('[BILLING] Exchange-specific mode:', { exchange, isPaperTrading, finalMode: actualTradingMode });
      }
    } catch (err) {
      // Use default from env
      console.log('[BILLING] Error checking bot config:', err);
    }

    console.log('[BILLING] Final trading mode:', actualTradingMode);

    return {
      plan,
      subscription: subscription || null,
      limits: {
        ...planConfig.limits,
        tradingMode: actualTradingMode, // Override with actual trading mode
      },
      usage: {
        bots: botCount,
        apiCalls: 0, // Not tracking separately
        trades: tradeCount,
      },
      features: planConfig.features,
    };
  } finally {
    client.release();
  }
}

/**
 * Get available plans with pricing
 */
export function getAvailablePlans() {
  return Object.values(PRICING_PLANS).map(plan => ({
    ...plan,
    saving: plan.yearlyPrice > 0 ? Math.round((plan.yearlyPrice / 12 - plan.monthlyPrice) / plan.monthlyPrice * 100) : 0,
  }));
}

/**
 * Validate subscription is active
 */
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription?.status === 'active' || subscription?.status === 'trialing' || !subscription; // Free tier always active
}

/**
 * Get subscription details for payment page
 */
export async function getSubscriptionDetails(subscriptionId: string) {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT s.*, u.email, u.name
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [subscriptionId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * List all subscriptions for a user (including cancelled)
 */
export async function getUserSubscriptionHistory(userId: string, limit = 10) {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows as Subscription[];
  } finally {
    client.release();
  }
}
