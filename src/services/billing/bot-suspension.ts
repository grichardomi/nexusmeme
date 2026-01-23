/**
 * Bot Suspension Service
 * Handles bot pausing when payment failures reach limit
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { jobQueueManager } from '@/services/job-queue/singleton';
import { sendBotSuspendedEmail, sendBotResumedEmail } from '@/services/email/triggers';

/**
 * Schedule bot suspension after 24 hours if payment not recovered
 * Called when 3rd payment attempt fails
 */
/**
 * Schedule bot suspension with non-blocking queue pattern
 * Stores scheduledFor timestamp and requeues if not yet due
 * Prevents worker threads from blocking for 24 hours
 */
export async function scheduleBotSuspension(
  userId: string,
  delaySeconds: number = 86400 // 24 hours default
): Promise<void> {
  try {
    logger.info('Scheduling bot suspension', {
      userId,
      delaySeconds,
    });

    // Get all active bots for this user
    const bots = await query(
      `SELECT id, status FROM bot_instances
       WHERE user_id = $1 AND status IN ('running', 'active')`,
      [userId]
    );

    if (!bots || bots.length === 0) {
      logger.info('No active bots found to suspend', { userId });
      return;
    }

    // Calculate when suspension should execute
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + delaySeconds * 1000);

    // Queue suspension job for each bot with scheduled time
    for (const bot of bots) {
      try {
        await jobQueueManager.enqueue(
          'suspend_bot',
          {
            userId,
            botInstanceId: bot.id,
            scheduledFor: scheduledFor.toISOString(),
            delaySeconds,
          },
          {
            priority: 3, // Lower priority allows other jobs to process
            maxRetries: 10, // Retry frequently until scheduled time passes
          }
        );

        logger.info('Bot suspension scheduled (non-blocking)', {
          userId,
          botInstanceId: bot.id,
          scheduledFor: scheduledFor.toISOString(),
          delaySeconds,
        });
      } catch (error) {
        logger.error('Failed to queue bot suspension', error instanceof Error ? error : null, {
          userId,
          botInstanceId: bot.id,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to schedule bot suspension', error instanceof Error ? error : null, {
      userId,
    });
    throw error;
  }
}

/**
 * Immediately suspend a bot (stop it)
 * Called by job queue processor
 */
export async function suspendBot(userId: string, botInstanceId: string): Promise<void> {
  try {
    logger.info('Suspending bot due to payment failure', {
      userId,
      botInstanceId,
    });

    await transaction(async (client) => {
      // Update bot status to paused
      const result = await client.query(
        `UPDATE bot_instances
         SET status = 'paused',
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [botInstanceId, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error(`Bot not found or does not belong to user: ${botInstanceId}`);
      }

      // Log suspension event
      await client.query(
        `INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, suspended_at)
         VALUES ($1, $2, $3, NOW())`,
        [botInstanceId, userId, 'payment_failure']
      );
    });

    logger.info('Bot suspended successfully', {
      userId,
      botInstanceId,
    });

    // Send notification email to user
    try {
      // Get user email and name
      const userResult = await query(
        `SELECT email, name FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult[0]) {
        const { email, name } = userResult[0];
        await sendBotSuspendedEmail(
          email,
          name || 'Trader',
          botInstanceId,
          'Payment for performance fees failed 3 times',
          'Please update your payment method to restore trading',
          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
        );
      }
    } catch (emailError) {
      logger.error('Failed to send bot suspension email', emailError instanceof Error ? emailError : null, {
        userId,
        botInstanceId,
      });
      // Don't throw - bot is already suspended
    }
  } catch (error) {
    logger.error('Failed to suspend bot', error instanceof Error ? error : null, {
      userId,
      botInstanceId,
    });
    throw error;
  }
}

/**
 * Resume a bot after payment is recovered
 */
export async function resumeBot(userId: string, botInstanceId: string): Promise<void> {
  try {
    logger.info('Resuming bot after payment recovery', {
      userId,
      botInstanceId,
    });

    await transaction(async (client) => {
      // Update bot status back to running
      await client.query(
        `UPDATE bot_instances
         SET status = 'running',
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [botInstanceId, userId]
      );

      // Log resumption event
      await client.query(
        `INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, resumed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET resumed_at = NOW()`,
        [botInstanceId, userId, 'payment_recovered']
      );
    });

    logger.info('Bot resumed successfully', {
      userId,
      botInstanceId,
    });

    // Send notification email
    try {
      // Get user email and name
      const userResult = await query(
        `SELECT email, name FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult[0]) {
        const { email, name } = userResult[0];
        await sendBotResumedEmail(
          email,
          name || 'Trader',
          botInstanceId,
          'Your trading bot has been resumed after payment was successfully processed'
        );
      }
    } catch (emailError) {
      logger.error('Failed to send bot resumed email', emailError instanceof Error ? emailError : null);
    }
  } catch (error) {
    logger.error('Failed to resume bot', error instanceof Error ? error : null, {
      userId,
      botInstanceId,
    });
    throw error;
  }
}
