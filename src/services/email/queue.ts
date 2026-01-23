/**
 * Email Queue Service
 * Manages email delivery using the job queue system
 * Uses the provider abstraction to support multiple email providers (Mailgun, Resend)
 */

import { getPool } from '@/lib/db';
import { sendEmail, getActiveProvider } from './provider';
import { renderEmailTemplate } from '@/email/render';
import { EmailTemplateType, EmailContext, EmailJob } from '@/types/email';

const MAX_RETRIES = 3;

function parseEmailContext(raw: unknown): EmailContext {
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }

  if (raw && typeof raw === 'object') {
    return raw as EmailContext;
  }

  throw new Error('Invalid email context payload');
}

/**
 * Queue email for sending
 */
export async function queueEmail(
  type: EmailTemplateType,
  to: string,
  context: EmailContext
): Promise<string> {
  try {
    // Insert into queue with database-generated UUID
    const result = await getPool().query(
      `INSERT INTO email_queue (type, to_email, context, status, retries, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', 0, NOW(), NOW())
       RETURNING id`,
      [type, to, JSON.stringify(context)]
    );

    const emailId: string = result.rows[0].id;

    console.log(`📨 Queued email ${emailId}:`, { type, to });

    // Kick off background processing via job queue (best effort)
    try {
      const { jobQueueManager } = await import('@/services/job-queue/singleton');
      const jobId = await jobQueueManager.enqueue('send_email', { emailId }, { priority: 7, maxRetries: 3 });
      console.log(`✅ Email job enqueued: ${jobId} for email ${emailId}`);
    } catch (jobError) {
      console.warn('⚠️  Could not enqueue email processing job:', jobError instanceof Error ? jobError.message : jobError);
      console.warn('Email will be processed on next manual job queue poll');
    }

    return emailId;
  } catch (error) {
    console.error('❌ Failed to queue email:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Process pending emails from queue
 */
export async function processPendingEmails(): Promise<number> {
  const client = await getPool().connect();
  let processedCount = 0;
  const provider = getActiveProvider();

  try {
    // Get pending emails
    const result = await client.query(
      `SELECT id, type, to_email, context, retries FROM email_queue
       WHERE status = 'pending' AND retries < $1
       ORDER BY created_at ASC
       LIMIT 100`,
      [MAX_RETRIES]
    );

    if (result.rows.length > 0) {
      console.log(`Processing ${result.rows.length} pending emails using ${provider} provider`);
    }

    for (const row of result.rows) {
      const emailId = row.id;
      const emailType = row.type as EmailTemplateType;
      const toEmail = row.to_email;
      const context = parseEmailContext(row.context);

      try {
        console.log(`📧 Processing email ${emailId}:`, { type: emailType, to: toEmail });

        // Render template
        const template = renderEmailTemplate(emailType, context);

        // Send email
        const result = await sendEmail({
          to: toEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });

        console.log(`✅ Email sent via ${provider}: ${emailId}`, { messageId: result.id });

        // Mark as sent
        await client.query(
          `UPDATE email_queue
           SET status = $1, sent_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          ['sent', emailId]
        );

        processedCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to send email ${emailId}:`, errorMsg);

        // Increment retry count
        const newRetries = row.retries + 1;

        if (newRetries >= MAX_RETRIES) {
          // Mark as failed
          await client.query(
            `UPDATE email_queue
             SET status = $1, error = $2, updated_at = NOW()
             WHERE id = $3`,
            [
              'failed',
              errorMsg,
              emailId,
            ]
          );
          console.error(`   ⚠️  Email failed permanently after ${newRetries} attempts: ${errorMsg}`);
        } else {
          // Reset to pending for retry
          await client.query(
            `UPDATE email_queue
             SET retries = $1, updated_at = NOW()
             WHERE id = $2`,
            [newRetries, emailId]
          );
          console.error(`   ⏳ Retrying (attempt ${newRetries}/${MAX_RETRIES})`);
        }
      }
    }

    return processedCount;
  } finally {
    client.release();
  }
}

/**
 * Get email status
 */
export async function getEmailStatus(emailId: string): Promise<EmailJob | null> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT id, type, to_email, context, status, retries, created_at, sent_at, error
       FROM email_queue
       WHERE id = $1`,
      [emailId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      to: row.to_email,
      context: parseEmailContext(row.context),
      status: row.status,
      retries: row.retries,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      error: row.error,
    };
  } finally {
    client.release();
  }
}

/**
 * Get user's email history
 */
export async function getUserEmailHistory(
  to: string,
  limit = 50
): Promise<EmailJob[]> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `SELECT id, type, to_email, context, status, retries, created_at, sent_at, error
       FROM email_queue
       WHERE to_email = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [to, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      to: row.to_email,
      context: parseEmailContext(row.context),
      status: row.status,
      retries: row.retries,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      error: row.error,
    }));
  } finally {
    client.release();
  }
}

/**
 * Retry failed email
 */
export async function retryFailedEmail(emailId: string): Promise<boolean> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `UPDATE email_queue
       SET status = $1, retries = 0, error = NULL, updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING id`,
      ['pending', emailId, 'failed']
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Delete email from queue
 */
export async function deleteEmail(emailId: string): Promise<boolean> {
  const client = await getPool().connect();

  try {
    const result = await client.query(
      'DELETE FROM email_queue WHERE id = $1 RETURNING id',
      [emailId]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}
