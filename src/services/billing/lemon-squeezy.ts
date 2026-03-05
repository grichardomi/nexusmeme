/**
 * Lemon Squeezy Billing Service
 * Handles card/PayPal payments for performance fees
 * Replaces Coinbase Commerce for fiat payment flow
 */

import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';

const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';

export interface LemonSqueezyCheckout {
  id: string;
  url: string;
}

export interface CreateCheckoutParams {
  userId: string;
  amountUsd: number;
  description: string;
  feeIds: string[];
}

/**
 * Check if Lemon Squeezy is enabled and configured
 */
export function isLemonSqueezyEnabled(): boolean {
  const env = getEnvironmentConfig();
  return env.LEMONSQUEEZY_ENABLED && !!env.LEMONSQUEEZY_API_KEY && !!env.LEMONSQUEEZY_STORE_ID && !!env.LEMONSQUEEZY_VARIANT_ID;
}

/**
 * Create a Lemon Squeezy checkout for performance fees
 */
export async function createPerformanceFeeCheckout(
  params: CreateCheckoutParams
): Promise<LemonSqueezyCheckout> {
  const env = getEnvironmentConfig();

  if (!env.LEMONSQUEEZY_API_KEY) {
    throw new Error('Lemon Squeezy API key not configured');
  }
  if (!env.LEMONSQUEEZY_STORE_ID || !env.LEMONSQUEEZY_VARIANT_ID) {
    throw new Error('Lemon Squeezy store or variant ID not configured');
  }

  const { userId, amountUsd, feeIds } = params;

  // Convert USD to cents
  const amountCents = Math.round(amountUsd * 100);

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: amountCents,
        checkout_data: {
          custom: {
            user_id: userId,
            fee_ids: feeIds.join(','),
          },
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: env.LEMONSQUEEZY_STORE_ID },
        },
        variant: {
          data: { type: 'variants', id: env.LEMONSQUEEZY_VARIANT_ID },
        },
      },
    },
  };

  const response = await fetch(`${LEMONSQUEEZY_API_URL}/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    logger.error('Lemon Squeezy API error', null, {
      status: response.status,
      error: errorData,
    });
    throw new Error(`Lemon Squeezy API error: ${response.status}`);
  }

  const result = await response.json();
  const checkoutId: string = result.data.id;
  const checkoutUrl: string = result.data.attributes?.url;

  // Insert pending ls_order record
  await query(
    `INSERT INTO ls_orders
     (user_id, ls_checkout_id, amount_cents, status, checkout_url, fee_ids, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW())`,
    [userId, checkoutId, amountCents, checkoutUrl, feeIds.join(',')]
  );

  // Mark fees as billed
  await query(
    `UPDATE performance_fees
     SET status = 'billed',
         billed_at = NOW(),
         ls_order_id = $1,
         updated_at = NOW()
     WHERE id = ANY($2)`,
    [checkoutId, feeIds]
  );

  logger.info('Lemon Squeezy checkout created', {
    checkoutId,
    userId,
    amountUsd,
    feeCount: feeIds.length,
    checkoutUrl,
  });

  return { id: checkoutId, url: checkoutUrl };
}

/**
 * Verify Lemon Squeezy webhook signature
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const env = getEnvironmentConfig();

  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    logger.warn('Lemon Squeezy webhook secret not configured');
    return false;
  }

  const computed = crypto
    .createHmac('sha256', env.LEMONSQUEEZY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Handle incoming Lemon Squeezy webhook event
 */
export async function handleWebhookEvent(eventName: string, data: unknown): Promise<void> {
  logger.info('Processing Lemon Squeezy webhook', { eventName });

  switch (eventName) {
    case 'order_created':
      await handleOrderPaid(data);
      break;

    case 'order_refunded':
      await handleOrderRefunded(data);
      break;

    default:
      logger.info('Unhandled Lemon Squeezy event type', { eventName });
  }
}

/**
 * Handle successful order payment
 */
async function handleOrderPaid(data: unknown): Promise<void> {
  const payload = data as Record<string, unknown>;

  // Extract custom metadata
  const meta = payload?.meta as Record<string, unknown> | undefined;
  const customData = meta?.custom_data as Record<string, string> | undefined;
  const userId = customData?.user_id;
  const feeIdsStr = customData?.fee_ids;

  const orderData = (payload?.data as Record<string, unknown>)?.attributes as Record<string, unknown> | undefined;
  // data.id is the LS order ID; checkout_id is the checkout session we created
  const lsOrderId = String((payload?.data as Record<string, unknown>)?.id ?? '');
  const checkoutId = String(orderData?.checkout_id ?? '');
  const receiptUrl = String(orderData?.urls?.['receipt'] ?? '');

  if (!userId) {
    logger.warn('Lemon Squeezy order_created missing user_id in custom_data', { lsOrderId });
    return;
  }

  const feeIds = feeIdsStr ? feeIdsStr.split(',').filter(Boolean) : [];

  try {
    await transaction(async (client) => {
      // Match by checkout_id (what we stored on creation); fall back to ls_order_id
      await client.query(
        `UPDATE ls_orders
         SET status = 'paid',
             paid_at = NOW(),
             ls_order_id = $1,
             receipt_url = $2,
             updated_at = NOW()
         WHERE (ls_checkout_id = $3 OR ls_order_id = $1)
           AND user_id = $4`,
        [lsOrderId, receiptUrl, checkoutId, userId]
      );

      // Mark performance fees as paid
      if (feeIds.length > 0) {
        await client.query(
          `UPDATE performance_fees
           SET status = 'paid',
               paid_at = NOW(),
               ls_order_id = $1,
               updated_at = NOW()
           WHERE id = ANY($2) AND user_id = $3`,
          [lsOrderId, feeIds, userId]
        );
      }

      // Activate billing status
      await client.query(
        `UPDATE user_stripe_billing
         SET billing_status = 'active',
             failed_charge_attempts = 0
         WHERE user_id = $1`,
        [userId]
      );
    });

    // Resume any suspended bots
    const suspendedBots = await query(
      `SELECT id FROM bot_instances WHERE user_id = $1 AND status = 'paused'`,
      [userId]
    );

    if (suspendedBots.length > 0) {
      const { resumeBot } = await import('./bot-suspension');
      for (const bot of suspendedBots) {
        try {
          await resumeBot(userId, bot.id);
          logger.info('Bot resumed after LS payment', { userId, botId: bot.id });
        } catch (resumeErr) {
          logger.error('Failed to resume bot after LS payment', resumeErr instanceof Error ? resumeErr : null, {
            botId: bot.id,
          });
        }
      }
    }

    logger.info('Lemon Squeezy order paid', { userId, lsOrderId, feeCount: feeIds.length });
  } catch (error) {
    logger.error('Failed to handle LS order_created', error instanceof Error ? error : null, { lsOrderId, userId });
    throw error;
  }
}

/**
 * Handle order refunded — revert fees to pending so they can be re-billed
 */
async function handleOrderRefunded(data: unknown): Promise<void> {
  const payload = data as Record<string, unknown>;
  const lsOrderId = String((payload?.data as Record<string, unknown>)?.id ?? '');

  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE ls_orders SET status = 'refunded', updated_at = NOW() WHERE ls_order_id = $1`,
        [lsOrderId]
      );

      // Revert fees to pending so they can be re-billed
      await client.query(
        `UPDATE performance_fees
         SET status = 'pending_billing',
             ls_order_id = NULL,
             updated_at = NOW()
         WHERE ls_order_id = $1`,
        [lsOrderId]
      );
    });

    logger.info('Lemon Squeezy order refunded', { lsOrderId });
  } catch (error) {
    logger.error('Failed to handle LS order_refunded', error instanceof Error ? error : null, { lsOrderId });
    throw error;
  }
}

/**
 * Get pending LS orders for a user
 */
export async function getUserPendingLsOrders(userId: string): Promise<Array<{
  id: number;
  ls_checkout_id: string | null;
  amount_cents: number;
  status: string;
  checkout_url: string | null;
  created_at: Date;
}>> {
  const result = await query(
    `SELECT id, ls_checkout_id, amount_cents, status, checkout_url, created_at
     FROM ls_orders
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [userId]
  );
  return result;
}
