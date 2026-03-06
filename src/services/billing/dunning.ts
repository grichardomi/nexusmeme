/**
 * Dunning Service
 * Handles overdue USDC invoice follow-up, reminders, and bot suspension.
 *
 * Timeline (days after invoice created):
 *   Day 0  → Invoice created, initial email sent by billing job
 *   Day 7  → First dunning reminder (BILLING_GRACE_PERIOD_DAYS)
 *   Day 14 → Final warning + suspend bots (BILLING_SUSPENSION_DAYS)
 *   Payment → Immediately resume bots (handled by USDC webhook)
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import {
  sendPerformanceFeeDunningEmail,
  sendBotSuspendedEmail,
} from '@/services/email/triggers';
import { expireOverdueInvoices } from './usdc-payment';

interface OverdueInvoice {
  id: string;
  user_id: string;
  email: string;
  name: string;
  payment_reference: string;
  amount_usd: number;
  wallet_address: string;
  created_at: string;
  expires_at: string;
  days_overdue: number;
}

/**
 * Run dunning check — called daily by cron at 9 AM UTC.
 * Sends reminders and suspends bots based on how overdue invoices are.
 */
export async function runDunningCheck(): Promise<{
  reminders: number;
  suspensions: number;
  expired: number;
  errors: string[];
}> {
  const env = getEnvironmentConfig();
  const errors: string[] = [];
  let reminders = 0;
  let suspensions = 0;

  logger.info('Starting dunning check');

  // Expire stale invoices first
  const expired = await expireOverdueInvoices();

  // Get all pending invoices past grace period
  const overdueInvoices = await query<OverdueInvoice>(
    `SELECT
       r.id,
       r.user_id,
       u.email,
       u.name,
       r.payment_reference,
       r.amount_usd,
       r.wallet_address,
       r.created_at,
       r.expires_at,
       EXTRACT(DAY FROM NOW() - r.created_at)::INT AS days_overdue
     FROM usdc_payment_references r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
       AND r.expires_at > NOW()
       AND EXTRACT(DAY FROM NOW() - r.created_at) >= $1
     ORDER BY r.created_at ASC`,
    [env.BILLING_GRACE_PERIOD_DAYS]
  );

  for (const invoice of overdueInvoices) {
    try {
      if (invoice.days_overdue >= env.BILLING_SUSPENSION_DAYS) {
        await handleSuspension(invoice, env.NEXT_PUBLIC_APP_URL);
        suspensions++;
      } else {
        await sendDunningReminder(invoice, env.NEXT_PUBLIC_APP_URL);
        reminders++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Dunning action failed', err instanceof Error ? err : null, {
        invoiceId: invoice.id,
        userId: invoice.user_id,
      });
      errors.push(`Invoice ${invoice.payment_reference}: ${msg}`);
    }
  }

  logger.info('Dunning check complete', { reminders, suspensions, expired, errors: errors.length });
  return { reminders, suspensions, expired, errors };
}

/**
 * Send dunning reminder email with payment instructions
 */
async function sendDunningReminder(invoice: OverdueInvoice, appUrl: string): Promise<void> {
  const attempt = invoice.days_overdue >= 10 ? 2 : 1;
  const billingUrl = `${appUrl}/dashboard/billing`;

  const deadlineDate = new Date(invoice.expires_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendPerformanceFeeDunningEmail(
    invoice.email,
    invoice.name || 'Trader',
    parseFloat(String(invoice.amount_usd)),
    attempt,
    deadlineDate
  );

  logger.info('Dunning reminder sent', {
    userId: invoice.user_id,
    reference: invoice.payment_reference,
    daysOverdue: invoice.days_overdue,
    attempt,
    billingUrl,
  });
}

/**
 * Suspend all running bots and send suspension email
 */
async function handleSuspension(invoice: OverdueInvoice, appUrl: string): Promise<void> {
  const billingUrl = `${appUrl}/dashboard/billing`;

  // Suspend all running bots for this user atomically
  const suspended = await transaction(async (client) => {
    const bots = await client.query(
      `UPDATE bot_instances
       SET status = 'paused', updated_at = NOW()
       WHERE user_id = $1 AND status IN ('running', 'active')
       RETURNING id`,
      [invoice.user_id]
    );

    if (bots.rows.length > 0) {
      // Log each suspension
      for (const bot of bots.rows) {
        await client.query(
          `INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, suspended_at)
           VALUES ($1, $2, 'payment_overdue', NOW())
           ON CONFLICT DO NOTHING`,
          [bot.id, invoice.user_id]
        );
      }
    }

    return bots.rows;
  });

  if (suspended.length > 0) {
    logger.info('Bots suspended due to overdue payment', {
      userId: invoice.user_id,
      reference: invoice.payment_reference,
      botsCount: suspended.length,
    });

    await sendBotSuspendedEmail(
      invoice.email,
      invoice.name || 'Trader',
      `${suspended.length} bot(s)`,
      `Performance fee invoice ${invoice.payment_reference} is overdue ($${Number(invoice.amount_usd).toFixed(2)} USDC)`,
      'Pay your invoice to instantly resume trading',
      billingUrl
    );
  } else {
    logger.info('No running bots to suspend', { userId: invoice.user_id });
  }
}
