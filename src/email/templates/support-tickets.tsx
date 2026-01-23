import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

/**
 * Email template for when a user creates a support ticket
 */
export function TicketCreatedEmailTemplate(props: {
  name?: string;
  ticketId: string;
  subject: string;
  ticketUrl: string;
}): EmailTemplate {
  const { name = 'there', ticketId, subject, ticketUrl } = props;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          .ticket-info { background: white; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #667eea; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>Support Ticket Received</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Thank you for contacting NexusMeme support! We've received your support ticket and will review it shortly.</p>

            <div class="ticket-info">
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <p><strong>Subject:</strong> ${subject}</p>
            </div>

            <p>Our support team will get back to you as soon as possible. You can check the status of your ticket and view responses at:</p>
            <a href="${ticketUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View Your Ticket</a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h2>What to Expect</h2>
            <ul style="margin: 15px 0;">
              <li><strong>Standard Plan:</strong> Response within 24-48 hours</li>
              <li><strong>Pro Plan:</strong> Response within 4-8 hours</li>
              <li><strong>Community:</strong> Community support during business hours</li>
            </ul>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              If you have any additional information to add, reply directly to your ticket or visit the link above.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Support Ticket Created: ${subject}`,
    html,
  };
}

/**
 * Email template for when admin replies to a support ticket
 */
export function TicketRepliedEmailTemplate(props: {
  name?: string;
  ticketId: string;
  subject: string;
  replyMessage: string;
  ticketUrl: string;
}): EmailTemplate {
  const { name = 'there', ticketId, subject, replyMessage, ticketUrl } = props;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          .reply-box { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #10b981; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>Support Response</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Our support team has replied to your support ticket:</p>

            <div class="reply-box">
              <p><strong>Ticket:</strong> ${subject}</p>
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #eee;">
              <div style="white-space: pre-wrap; color: #333;">${replyMessage}</div>
            </div>

            <p>You can view your full ticket conversation and reply at:</p>
            <a href="${ticketUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View Ticket & Reply</a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Please don't hesitate to reply with any follow-up questions or additional information.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Re: ${subject}`,
    html,
  };
}

/**
 * Email template for admin notification of new ticket
 */
export function NewTicketAdminEmailTemplate(props: {
  name?: string;
  ticketId: string;
  subject: string;
  priority: string;
  userEmail: string;
  ticketUrl: string;
}): EmailTemplate {
  const { name = 'Admin', ticketId, subject, priority, userEmail, ticketUrl } = props;

  const priorityColor = {
    urgent: '#ef4444',
    high: '#f97316',
    normal: '#3b82f6',
    low: '#10b981',
  }[priority.toLowerCase()] || '#3b82f6';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          .ticket-card { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; border: 1px solid #ddd; }
          .priority-badge { display: inline-block; padding: 4px 8px; border-radius: 3px; color: white; font-weight: 700; font-size: 10px; white-space: nowrap; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>New Support Ticket</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>A new support ticket has been submitted:</p>

            <div class="ticket-card">
              <div style="margin-bottom: 15px;">
                <div style="display: inline-block; width: 70%; vertical-align: top;">
                  <p><strong>Subject:</strong> ${subject}</p>
                  <p><strong>Ticket ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 2px;">${ticketId}</code></p>
                </div>
                <div style="display: inline-block; width: 28%; text-align: right; vertical-align: top;">
                  <div class="priority-badge" style="background-color: ${priorityColor}; display: inline-block;">
                    ${priority.toUpperCase()}
                  </div>
                </div>
              </div>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #eee;">
              <p><strong>From:</strong> ${userEmail}</p>
            </div>

            <p>Review and respond to this ticket:</p>
            <a href="${ticketUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View & Respond to Ticket</a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Please prioritize based on the ticket's priority level. Thank you!
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `[${priority.toUpperCase()}] New Support Ticket: ${subject}`,
    html,
  };
}
