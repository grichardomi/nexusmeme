import { getPool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { renderEmailTemplate } from '@/email/render';
import { sendEmail } from '@/services/email/resend';
import { TRIAL_CONFIG } from '@/config/pricing';

/**
 * Trial Notification Service
 * Handles sending trial expiration notifications for live trading trial users
 *
 * After trial expires:
 * - Users transition to performance_fees plan where they pay 5% on profits
 * - Users must add a payment method to continue trading after trial ends
 */

const TRIAL_NOTIFICATION_WINDOWS = {
  DAYS_3_BEFORE: 3,
  DAYS_1_BEFORE: 1,
};

/**
 * Get live trading trials expiring in the next N days
 */
async function getExpiringTrials(daysUntilExpiry: number) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        s.id,
        s.user_id,
        s.plan_tier,
        s.trial_ends_at,
        s.trial_capital_used,
        u.email,
        u.name,
        pm.id as payment_method_id
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN payment_methods pm ON pm.user_id = u.id AND pm.is_default = true
       WHERE
         s.plan_tier = 'live_trial'
         AND s.trial_ends_at IS NOT NULL
         AND s.trial_ends_at <= NOW() + INTERVAL '${daysUntilExpiry} days'
         AND (s.trial_notification_sent_at IS NULL
              OR s.trial_notification_sent_at < NOW() - INTERVAL '24 hours')
       ORDER BY s.trial_ends_at ASC`,
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Mark trial notification as sent
 */
async function markNotificationSent(subscriptionId: string) {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE subscriptions
       SET trial_notification_sent_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    );
  } finally {
    client.release();
  }
}

/**
 * Send trial expiration notification email
 * Sends different emails based on how many days until trial expires:
 * - 2-3 days: 3-day warning email
 * - 0-1 days: 1-day urgent warning email (different if no payment method)
 */
async function sendTrialNotificationEmail(
  userId: string,
  email: string,
  name: string,
  trialEndsAt: Date,
  daysUntilExpiry: number,
  hasPaymentMethod: boolean,
) {
  try {
    const trialEndsDate = trialEndsAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let templateType: 'trial_ending_performance_fees' | 'trial_ending_soon_performance_fees' | 'trial_ending_soon_add_payment' = 'trial_ending_performance_fees';
    let templateData: Record<string, any> = {
      name,
      trialEndsDate,
      daysRemaining: Math.max(0, daysUntilExpiry),
      performanceFeePercent: TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT,
      addPaymentPath: `https://nexusmeme.com/dashboard/billing/payment-methods?returnTo=trading`,
    };

    // Determine which email template to send based on days remaining
    if (daysUntilExpiry <= TRIAL_NOTIFICATION_WINDOWS.DAYS_1_BEFORE) {
      // Final warning - trial ending in 1 day or less (0-1 days)
      templateType = 'trial_ending_soon_performance_fees';
      if (!hasPaymentMethod) {
        // Need payment method to continue after trial
        templateType = 'trial_ending_soon_add_payment';
        templateData.setupPaymentPath = `https://nexusmeme.com/dashboard/billing/payment-methods?setup=true`;
      }
    }
    // else: daysUntilExpiry is 2-3 days, use default 'trial_ending_performance_fees' (3-day warning)

    const emailTemplate = renderEmailTemplate(templateType, templateData);

    await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    logger.info('Trial expiration notification sent', {
      userId,
      email,
      daysRemaining: daysUntilExpiry,
      hasPaymentMethod,
      template: templateType,
    });
  } catch (error) {
    logger.error('Failed to send trial notification email', error instanceof Error ? error : null, {
      userId,
      email,
    });
    throw error;
  }
}

/**
 * Transition user from live_trial to performance_fees plan
 *
 * Rules:
 * - Trial expired → performance_fees (regardless of payment method)
 * - Users can trade on performance_fees
 * - Fees will be charged when billing runs IF they have payment method
 * - Users without payment method will be prompted to add one
 */
async function transitionExpiredTrial(subscriptionId: string, userId: string, hasPaymentMethod: boolean) {
  const client = await getPool().connect();
  try {
    const newPlan = 'performance_fees';

    // Update subscription to new plan
    await client.query(
      `UPDATE subscriptions
       SET
         plan = $1,
         trial_ends_at = NULL,
         trial_capital_used = 0,
         trial_notification_sent_at = NULL,
         status = CASE WHEN $1 = 'performance_fees' THEN 'active' ELSE 'active' END
       WHERE id = $2`,
      [newPlan, subscriptionId],
    );

    logger.info('Trial transition completed', {
      userId,
      subscriptionId,
      newPlan,
      hasPaymentMethod,
    });
  } finally {
    client.release();
  }
}

