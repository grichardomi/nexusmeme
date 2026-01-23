/**
 * Stripe Webhook Handler
 * Processes events from Stripe:
 * - invoice.paid: Payment successful
 * - invoice.payment_failed: Payment failed
 * - charge.refunded: Refund processed
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { scheduleBotSuspension, resumeBot } from './bot-suspension';
import {
  sendPerformanceFeeChargedEmail,
  sendPerformanceFeeDunningEmail,
  sendPerformanceFeeFailedEmail,
} from '@/services/email/triggers';
import Stripe from 'stripe';
import type { Stripe as StripeType } from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set - cannot initialize Stripe client');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Handle invoice.paid event (payment succeeded)
 */
export async function handleInvoicePaid(event: StripeType.Event): Promise<void> {
  const invoice = event.data.object as StripeType.Invoice;
  const stripeInvoiceId = invoice.id;

  logger.info('Processing invoice.paid event', {
    invoiceId: stripeInvoiceId,
    amount: invoice.total,
  });

  let userId: string | null = null;
  const botsToResume: string[] = [];

  try {
    await transaction(async (client) => {
      // Get user ID from performance_fees
      const feeResult = await client.query(
        `SELECT DISTINCT pf.user_id
         FROM performance_fees pf
         WHERE pf.stripe_invoice_id = $1
         LIMIT 1`,
        [stripeInvoiceId]
      );

      if (!feeResult.rows[0]) {
        logger.warn('No fees found for invoice', { invoiceId: stripeInvoiceId });
        return;
      }

      userId = feeResult.rows[0].user_id;

      // Update performance_fees to paid
      await client.query(
        `UPDATE performance_fees
         SET status = 'paid',
             paid_at = NOW(),
             updated_at = NOW()
         WHERE stripe_invoice_id = $1`,
        [stripeInvoiceId]
      );

      // Update charge history
      await client.query(
        `UPDATE fee_charge_history
         SET status = 'succeeded',
             paid_at = NOW()
         WHERE stripe_invoice_id = $1`,
        [stripeInvoiceId]
      );

      // Check if user had suspended bots and get them for resumption
      const suspendedBots = await client.query(
        `SELECT id FROM bot_instances
         WHERE user_id = $1 AND status = 'paused'`,
        [userId]
      );

      if (suspendedBots.rows && suspendedBots.rows.length > 0) {
        botsToResume.push(...suspendedBots.rows.map((row) => row.id));
      }

      // Update billing status to active
      await client.query(
        `UPDATE user_stripe_billing
         SET billing_status = 'active',
             failed_charge_attempts = 0,
             dunning_email_count = 0
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('Payment processed successfully', {
        userId,
        invoiceId: stripeInvoiceId,
        amount: invoice.total / 100, // Convert from cents
        botsToResume: botsToResume.length,
      });
    });

    // Resume any suspended bots AFTER transaction succeeds
    if (userId && botsToResume.length > 0) {
      for (const botId of botsToResume) {
        try {
          await resumeBot(userId, botId);
        } catch (resumeError) {
          logger.error(
            'Failed to resume bot after payment recovery',
            resumeError instanceof Error ? resumeError : null,
            {
              userId,
              botInstanceId: botId,
            }
          );
          // Continue resuming other bots
        }
      }
    }

    // Send receipt email
    await sendPaymentSuccessEmail(invoice);
  } catch (error) {
    logger.error('Failed to handle invoice.paid event', error instanceof Error ? error : null, {
      invoiceId: stripeInvoiceId,
    });
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event (payment declined)
 */
export async function handleInvoicePaymentFailed(event: StripeType.Event): Promise<void> {
  const invoice = event.data.object as StripeType.Invoice;
  const stripeInvoiceId = invoice.id;

  logger.info('Processing invoice.payment_failed event', {
    invoiceId: stripeInvoiceId,
    amount: invoice.total,
  });

  let userId: string | null = null;
  let retryCount = 0;
  let shouldSuspendBot = false;

  try {
    await transaction(async (client) => {
      // Get user ID
      const feeResult = await client.query(
        `SELECT DISTINCT pf.user_id
         FROM performance_fees pf
         WHERE pf.stripe_invoice_id = $1
         LIMIT 1`,
        [stripeInvoiceId]
      );

      if (!feeResult.rows[0]) {
        logger.warn('No fees found for failed invoice', { invoiceId: stripeInvoiceId });
        return;
      }

      userId = feeResult.rows[0].user_id;

      // Get current charge history
      const chargeResult = await client.query(
        `SELECT retry_count FROM fee_charge_history
         WHERE stripe_invoice_id = $1`,
        [stripeInvoiceId]
      );

      retryCount = (chargeResult.rows[0]?.retry_count || 0) + 1;
      const failureReason = extractFailureReason(invoice);

      // Update charge history
      await client.query(
        `UPDATE fee_charge_history
         SET status = 'failed',
             retry_count = $1,
             failure_reason = $2,
             last_failed_charge_date = NOW(),
             next_retry_at = $3
         WHERE stripe_invoice_id = $4`,
        [retryCount, failureReason, getNextRetryDate(retryCount), stripeInvoiceId]
      );

      // Update user billing status
      await client.query(
        `UPDATE user_stripe_billing
         SET billing_status = 'past_due',
             failed_charge_attempts = $1,
             last_failed_charge_date = NOW()
         WHERE user_id = $2`,
        [retryCount, userId]
      );

      logger.info('Payment failure recorded', {
        userId,
        invoiceId: stripeInvoiceId,
        retryCount,
        failureReason,
      });

      // Handle based on retry count (userId is guaranteed to be set from above check)
      if (userId && retryCount === 1) {
        // First failure: send dunning email
        await sendDunningEmail(userId, invoice, 1);
      } else if (userId && retryCount === 2) {
        // Second failure: send second dunning email
        await sendDunningEmail(userId, invoice, 2);
      } else if (userId && retryCount >= 3) {
        // Third+ failure: mark as suspended and notify
        await client.query(
          `UPDATE user_stripe_billing
           SET billing_status = 'suspended'
           WHERE user_id = $1`,
          [userId]
        );

        await sendPaymentExhaustedEmail(userId, invoice);
        shouldSuspendBot = true;

        logger.info('Payment failure limit reached, will schedule bot suspension', {
          userId,
          invoiceId: stripeInvoiceId,
          retryCount,
        });
      }
    });

    // Schedule bot suspension AFTER transaction succeeds
    // This must be outside transaction to safely queue job
    if (shouldSuspendBot && userId) {
      try {
        await scheduleBotSuspension(userId, 86400); // 24 hours
      } catch (suspensionError) {
        logger.error(
          'Failed to schedule bot suspension after payment failure',
          suspensionError instanceof Error ? suspensionError : null,
          {
            userId,
            invoiceId: stripeInvoiceId,
          }
        );
        // Don't throw - webhook already processed, suspension can be retried
      }
    }
  } catch (error) {
    logger.error('Failed to handle invoice.payment_failed event', error instanceof Error ? error : null, {
      invoiceId: stripeInvoiceId,
    });
    throw error;
  }
}

/**
 * Handle charge.refunded event
 */
export async function handleChargeRefunded(event: StripeType.Event): Promise<void> {
  const charge = event.data.object as StripeType.Charge;
  const chargeId = charge.id;

  logger.info('Processing charge.refunded event', {
    chargeId,
    refundAmount: charge.amount_refunded,
  });

  try {
    // Find invoice by charge ID
    const invoices = await stripe.invoices.list({
      limit: 1,
      created: {
        gte: Math.floor(Date.now() / 1000) - 86400 * 7, // Last 7 days
      },
    });

    for (const invoice of invoices.data) {
      if (invoice.charge === chargeId) {
        // Update performance_fees to refunded
        await query(
          `UPDATE performance_fees
           SET status = 'refunded',
               updated_at = NOW()
           WHERE stripe_invoice_id = $1`,
          [invoice.id]
        );

        // Update charge history
        await query(
          `UPDATE fee_charge_history
           SET status = 'refunded',
               refunded_at = NOW(),
               refund_amount = $1
           WHERE stripe_invoice_id = $2`,
          [charge.amount_refunded / 100, invoice.id] // Convert from cents
        );

        logger.info('Refund processed', {
          invoiceId: invoice.id,
          refundAmount: charge.amount_refunded / 100,
        });

        break;
      }
    }
  } catch (error) {
    logger.error('Failed to handle charge.refunded event', error instanceof Error ? error : null, {
      chargeId,
    });
    throw error;
  }
}

/**
 * Send payment success email
 */
async function sendPaymentSuccessEmail(invoice: StripeType.Invoice): Promise<void> {
  try {
    // Get user from invoice
    const feeResult = await query(
      `SELECT DISTINCT pf.user_id, u.email, u.name
       FROM performance_fees pf
       JOIN users u ON pf.user_id = u.id
       WHERE pf.stripe_invoice_id = $1
       LIMIT 1`,
      [invoice.id]
    );

    if (!feeResult[0]) {
      logger.warn('No user found for payment success email', { invoiceId: invoice.id });
      return;
    }

    const { email, name } = feeResult[0];

    await sendPerformanceFeeChargedEmail(
      email,
      name || 'Trader',
      invoice.total ? invoice.total / 100 : 0,
      invoice.id,
      invoice.hosted_invoice_url || undefined
    );
  } catch (error) {
    logger.error('Failed to send payment success email', error instanceof Error ? error : null);
  }
}

/**
 * Send dunning email (payment failed - retry coming)
 */
async function sendDunningEmail(
  userId: string,
  invoice: StripeType.Invoice,
  attemptNumber: number
): Promise<void> {
  try {
    // Get user email and name
    const userResult = await query(
      `SELECT email, name FROM users WHERE id = $1`,
      [userId]
    );

    if (!userResult[0]) {
      logger.warn('User not found for dunning email', { userId });
      return;
    }

    const { email, name } = userResult[0];
    const deadline = new Date();

    if (attemptNumber === 1) {
      deadline.setDate(deadline.getDate() + 3);
    } else if (attemptNumber === 2) {
      deadline.setDate(deadline.getDate() + 2);
    }

    await sendPerformanceFeeDunningEmail(
      email,
      name || 'Trader',
      invoice.total ? invoice.total / 100 : 0,
      attemptNumber,
      deadline.toISOString()
    );

    // Update dunning email count
    await query(
      `UPDATE user_stripe_billing
       SET dunning_email_count = dunning_email_count + 1,
           last_dunning_email_sent_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  } catch (error) {
    logger.error('Failed to send dunning email', error instanceof Error ? error : null, {
      userId,
    });
  }
}

/**
 * Send payment exhausted email (all retries failed)
 */
async function sendPaymentExhaustedEmail(
  userId: string,
  invoice: StripeType.Invoice
): Promise<void> {
  try {
    // Get user email and name
    const userResult = await query(
      `SELECT email, name FROM users WHERE id = $1`,
      [userId]
    );

    if (!userResult[0]) {
      logger.warn('User not found for payment exhausted email', { userId });
      return;
    }

    const { email, name } = userResult[0];

    await sendPerformanceFeeFailedEmail(
      email,
      name || 'Trader',
      invoice.total ? invoice.total / 100 : 0,
      3
    );
  } catch (error) {
    logger.error('Failed to send payment exhausted email', error instanceof Error ? error : null, {
      userId,
    });
  }
}

/**
 * Helper: Extract failure reason from invoice
 */
function extractFailureReason(invoice: StripeType.Invoice): string {
  // Stripe provides attempt info - extract the last failure reason
  if (invoice.last_finalization_error) {
    return invoice.last_finalization_error.message || 'payment_declined';
  }
  return 'payment_declined';
}

/**
 * Helper: Calculate next retry date
 */
function getNextRetryDate(retryCount: number): Date {
  const nextRetry = new Date();

  if (retryCount === 1) {
    nextRetry.setDate(nextRetry.getDate() + 2); // Retry in 2 days
  } else if (retryCount === 2) {
    nextRetry.setDate(nextRetry.getDate() + 1); // Retry in 1 day
  } else {
    nextRetry.setTime(0); // No more retries
  }

  return nextRetry;
}
