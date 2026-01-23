/**
 * Billing Setup API
 * POST /api/billing/setup/intent - Create SetupIntent for payment method
 * POST /api/billing/setup/confirm - Confirm setup and store customer
 * GET /api/billing/setup/status - Get current billing setup status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { query, transaction } from '@/lib/db';
import Stripe from 'stripe';
import { z } from 'zod';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/**
 * POST /api/billing/setup/intent
 * Create a SetupIntent to collect payment method
 * Returns client_secret for Stripe.js
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create-intent') {
      return await createSetupIntent(session.user.id);
    } else if (action === 'confirm') {
      return await confirmSetup(session.user.id, body);
    } else if (action === 'get-status') {
      return await getSetupStatus(session.user.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('Billing setup error', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process billing setup',
      },
      { status: 500 }
    );
  }
}

/**
 * Create SetupIntent for payment method collection
 */
async function createSetupIntent(userId: string): Promise<NextResponse> {
  try {
    // Check if user already has Stripe customer
    const existing = await query(
      `SELECT stripe_customer_id FROM user_stripe_billing WHERE user_id = $1`,
      [userId]
    );

    let customerId: string;

    if (existing[0]?.stripe_customer_id) {
      // Use existing customer
      customerId = existing[0].stripe_customer_id;
    } else {
      // Create new customer
      const user = await query(
        `SELECT email, id FROM users WHERE id = $1`,
        [userId]
      );

      if (!user[0]) {
        throw new Error('User not found');
      }

      const customer = await stripe.customers.create({
        email: user[0].email,
        description: `User: ${user[0].id}`,
        metadata: {
          userId: user[0].id,
        },
      });

      customerId = customer.id;

      // Store customer ID
      await query(
        `INSERT INTO user_stripe_billing (user_id, stripe_customer_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2`,
        [userId, customerId]
      );

      logger.info('Stripe customer created', {
        userId,
        customerId,
      });
    }

    // Create SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // Allow charges without user interaction
    });

    logger.info('SetupIntent created', {
      userId,
      setupIntentId: setupIntent.id,
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId,
    });
  } catch (error) {
    logger.error('Failed to create SetupIntent', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Confirm setup and store payment method
 */
async function confirmSetup(userId: string, body: any): Promise<NextResponse> {
  try {
    const schema = z.object({
      setupIntentId: z.string(),
      paymentMethodId: z.string(),
    });

    const validated = schema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { setupIntentId, paymentMethodId } = validated.data;

    // Retrieve SetupIntent to verify
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.status !== 'succeeded') {
      throw new Error(`SetupIntent status is ${setupIntent.status}, expected succeeded`);
    }

    if (setupIntent.customer !== setupIntent.customer) {
      throw new Error('SetupIntent customer mismatch');
    }

    // Update user billing config with payment method
    await transaction(async (client) => {
      await client.query(
        `UPDATE user_stripe_billing
         SET stripe_payment_method_id = $1,
             billing_status = 'active',
             updated_at = NOW()
         WHERE user_id = $2`,
        [paymentMethodId, userId]
      );
    });

    logger.info('Billing setup confirmed', {
      userId,
      setupIntentId,
      paymentMethodId,
    });

    return NextResponse.json({
      success: true,
      message: 'Billing setup completed successfully',
    });
  } catch (error) {
    logger.error('Failed to confirm setup', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Get current setup status
 */
async function getSetupStatus(userId: string): Promise<NextResponse> {
  try {
    const result = await query(
      `SELECT
         stripe_customer_id,
         stripe_payment_method_id,
         billing_status,
         created_at
       FROM user_stripe_billing
       WHERE user_id = $1`,
      [userId]
    );

    if (!result[0]) {
      return NextResponse.json({
        setup_complete: false,
        message: 'No billing setup found',
      });
    }

    const billing = result[0];

    return NextResponse.json({
      setup_complete: !!billing.stripe_payment_method_id,
      customerId: billing.stripe_customer_id,
      billingStatus: billing.billing_status,
      setupDate: billing.created_at,
    });
  } catch (error) {
    logger.error('Failed to get setup status', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}
