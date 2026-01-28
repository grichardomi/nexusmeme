/**
 * Coinbase Commerce Webhook Handler
 * POST /api/billing/coinbase/webhook
 *
 * Receives and processes webhook events from Coinbase Commerce
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  verifyWebhookSignature,
  handleWebhookEvent,
  isCoinbaseCommerceEnabled,
} from '@/services/billing/coinbase-commerce';

export async function POST(req: NextRequest) {
  try {
    // Check if Coinbase Commerce is enabled
    if (!isCoinbaseCommerceEnabled()) {
      logger.warn('Coinbase Commerce webhook received but service is disabled');
      return NextResponse.json({ error: 'Service disabled' }, { status: 400 });
    }

    // Get raw body for signature verification
    const rawBody = await req.text();

    // Get signature from headers
    const signature = req.headers.get('X-CC-Webhook-Signature');

    if (!signature) {
      logger.warn('Coinbase Commerce webhook missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Coinbase Commerce webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the event
    const event = JSON.parse(rawBody);

    logger.info('Coinbase Commerce webhook received', {
      eventType: event.event?.type,
      chargeId: event.event?.data?.id,
    });

    // Process the event
    if (event.event) {
      await handleWebhookEvent({
        type: event.event.type,
        data: event.event.data,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Coinbase Commerce webhook error', error instanceof Error ? error : null);

    // Return 200 to prevent Coinbase from retrying on application errors
    // Only return non-200 for signature/auth failures
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 200 });
  }
}

// Disable body parsing - we need raw body for signature verification
export const dynamic = 'force-dynamic';
