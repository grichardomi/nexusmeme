/**
 * Resend Email Service
 * Handles email sending via Resend transactional email platform
 */

import { getEnv } from '@/config/environment';
import { SendEmailOptions } from '@/types/email';

const RESEND_API_BASE = 'https://api.resend.com';
const RESEND_API_KEY = getEnv('RESEND_API_KEY');
const FROM_EMAIL = 'noreply@nexusmeme.com';
const FROM_NAME = 'NexusMeme';

/**
 * Send email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, email not sent');
    return { id: 'mock-' + Date.now() };
  }

  try {
    const response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${options.from || FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo || FROM_EMAIL,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${error.message}`);
    }

    const data = (await response.json()) as { id: string };
    return data;
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Send email with template
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
  const results = await Promise.allSettled(
    emails.map(email => sendEmail(email))
  );

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => (result as PromiseFulfilledResult<{ id: string }>).value);
}

/**
 * Verify email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format email address
 */
export function formatEmailAddress(email: string, name?: string): string {
  if (name) {
    return `${name} <${email}>`;
  }
  return email;
}
