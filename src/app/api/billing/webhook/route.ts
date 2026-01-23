import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getEnv } from '@/config/environment';
import { handleStripeWebhook } from '@/services/billing/stripe';

/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription updates, payments, invoices, etc.
 */

const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const body = await req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    // Process webhook event
    await handleStripeWebhook(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
