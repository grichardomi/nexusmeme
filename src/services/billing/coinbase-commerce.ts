/**
 * Coinbase Commerce Service
 * Handles crypto payments for performance fees
 *
 * API Docs: https://docs.cdp.coinbase.com/commerce/reference/createcharge
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import crypto from 'crypto';

const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com';

export interface CoinbaseChargeData {
  id: string;
  code: string;
  name: string;
  description: string;
  hosted_url: string;
  created_at: string;
  expires_at: string;
  pricing: {
    local: { amount: string; currency: string };
    settlement: { amount: string; currency: string };
  };
  payments: Array<{
    network: string;
    transaction_id: string;
    status: string;
    value: { amount: string; currency: string };
  }>;
  timeline: Array<{
    time: string;
    status: string;
  }>;
  metadata: Record<string, string>;
}

export interface CreateChargeParams {
  userId: string;
  amount: number; // USD amount
  description: string;
  feeIds: string[]; // Performance fee IDs being billed
  redirectUrl?: string;
  cancelUrl?: string;
}

/**
 * Check if Coinbase Commerce is enabled and configured
 */
export function isCoinbaseCommerceEnabled(): boolean {
  const env = getEnvironmentConfig();
  return env.COINBASE_COMMERCE_ENABLED && !!env.COINBASE_COMMERCE_API_KEY;
}

/**
 * Create a Coinbase Commerce charge for performance fees
 */
