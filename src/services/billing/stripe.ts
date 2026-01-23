import Stripe from 'stripe';
import { getEnv } from '@/config/environment';
import { getPool } from '@/lib/db';
import { Subscription, Invoice, PaymentMethod, SubscriptionPlan, BillingPeriod } from '@/types/billing';
import { PRICING_PLANS } from '@/config/pricing';

/**
 * Stripe Billing Service
 * Handles all Stripe API interactions for subscription management,
 * invoicing, and payment processing
 */

const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

// Export pricing plans for use throughout the app
export { PRICING_PLANS };

/**
 * Create a Stripe customer for a new user
 */
export async function createStripeCustomer(userId: string, email: string, name?: string): Promise<string> {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
      },
    });
    return customer.id;
  } catch (error) {
    console.error('Failed to create Stripe customer:', error);
    throw new Error('Failed to create payment customer');
  }
}

/**
 * Live trial configuration: 10 days for new users on live trading trial
 */
const TRIAL_DAYS = 10;

/**
 * Create a subscription for a user
 */
export async function createSubscription(
  userId: string,
  stripeCustomerId: string,
  plan: SubscriptionPlan,
  period: BillingPeriod,
  _paymentMethodId?: string
): Promise<Subscription> {
  try {
    // Get the pricing plan configuration
    const pricingPlan = PRICING_PLANS[plan];
    if (!pricingPlan) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    // Determine price based on billing period
    const priceAmount = period === 'yearly' ? pricingPlan.yearlyPrice : pricingPlan.monthlyPrice;

    // For live_trial plan, enable trial period
    const trialDays = plan === 'live_trial' ? TRIAL_DAYS : undefined;

    // Create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {
          price_data: {
            currency: 'usd',
            product: `${pricingPlan.name} Plan`,
            unit_amount: Math.round(priceAmount * 100), // Convert to cents
            recurring: {
              interval: period === 'yearly' ? 'year' : 'month',
            },
          } as any,
          quantity: 1,
        },
      ],
      payment_behavior: 'default_incomplete',
      trial_period_days: trialDays,
      metadata: {
        userId,
        plan,
        period,
      },
    });

    // Store subscription in database
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `INSERT INTO subscriptions (
          user_id, plan, status, period, stripe_subscription_id,
          stripe_customer_id, current_period_start, current_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *`,
        [
          userId,
          plan,
          subscription.status === 'incomplete' ? 'trialing' : subscription.status,
          period,
          subscription.id,
          stripeCustomerId,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
        ]
      );

      return result.rows[0] as Subscription;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to create subscription:', error);
    throw new Error('Failed to create subscription');
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string, _immediate = false): Promise<void> {
  try {
    await (stripe.subscriptions as any).del(subscriptionId);

    // Update database
    const client = await getPool().connect();
    try {
      await client.query(
        `UPDATE subscriptions
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPlan: SubscriptionPlan,
  period: BillingPeriod
): Promise<Subscription> {
  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const pricingPlan = PRICING_PLANS[newPlan];

    if (!pricingPlan) {
      throw new Error(`Invalid plan: ${newPlan}`);
    }

    const priceAmount = period === 'yearly' ? pricingPlan.yearlyPrice : pricingPlan.monthlyPrice;

    // Update Stripe subscription
    await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price_data: {
            currency: 'usd',
            product: `${pricingPlan.name} Plan`,
            unit_amount: Math.round(priceAmount * 100),
            recurring: {
              interval: period === 'yearly' ? 'year' : 'month',
            },
          } as any,
          quantity: 1,
        },
      ],
      proration_behavior: 'create_prorations',
      metadata: {
        plan: newPlan,
        period,
      },
    });

    // Update database
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `UPDATE subscriptions
         SET plan = $1, period = $2, updated_at = NOW()
         WHERE stripe_subscription_id = $3
         RETURNING *`,
        [newPlan, period, subscriptionId]
      );

      return result.rows[0] as Subscription;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to update subscription:', error);
    throw new Error('Failed to update subscription');
  }
}

/**
 * Create a payment method for a user
 */
export async function createPaymentMethod(
  userId: string,
  stripePaymentMethodId: string,
  isDefault = false
): Promise<PaymentMethod> {
  try {
    // Retrieve payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

    // Get card details
    const cardDetails = paymentMethod.card;
    if (!cardDetails) {
      throw new Error('Invalid payment method type');
    }

    // If setting as default, remove default from other payment methods
    if (isDefault) {
      const client = await getPool().connect();
      try {
        await client.query(
          `UPDATE payment_methods SET is_default = false WHERE user_id = $1`,
          [userId]
        );
      } finally {
        client.release();
      }
    }

    // Store in database
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `INSERT INTO payment_methods (
          user_id, stripe_payment_method_id, type, brand, last4,
          exp_month, exp_year, is_default, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          userId,
          stripePaymentMethodId,
          paymentMethod.type,
          cardDetails.brand,
          cardDetails.last4,
          cardDetails.exp_month,
          cardDetails.exp_year,
          isDefault,
        ]
      );

      return result.rows[0] as PaymentMethod;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to create payment method:', error);
    throw new Error('Failed to save payment method');
  }
}

/**
 * Get invoices for a user
 */
export async function getUserInvoices(userId: string, limit = 20): Promise<Invoice[]> {
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT * FROM invoices
         WHERE user_id = $1
         ORDER BY due_date DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows as Invoice[];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to retrieve invoices:', error);
    // Return empty array instead of throwing - invoices table may not exist yet
    return [];
  }
}

