/**
 * Stripe Billing Webhook
 * POST /api/webhooks/stripe/billing
 *
 * Receives events from Stripe:
 * - invoice.paid
 * - invoice.payment_failed
 * - charge.refunded
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleChargeRefunded,
} from '@/services/billing/stripe-webhook-handler';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_BILLING || '';

/**
 * Verify Stripe webhook signature and dispatch to handler
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    logger.warn('Stripe webhook received without signature');
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET_BILLING not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    logger.error('Webhook signature verification failed', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  logger.info('Stripe webhook received', {
    eventType: event.type,
    eventId: event.id,
  });

  try {
    // Dispatch to appropriate handler
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;

      default:
        logger.debug('Unhandled webhook event type', {
          eventType: event.type,
        });
    }

    return NextResponse.json(
      { success: true, eventId: event.id },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Webhook handler failed', error instanceof Error ? error : null, {
      eventType: event.type,
    });

    // Stripe expects 2xx response to not retry
    // But we should log the error for investigation
    return NextResponse.json(
      {
        success: false,
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 } // Still return 200 so Stripe doesn't retry forever
    );
  }
}