export async function createPerformanceFeeCharge(params: CreateChargeParams): Promise<CoinbaseChargeData> {
  const env = getEnvironmentConfig();

  if (!env.COINBASE_COMMERCE_API_KEY) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  const { userId, amount, description, feeIds, redirectUrl, cancelUrl } = params;

  // Get user email for metadata
  const userResult = await query(
    'SELECT email, name FROM users WHERE id = $1',
    [userId]
  );

  if (!userResult[0]) {
    throw new Error('User not found');
  }

  const { email, name } = userResult[0];
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  const chargeData = {
    name: 'NexusMeme Performance Fee',
    description,
    pricing_type: 'fixed_price',
    local_price: {
      amount: amount.toFixed(2),
      currency: 'USD',
    },
    metadata: {
      user_id: userId,
      user_email: email,
      user_name: name || '',
      fee_ids: feeIds.join(','),
      invoice_type: 'performance_fee',
    },
    redirect_url: redirectUrl || `${appUrl}/dashboard/billing?payment=success`,
    cancel_url: cancelUrl || `${appUrl}/dashboard/billing?payment=cancelled`,
  };

  try {
    const response = await fetch(`${COINBASE_COMMERCE_API_URL}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': env.COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify(chargeData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Coinbase Commerce API error', null, {
        status: response.status,
        error: errorData,
      });
      throw new Error(`Coinbase Commerce API error: ${response.status}`);
    }

    const result = await response.json();
    const charge: CoinbaseChargeData = result.data;

    // Store charge in database
    await query(
      `INSERT INTO coinbase_charges
       (charge_id, charge_code, user_id, amount_usd, fee_ids, status, hosted_url, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())`,
      [
        charge.id,
        charge.code,
        userId,
        amount,
        feeIds,
        charge.hosted_url,
        new Date(charge.expires_at),
      ]
    );

    // Update performance fees with charge reference
    await query(
      `UPDATE performance_fees
       SET coinbase_charge_id = $1,
           status = 'billed',
           billed_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($2)`,
      [charge.id, feeIds]
    );

    logger.info('Coinbase Commerce charge created', {
      chargeId: charge.id,
      chargeCode: charge.code,
      userId,
      amount,
      feeCount: feeIds.length,
      hostedUrl: charge.hosted_url,
    });

    return charge;
  } catch (error) {
    logger.error('Failed to create Coinbase Commerce charge', error instanceof Error ? error : null, {
      userId,
      amount,
    });
    throw error;
  }
}

/**
 * Get charge status from Coinbase Commerce
 */
export async function getChargeStatus(chargeId: string): Promise<CoinbaseChargeData> {
  const env = getEnvironmentConfig();

  if (!env.COINBASE_COMMERCE_API_KEY) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  const response = await fetch(`${COINBASE_COMMERCE_API_URL}/charges/${chargeId}`, {
    method: 'GET',
    headers: {
      'X-CC-Api-Key': env.COINBASE_COMMERCE_API_KEY,
      'X-CC-Version': '2018-03-22',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get charge status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Verify Coinbase Commerce webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const env = getEnvironmentConfig();

  if (!env.COINBASE_COMMERCE_WEBHOOK_SECRET) {
    logger.warn('Coinbase Commerce webhook secret not configured');
    return false;
  }

  const computedSignature = crypto
    .createHmac('sha256', env.COINBASE_COMMERCE_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}

/**
 * Handle Coinbase Commerce webhook event
 */
export async function handleWebhookEvent(event: {
  type: string;
  data: CoinbaseChargeData;
}): Promise<void> {
  const { type, data: charge } = event;

  logger.info('Processing Coinbase Commerce webhook', {
    eventType: type,
    chargeId: charge.id,
    chargeCode: charge.code,
  });

  switch (type) {
    case 'charge:confirmed':
    case 'charge:resolved':
      await handleChargeConfirmed(charge);
      break;

    case 'charge:failed':
      await handleChargeFailed(charge);
      break;

    case 'charge:delayed':
      await handleChargeDelayed(charge);
      break;

    case 'charge:pending':
      await handleChargePending(charge);
      break;

    case 'charge:expired':
      await handleChargeExpired(charge);
      break;

    default:
      logger.info('Unhandled Coinbase Commerce event type', { type });
  }
}

/**
 * Handle expired charge (payment not made before deadline)
 */
async function handleChargeExpired(charge: CoinbaseChargeData): Promise<void> {
  const chargeId = charge.id;

  try {
    await transaction(async (client) => {
      // Update charge status
      await client.query(
        `UPDATE coinbase_charges
         SET status = 'expired',
             failed_at = NOW()
         WHERE charge_id = $1`,
        [chargeId]
      );

      // Get user and fee info
      const chargeResult = await client.query(
        'SELECT user_id, fee_ids, amount_usd FROM coinbase_charges WHERE charge_id = $1',
        [chargeId]
      );

      if (!chargeResult.rows[0]) {
        logger.warn('Expired charge not found in database', { chargeId });
        return;
      }

      const { user_id: userId, fee_ids: feeIds, amount_usd: amount } = chargeResult.rows[0];

      // Revert fees to pending_billing so they can be rebilled
      await client.query(
        `UPDATE performance_fees
         SET status = 'pending_billing',
             coinbase_charge_id = NULL,
             updated_at = NOW()
         WHERE coinbase_charge_id = $1`,
        [chargeId]
      );

      // Increment failed charge attempts
      await client.query(
        `UPDATE user_stripe_billing
         SET failed_charge_attempts = COALESCE(failed_charge_attempts, 0) + 1,
             last_failed_charge_date = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      // Check if user has exceeded retry limit
      const billingResult = await client.query(
        'SELECT failed_charge_attempts FROM user_stripe_billing WHERE user_id = $1',
        [userId]
      );

      const failedAttempts = billingResult.rows[0]?.failed_charge_attempts || 0;

      logger.info('Coinbase Commerce charge expired', {
        chargeId,
        userId,
        feeCount: feeIds?.length || 0,
        amount,
        failedAttempts,
      });

      // Send reminder or suspension email based on attempt count
      if (failedAttempts >= 3) {
        // Schedule bot suspension
        const { scheduleBotSuspension } = await import('./bot-suspension');
        await scheduleBotSuspension(userId, 86400); // 24 hours grace period

        await client.query(
          `UPDATE user_stripe_billing
           SET billing_status = 'suspended'
           WHERE user_id = $1`,
          [userId]
        );
      }
    });

    // Send expiry notification email
    await sendChargeExpiredEmail(charge);
  } catch (error) {
    logger.error('Failed to handle charge expiry', error instanceof Error ? error : null, {
      chargeId,
    });
    throw error;
  }
}

/**
 * Send charge expired notification email
 */