/**
 * Process all expiring trials and send notifications
 * This should be called by a cron job (every 6-12 hours)
 *
 * Handles three cases:
 * 1. Trials expiring in 2-3 days: Send 3-day warning email
 * 2. Trials expiring in 0-1 days: Send 1-day urgent email
 * 3. Trials that have expired: Transition to performance_fees plan
 */
export async function processTrialNotifications() {
  try {
    logger.info('Starting trial notification processing');

    // Get all trials expiring within the next 3 days or that have already expired
    // Includes expired trials (daysUntilExpiry <= 0) for transition processing
    const allTrials = await getExpiringTrials(TRIAL_NOTIFICATION_WINDOWS.DAYS_3_BEFORE);

    if (allTrials.length === 0) {
      logger.info('No expiring trials found');
      return { processed: 0, sent: 0, transitioned: 0, failed: 0 };
    }

    logger.info('Found expiring trials', { count: allTrials.length });

    let sent = 0;
    let transitioned = 0;
    let failed = 0;

    for (const trial of allTrials) {
      try {
        const hasPaymentMethod = !!trial.payment_method_id;
        const daysUntilExpiry = Math.ceil(
          (new Date(trial.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        // Case 1: Trial has expired (0 days or less)
        if (daysUntilExpiry <= 0) {
          logger.info('Trial expired, transitioning to performance_fees plan', {
            trialId: trial.id,
            userId: trial.user_id,
          });

          await transitionExpiredTrial(trial.id, trial.user_id, hasPaymentMethod);
          await markNotificationSent(trial.id);
          transitioned++;
        }
        // Case 2: Trial expires in 0-1 days (send urgent 1-day notice)
        else if (daysUntilExpiry <= TRIAL_NOTIFICATION_WINDOWS.DAYS_1_BEFORE) {
          logger.info('Sending 1-day urgent notice', {
            trialId: trial.id,
            userId: trial.user_id,
            daysRemaining: daysUntilExpiry,
          });

          await sendTrialNotificationEmail(
            trial.user_id,
            trial.email,
            trial.name,
            new Date(trial.trial_ends_at),
            daysUntilExpiry,
            hasPaymentMethod,
          );

          await markNotificationSent(trial.id);
          sent++;
        }
        // Case 3: Trial expires in 2-3 days (send 3-day warning notice)
        else if (daysUntilExpiry <= TRIAL_NOTIFICATION_WINDOWS.DAYS_3_BEFORE) {
          logger.info('Sending 3-day warning notice', {
            trialId: trial.id,
            userId: trial.user_id,
            daysRemaining: daysUntilExpiry,
          });

          await sendTrialNotificationEmail(
            trial.user_id,
            trial.email,
            trial.name,
            new Date(trial.trial_ends_at),
            daysUntilExpiry,
            hasPaymentMethod,
          );

          await markNotificationSent(trial.id);
          sent++;
        }
      } catch (error) {
        logger.error('Failed to process trial notification', error instanceof Error ? error : null, {
          trialId: trial.id,
          userId: trial.user_id,
        });
        failed++;
      }
    }

    logger.info('Trial notification processing complete', {
      processed: allTrials.length,
      sent,
      transitioned,
      failed,
    });

    return { processed: allTrials.length, sent, transitioned, failed };
  } catch (error) {
    logger.error('Trial notification processing failed', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Get trial info for a user's subscription
 */
export async function getTrialInfo(userId: string) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
        id,
        plan_tier,
        status,
        trial_ends_at,
        trial_capital_used,
        current_period_end
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const sub = result.rows[0];

    // Return null if not in trial
    if (sub.plan_tier !== 'live_trial' || !sub.trial_ends_at) {
      return null;
    }

    const now = new Date();
    const trialEndsAt = new Date(sub.trial_ends_at);
    const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isTrialActive = daysRemaining > 0 && (sub.trial_capital_used ?? 0) < TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD;

    return {
      isTrialActive,
      plan: sub.plan_tier,
      trialEndsAt,
      daysRemaining: Math.max(0, daysRemaining),
      capitalUsed: sub.trial_capital_used ?? 0,
      capitalLimit: TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD,
      capitalRemaining: Math.max(0, TRIAL_CONFIG.LIVE_TRADING_CAPITAL_LIMIT_USD - (sub.trial_capital_used ?? 0)),
    };
  } finally {
    client.release();
  }
}

/**
 * Check if user's trial has expired and needs transition
 */
export async function checkTrialExpiration(userId: string) {
  const trialInfo = await getTrialInfo(userId);

  if (!trialInfo) {
    return {
      hasExpiredTrial: false,
      needsTransition: false,
    };
  }

  const hasExpiredTrial = trialInfo.daysRemaining <= 0;

  return {
    hasExpiredTrial,
    needsTransition: hasExpiredTrial,
    trialInfo,
  };
}
