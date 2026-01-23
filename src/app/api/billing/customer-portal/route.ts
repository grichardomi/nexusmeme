import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import Stripe from 'stripe';
import { getEnv } from '@/config/environment';
import { getPool } from '@/lib/db';

/**
 * Stripe Customer Portal API
 * Redirects users to Stripe's customer portal for managing payment methods and subscriptions
 */

const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's stripe customer ID
    const client = await getPool().connect();
    try {
      const userResult = await client.query(
        'SELECT stripe_customer_id, name FROM users WHERE id = $1',
        [session.user.id]
      );

      if (!userResult.rows[0]) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      let customerId = userResult.rows[0].stripe_customer_id;

      // If user doesn't have a Stripe customer ID, create one
      if (!customerId) {
        console.log('Creating Stripe customer for user:', session.user.id);

        const stripeCustomer = await stripe.customers.create({
          email: session.user.email,
          name: userResult.rows[0].name || session.user.email,
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

      // Create a customer portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${getEnv('NEXT_PUBLIC_APP_URL')}/dashboard/billing`,
      });

      // Redirect to customer portal
      return NextResponse.redirect(portalSession.url);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error accessing customer portal:', error);
    return NextResponse.json(
      { error: 'Failed to access customer portal', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
