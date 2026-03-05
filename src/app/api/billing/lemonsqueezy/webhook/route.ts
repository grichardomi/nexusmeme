/**
 * Lemon Squeezy Webhook Handler
 * POST /api/billing/lemonsqueezy/webhook
 */

import { logger } from '@/lib/logger';
import { verifyWebhookSignature, handleWebhookEvent } from '@/services/billing/lemon-squeezy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature') ?? '';
  const eventName = req.headers.get('X-Event-Name') ?? '';

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Invalid Lemon Squeezy webhook signature', { eventName });
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const data = JSON.parse(rawBody);
    await handleWebhookEvent(eventName, data);
  } catch (err) {
    logger.error('Lemon Squeezy webhook processing error', err instanceof Error ? err : null, { eventName });
  }

  return Response.json({ received: true });
}