/**
 * Track API usage for a user
 */
export async function trackUsage(
  userId: string,
  month: Date,
  apiCallsUsed: number,
  botsCreated = 0,
  tradesExecuted = 0
): Promise<void> {
  try {
    const client = await getPool().connect();
    try {
      await client.query(
        `INSERT INTO usage (user_id, month, api_calls_used, bots_created, trades_executed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (user_id, month) DO UPDATE SET
           api_calls_used = usage.api_calls_used + $3,
           bots_created = usage.bots_created + $4,
           trades_executed = usage.trades_executed + $5,
           updated_at = NOW()`,
        [userId, month, apiCallsUsed, botsCreated, tradesExecuted]
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to track usage:', error);
    throw new Error('Failed to track usage');
  }
}

/**
 * Get current usage for a user
 */
export async function getUserUsage(userId: string, month: Date) {
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT * FROM usage
         WHERE user_id = $1 AND EXTRACT(MONTH FROM month) = EXTRACT(MONTH FROM $2)
         AND EXTRACT(YEAR FROM month) = EXTRACT(YEAR FROM $2)
         LIMIT 1`,
        [userId, month]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to retrieve usage:', error);
    throw new Error('Failed to retrieve usage');
  }
}

/**
 * Check if user has exceeded plan limits
 */
export async function checkPlanLimits(
  userId: string,
  plan: SubscriptionPlan,
  metric: 'botsPerUser' | 'tradingPairsPerBot'
): Promise<{ exceeded: boolean; current: number; limit: number }> {
  try {
    const pricingPlan = PRICING_PLANS[plan];
    if (!pricingPlan) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const client = await getPool().connect();
    try {
      let current = 0;

      if (metric === 'botsPerUser') {
        const result = await client.query('SELECT COUNT(*) as count FROM bot_instances WHERE user_id = $1', [userId]);
        current = parseInt(result.rows[0]?.count || 0, 10);
      } else if (metric === 'tradingPairsPerBot') {
        // This is per-bot, not per-user, so we'll return the limit only
        current = 0; // Would be checked per-bot
      }

      const limit = pricingPlan.limits[metric];
      return {
        exceeded: current >= limit,
        current,
        limit,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to check plan limits:', error);
    throw new Error('Failed to check plan limits');
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const client = await getPool().connect();
        try {
          await client.query(
            `UPDATE subscriptions
             SET status = $1, updated_at = NOW()
             WHERE stripe_subscription_id = $2`,
            [subscription.status, subscription.id]
          );
        } finally {
          client.release();
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const client = await getPool().connect();
        try {
          await client.query(
            `UPDATE subscriptions
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [subscription.id]
          );
        } finally {
          client.release();
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const client = await getPool().connect();
        try {
          // Get subscription ID from invoice
          const subResult = await client.query(
            'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
            [invoice.subscription]
          );

          if (subResult.rows[0]) {
            const userId = subResult.rows[0].user_id;

            // Record invoice in database
            const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000) : new Date();
            await client.query(
              `INSERT INTO invoices (
                subscription_id, user_id, stripe_invoice_id, amount, currency,
                status, invoice_number, due_date, paid_at, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
              ON CONFLICT (stripe_invoice_id) DO UPDATE SET
                status = $6,
                paid_at = NOW(),
                updated_at = NOW()`,
              [
                invoice.subscription,
                userId,
                invoice.id,
                invoice.amount_paid,
                invoice.currency,
                'paid',
                invoice.number,
                dueDate,
              ]
            );
          }
        } finally {
          client.release();
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const client = await getPool().connect();
        try {
          await client.query(
            `UPDATE invoices
             SET status = 'uncollectible', updated_at = NOW()
             WHERE stripe_invoice_id = $1`,
            [invoice.id]
          );

          // Update subscription status to past_due
          if (invoice.subscription) {
            await client.query(
              `UPDATE subscriptions
               SET status = 'past_due', updated_at = NOW()
               WHERE stripe_subscription_id = $1`,
              [invoice.subscription]
            );
          }
        } finally {
          client.release();
        }
        break;
      }
    }
  } catch (error) {
    console.error('Failed to handle Stripe webhook:', error);
    throw error;
  }
}

export default stripe;