async function sendChargeExpiredEmail(charge: CoinbaseChargeData): Promise<void> {
  try {
    const { sendPerformanceFeeDunningEmail } = await import('@/services/email/triggers');

    const userId = charge.metadata?.user_id;
    if (!userId) return;

    const userResult = await query(
      'SELECT email, name FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult[0]) return;

    const { email, name } = userResult[0];
    const amount = parseFloat(charge.pricing?.local?.amount || '0');

    // Get current attempt count
    const billingResult = await query(
      'SELECT failed_charge_attempts FROM user_stripe_billing WHERE user_id = $1',
      [userId]
    );
    const attemptNumber = billingResult[0]?.failed_charge_attempts || 1;

    // Calculate deadline (next charge attempt or suspension)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (attemptNumber >= 3 ? 1 : 3));

    await sendPerformanceFeeDunningEmail(
      email,
      name || 'Trader',
      amount,
      attemptNumber,
      deadline.toISOString()
    );
  } catch (error) {
    logger.error('Failed to send charge expired email', error instanceof Error ? error : null);
  }
}

/**
 * Handle confirmed/resolved charge (payment successful)
 */
async function handleChargeConfirmed(charge: CoinbaseChargeData): Promise<void> {
  const chargeId = charge.id;

  try {
    await transaction(async (client) => {
      // Update charge status
      await client.query(
        `UPDATE coinbase_charges
         SET status = 'confirmed',
             confirmed_at = NOW(),
             payment_network = $1,
             payment_transaction_id = $2
         WHERE charge_id = $3`,
        [
          charge.payments?.[0]?.network || null,
          charge.payments?.[0]?.transaction_id || null,
          chargeId,
        ]
      );

      // Get fee IDs from charge
      const chargeResult = await client.query(
        'SELECT user_id, fee_ids FROM coinbase_charges WHERE charge_id = $1',
        [chargeId]
      );

      if (!chargeResult.rows[0]) {
        logger.warn('Charge not found in database', { chargeId });
        return;
      }

      const { user_id: userId, fee_ids: feeIds } = chargeResult.rows[0];

      // Mark fees as paid
      await client.query(
        `UPDATE performance_fees
         SET status = 'paid',
             paid_at = NOW(),
             updated_at = NOW()
         WHERE coinbase_charge_id = $1`,
        [chargeId]
      );

      // Update user billing status to active
      await client.query(
        `UPDATE user_stripe_billing
         SET billing_status = 'active',
             failed_charge_attempts = 0
         WHERE user_id = $1`,
        [userId]
      );

      // Activate subscription if in payment_required status (expired trial)
      await client.query(
        `UPDATE subscriptions
         SET status = 'active',
             updated_at = NOW()
         WHERE user_id = $1 AND status = 'payment_required'`,
        [userId]
      );

      logger.info('Coinbase Commerce payment confirmed', {
        chargeId,
        userId,
        feeCount: feeIds?.length || 0,
        network: charge.payments?.[0]?.network,
        txId: charge.payments?.[0]?.transaction_id,
      });

      // Check for suspended bots and resume them
      const suspendedBots = await client.query(
        `SELECT id FROM bot_instances
         WHERE user_id = $1 AND status = 'paused'`,
        [userId]
      );

      // Store for resumption outside transaction
      return { userId, suspendedBotIds: suspendedBots.rows.map((r: { id: string }) => r.id) };
    });

    // Resume suspended bots AFTER transaction succeeds
    const result = await transaction(async (client) => {
      const chargeResult = await client.query(
        'SELECT user_id FROM coinbase_charges WHERE charge_id = $1',
        [chargeId]
      );
      if (!chargeResult.rows[0]) return null;

      const userId = chargeResult.rows[0].user_id;
      const suspendedBots = await client.query(
        `SELECT id FROM bot_instances WHERE user_id = $1 AND status = 'paused'`,
        [userId]
      );
      return { userId, suspendedBotIds: suspendedBots.rows.map((r: { id: string }) => r.id) };
    });

    if (result && result.suspendedBotIds.length > 0) {
      const { resumeBot } = await import('./bot-suspension');
      for (const botId of result.suspendedBotIds) {
        try {
          await resumeBot(result.userId, botId);
          logger.info('Bot resumed after crypto payment', {
            userId: result.userId,
            botId,
            chargeId,
          });
        } catch (resumeError) {
          logger.error('Failed to resume bot after payment', resumeError instanceof Error ? resumeError : null, {
            botId,
            chargeId,
          });
        }
      }
    }

    // Send confirmation email
    await sendPaymentConfirmationEmail(charge);
  } catch (error) {
    logger.error('Failed to handle charge confirmation', error instanceof Error ? error : null, {
      chargeId,
    });
    throw error;
  }
}

/**
 * Handle failed charge
 * Increments failure counter, sends dunning email, and suspends after 3 failures
 */
async function handleChargeFailed(charge: CoinbaseChargeData): Promise<void> {
  const chargeId = charge.id;

  try {
    await transaction(async (client) => {
      // Update charge status
      await client.query(
        `UPDATE coinbase_charges
         SET status = 'failed',
             failed_at = NOW()
         WHERE charge_id = $1`,
        [chargeId]
      );

      // Get user and fee info
      const chargeResult = await client.query(
        'SELECT user_id, fee_ids, amount_usd FROM coinbase_charges WHERE charge_id = $1',
        [chargeId]
      );

      if (!chargeResult.rows[0]) {
        logger.warn('Failed charge not found in database', { chargeId });
        return;
      }

      const { user_id: userId, fee_ids: feeIds, amount_usd: amount } = chargeResult.rows[0];

      // Revert fees to pending_billing so they can be rebilled
      await client.query(
        `UPDATE performance_fees
         SET status = 'pending_billing',
             coinbase_charge_id = NULL,
             updated_at = NOW()
         WHERE coinbase_charge_id = $1`,
        [chargeId]
      );

      // Increment failed charge attempts
      await client.query(
        `UPDATE user_stripe_billing
         SET failed_charge_attempts = COALESCE(failed_charge_attempts, 0) + 1,
             last_failed_charge_date = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      // Check if user has exceeded retry limit
      const billingResult = await client.query(
        'SELECT failed_charge_attempts FROM user_stripe_billing WHERE user_id = $1',
        [userId]
      );

      const failedAttempts = billingResult.rows[0]?.failed_charge_attempts || 0;

      logger.info('Coinbase Commerce charge failed', {
        chargeId,
        userId,
        feeCount: feeIds?.length || 0,
        amount,
        failedAttempts,
      });

      // Schedule bot suspension after 3 failures
      if (failedAttempts >= 3) {
        const { scheduleBotSuspension } = await import('./bot-suspension');
        await scheduleBotSuspension(userId, 86400); // 24 hours grace period

        await client.query(
          `UPDATE user_stripe_billing
           SET billing_status = 'suspended'
           WHERE user_id = $1`,
          [userId]
        );
      }
    });

    // Send failure notification email (same dunning flow as expired)
    await sendChargeFailedEmail(charge);
  } catch (error) {
    logger.error('Failed to handle charge failure', error instanceof Error ? error : null, {
      chargeId,
    });
    throw error;
  }
}

/**
 * Send charge failed notification email
 */
async function sendChargeFailedEmail(charge: CoinbaseChargeData): Promise<void> {
  try {
    const { sendPerformanceFeeDunningEmail } = await import('@/services/email/triggers');

    const userId = charge.metadata?.user_id;
    if (!userId) return;

    const userResult = await query(
      'SELECT email, name FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult[0]) return;

    const { email, name } = userResult[0];
    const amount = parseFloat(charge.pricing?.local?.amount || '0');

    // Get current attempt count
    const billingResult = await query(
      'SELECT failed_charge_attempts FROM user_stripe_billing WHERE user_id = $1',
      [userId]
    );
    const attemptNumber = billingResult[0]?.failed_charge_attempts || 1;

    // Calculate deadline (next charge attempt or suspension)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (attemptNumber >= 3 ? 1 : 3));

    await sendPerformanceFeeDunningEmail(
      email,
      name || 'Trader',
      amount,
      attemptNumber,
      deadline.toISOString()
    );
  } catch (error) {
    logger.error('Failed to send charge failed email', error instanceof Error ? error : null);
  }
}

/**
 * Handle delayed charge (underpaid or waiting for confirmations)
 */
async function handleChargeDelayed(charge: CoinbaseChargeData): Promise<void> {
  const chargeId = charge.id;

  try {
    await query(
      `UPDATE coinbase_charges
       SET status = 'delayed'
       WHERE charge_id = $1`,
      [chargeId]
    );

    logger.info('Coinbase Commerce charge delayed', { chargeId });
  } catch (error) {
    logger.error('Failed to handle charge delay', error instanceof Error ? error : null, {
      chargeId,
    });
  }
}

/**
 * Handle pending charge (payment detected, awaiting confirmations)
 */
async function handleChargePending(charge: CoinbaseChargeData): Promise<void> {
  const chargeId = charge.id;

  try {
    await query(
      `UPDATE coinbase_charges
       SET status = 'pending_confirmation',
           payment_network = $1,
           payment_transaction_id = $2
       WHERE charge_id = $3`,
      [
        charge.payments?.[0]?.network || null,
        charge.payments?.[0]?.transaction_id || null,
        chargeId,
      ]
    );

    logger.info('Coinbase Commerce charge pending confirmation', {
      chargeId,
      network: charge.payments?.[0]?.network,
    });
  } catch (error) {
    logger.error('Failed to handle charge pending', error instanceof Error ? error : null, {
      chargeId,
    });
  }
}

/**
 * Send payment confirmation email
 */
async function sendPaymentConfirmationEmail(charge: CoinbaseChargeData): Promise<void> {
  try {
    const { sendPerformanceFeeChargedEmail } = await import('@/services/email/triggers');

    const userId = charge.metadata?.user_id;
    if (!userId) return;

    const userResult = await query(
      'SELECT email, name FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult[0]) return;

    const { email, name } = userResult[0];
    const amount = parseFloat(charge.pricing?.local?.amount || '0');

    await sendPerformanceFeeChargedEmail(
      email,
      name || 'Trader',
      amount,
      charge.code,
      charge.hosted_url
    );
  } catch (error) {
    logger.error('Failed to send payment confirmation email', error instanceof Error ? error : null);
  }
}

/**
 * Get pending charges for a user
 */
export async function getUserPendingCharges(userId: string): Promise<Array<{
  charge_id: string;
  charge_code: string;
  amount_usd: number;
  status: string;
  hosted_url: string;
  expires_at: Date;
  created_at: Date;
}>> {
  const result = await query(
    `SELECT charge_id, charge_code, amount_usd, status, hosted_url, expires_at, created_at
     FROM coinbase_charges
     WHERE user_id = $1 AND status IN ('pending', 'pending_confirmation', 'delayed')
     ORDER BY created_at DESC`,
    [userId]
  );

  return result;
}

/**
 * Cancel an expired or unwanted charge
 */
export async function cancelCharge(chargeId: string): Promise<void> {
  const env = getEnvironmentConfig();

  if (!env.COINBASE_COMMERCE_API_KEY) {
    throw new Error('Coinbase Commerce API key not configured');
  }

  const response = await fetch(`${COINBASE_COMMERCE_API_URL}/charges/${chargeId}/cancel`, {
    method: 'POST',
    headers: {
      'X-CC-Api-Key': env.COINBASE_COMMERCE_API_KEY,
      'X-CC-Version': '2018-03-22',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel charge: ${response.status}`);
  }

  // Update local database
  await query(
    `UPDATE coinbase_charges
     SET status = 'cancelled'
     WHERE charge_id = $1`,
    [chargeId]
  );

  // Revert fees to pending
  await query(
    `UPDATE performance_fees
     SET status = 'pending_billing',
         coinbase_charge_id = NULL,
         updated_at = NOW()
     WHERE coinbase_charge_id = $1`,
    [chargeId]
  );

  logger.info('Coinbase Commerce charge cancelled', { chargeId });
}
