import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import Stripe from 'stripe';
import { getEnv } from '@/config/environment';
import { PRICING_PLANS, STRIPE_PRICE_IDS } from '@/config/pricing';
import { getPool } from '@/lib/db';
import { z } from 'zod';

/**
 * Checkout Session API
 * Creates a Stripe checkout session for upgrading plans
 */

const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

const checkoutSchema = z.object({
  plan: z.enum(['free', 'pro', 'enterprise']),
  period: z.enum(['monthly', 'yearly']),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan, period } = checkoutSchema.parse(body);

    // Validate plan exists
    const pricingPlan = PRICING_PLANS[plan];
    if (!pricingPlan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Free plan doesn't need checkout
    if (plan === 'free') {
      return NextResponse.json({ error: 'Free plan does not require payment' }, { status: 400 });
    }

    // Get user's stripe customer ID
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT stripe_customer_id, name FROM users WHERE id = $1', [
        session.user.id,
      ]);

      if (!result.rows[0]) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      let customerId = result.rows[0].stripe_customer_id;

      // If user doesn't have a Stripe customer ID, create one
      if (!customerId) {
        console.log('Creating Stripe customer for user:', session.user.id);

        const stripeCustomer = await stripe.customers.create({
          email: session.user.email,
          name: result.rows[0].name || session.user.email,
          metadata: {
            userId: session.user.id,
          },
        });

        customerId = stripeCustomer.id;

        // Save Stripe customer ID to database
        await client.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
          customerId,
          session.user.id,
        ]);

        console.log('Stripe customer created:', customerId);
      }

      // Get Stripe price ID from config
      let priceId: string;
      if (plan === 'pro') {
        priceId = STRIPE_PRICE_IDS.standard;
      } else if (plan === 'enterprise') {
        priceId = STRIPE_PRICE_IDS.pro;
      } else {
        return NextResponse.json({ error: 'Invalid plan for checkout' }, { status: 400 });
      }

      if (!priceId) {
        return NextResponse.json(
          { error: 'Stripe price ID not configured' },
          { status: 500 }
        );
      }

      // Create checkout session using Stripe price IDs
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${getEnv('NEXT_PUBLIC_APP_URL')}/dashboard/billing?success=true`,
        cancel_url: `${getEnv('NEXT_PUBLIC_APP_URL')}/dashboard/billing?cancelled=true`,
        metadata: {
          userId: session.user.id,
          plan,
          period,
        },
      });

      return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
