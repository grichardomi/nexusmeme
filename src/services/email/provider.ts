/**
 * Email Provider Abstraction Layer
 * Supports multiple email providers with fallback mechanism
 * Default provider: Mailgun
 * Fallback provider: Resend
 */

import { SendEmailOptions } from '@/types/email';
import * as mailgun from './mailgun';
import * as resend from './resend';

export type EmailProvider = 'mailgun' | 'resend';

/**
 * Determine which email provider to use
 * Priority logic:
 * 1. If Mailgun is configured (API key + domain present) → use Mailgun (PRIMARY)
 * 2. Else if Resend is configured (API key present) → use Resend (FALLBACK)
 * 3. Else default to Mailgun (PRIMARY - will use mock if no credentials)
 *
 * Mailgun is always the default choice when available
 */
function getPrimaryProvider(): EmailProvider {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // Mailgun is the primary provider - use if configured
  if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
    return 'mailgun';
  }

  // If Mailgun not configured, fall back to Resend
  if (RESEND_API_KEY) {
    return 'resend';
  }

  // Default to Mailgun (primary choice, even without credentials for mock mode)
  return 'mailgun';
}

/**
 * Send email with primary provider
 * If primary fails, attempts fallback
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const primaryProvider = getPrimaryProvider();

  try {
    if (primaryProvider === 'mailgun') {
      return await mailgun.sendEmail(options);
    } else {
      return await resend.sendEmail(options);
    }
  } catch (error) {
    // If primary provider fails, try fallback
    console.warn(`${primaryProvider} email sending failed, attempting fallback...`, error);

    const fallbackProvider = primaryProvider === 'mailgun' ? 'resend' : 'mailgun';

    try {
      if (fallbackProvider === 'mailgun') {
        return await mailgun.sendEmail(options);
      } else {
        return await resend.sendEmail(options);
      }
    } catch (fallbackError) {
      console.error(`Both ${primaryProvider} and ${fallbackProvider} failed:`, fallbackError);
      throw new Error('Failed to send email with all providers');
    }
  }
}

/**
 * Send templated email
 */
export async function sendTemplatedEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  from?: string
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject,
    html,
    text,
    from,
  });
}

/**
 * Send batch emails
 */
export async function sendBatchEmails(
  emails: SendEmailOptions[]
): Promise<{ id: string }[]> {
  const primaryProvider = getPrimaryProvider();
  const provider = primaryProvider === 'mailgun' ? mailgun : resend;

  try {
    return await provider.sendBatchEmails(emails);
  } catch (error) {
    console.warn(`Batch email sending with ${primaryProvider} failed, attempting fallback...`, error);

    const fallbackProvider = primaryProvider === 'mailgun' ? resend : mailgun;

    try {
      return await fallbackProvider.sendBatchEmails(emails);
    } catch (fallbackError) {
      console.error(`Batch email failed with all providers:`, fallbackError);
      throw new Error('Failed to send batch emails with all providers');
    }
  }
}

/**
 * Verify email address format
 */
export function isValidEmail(email: string): boolean {
  return mailgun.isValidEmail(email);
}

/**
 * Format email address
 */
export function formatEmailAddress(email: string, name?: string): string {
  return mailgun.formatEmailAddress(email, name);
}

/**
 * Get the current active provider
 * Useful for logging and debugging
 */
export function getActiveProvider(): EmailProvider {
  return getPrimaryProvider();
}
