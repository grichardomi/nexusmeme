/**
 * Mailgun Email Service
 * Handles email sending via Mailgun transactional email platform
 */

import { SendEmailOptions } from '@/types/email';

const FROM_EMAIL = 'noreply@nexusmeme.com';
const FROM_NAME = 'NexusMeme';

/**
 * Get Mailgun credentials dynamically (not at module load time)
 */
function getCredentials() {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  return { apiKey, domain };
}

/**
 * Send email via Mailgun
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const { apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN } = getCredentials();

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.warn('Mailgun credentials not configured, email not sent');
    return { id: 'mock-' + Date.now() };
  }

  try {
    // Build form data using URLSearchParams
    const formData = new URLSearchParams();
    formData.append('from', `${FROM_NAME} <${options.from || FROM_EMAIL}>`);
    formData.append('to', options.to);
    formData.append('subject', options.subject);
    formData.append('html', options.html);

    if (options.text) {
      formData.append('text', options.text);
    }
    if (options.replyTo) {
      formData.append('h:Reply-To', options.replyTo);
    }

    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
    const response = await fetch(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Mailgun API error: ${error.message}`);
    }

    const data = (await response.json()) as { id: string };
    return data;
  } catch (error) {
    console.error('Failed to send email via Mailgun:', error);
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
