import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

/**
 * Bot Suspended Email
 * Sent when a bot is suspended due to payment failures
 */
interface BotSuspendedProps {
  name?: string;
  botInstanceId: string;
  reason?: string;
  action?: string;
  billingUrl?: string;
}

export function BotSuspendedEmailTemplate({
  name = 'Trader',
  botInstanceId,
  reason = 'Multiple payment attempts failed',
  action = 'Please update your payment method to restore trading',
  billingUrl,
}: BotSuspendedProps): EmailTemplate {
  const billingLink = billingUrl || 'https://nexusmeme.com/dashboard/billing';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc3545 0%, #ff6b6b 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #fff3cd; border-left: 4px solid #dc3545; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .status-badge { display: inline-block; background: #dc3545; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; }
          .btn { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
          p { margin: 10px 0; }
          .details { background: #f0f0f0; padding: 15px; border-radius: 4px; margin: 15px 0; font-size: 14px; }
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
            <h1>Trading Bot Suspended</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Your trading bot has been <strong>suspended</strong> due to a billing issue. It will not execute any trades until the issue is resolved.</p>
            <div class="alert-box">
              <p style="margin: 0 0 10px 0;"><strong>Reason:</strong> ${reason}</p>
              <p style="margin: 0;"><span class="status-badge">Suspended</span></p>
            </div>
            <div class="details">
              <p><strong>Bot ID:</strong> ${botInstanceId}</p>
              <p style="margin-bottom: 0;"><strong>Status:</strong> Paused - No trades will be executed</p>
            </div>
            <h3>Action Required</h3>
            <p>${action}</p>
            <p>Once your payment is processed, your bot will be <strong>automatically resumed</strong> and will continue trading.</p>
            <a href="${billingLink}" class="btn" style="background-color: #dc3545; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Update Payment Method</a>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>Need Help?</h3>
            <p>If you believe this is an error, please <a href="https://nexusmeme.com/support" style="color: #dc3545; text-decoration: none; font-weight: 600;">contact our support team</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #dc3545; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: 'Trading Bot Suspended - Payment Issue',
    html,
    text: `
Trading Bot Suspended

Hi ${name},

Your trading bot has been suspended due to a billing issue.

Reason: ${reason}
Bot ID: ${botInstanceId}
Status: Paused - No trades will be executed

Action Required: ${action}

Once your payment is processed, your bot will be automatically resumed.

Update payment method: ${billingLink}

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Bot Resumed Email
 * Sent when a bot is resumed after payment recovery
 */
interface BotResumedProps {
  name?: string;
  botInstanceId: string;
  message?: string;
}

export function BotResumedEmailTemplate({
  name = 'Trader',
  botInstanceId,
  message = 'Your trading bot has been resumed after payment was successfully processed.',
}: BotResumedProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .success-box { background: white; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .status-badge { display: inline-block; background: #28a745; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; }
          .btn { display: inline-block; background: #28a745; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
          p { margin: 10px 0; }
          .details { background: #f0f0f0; padding: 15px; border-radius: 4px; margin: 15px 0; font-size: 14px; }
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
            <h1>Trading Bot Resumed</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>${message}</p>
            <div class="success-box">
              <p style="margin: 0 0 10px 0;"><strong>Your bot is back online!</strong></p>
              <p style="margin: 0;"><span class="status-badge">Active</span></p>
            </div>
            <div class="details">
              <p><strong>Bot ID:</strong> ${botInstanceId}</p>
              <p style="margin-bottom: 0;"><strong>Status:</strong> Running - Actively trading</p>
            </div>
            <p>Your bot will continue executing trades based on your strategy. Monitor performance in your dashboard.</p>
            <a href="https://nexusmeme.com/dashboard" class="btn" style="background-color: #28a745; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View Dashboard</a>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="font-size: 14px; color: #666;">
              Tip: Keep your payment method up to date to avoid future interruptions.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #28a745; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: 'Trading Bot Resumed - Back Online',
    html,
    text: `
Trading Bot Resumed

Hi ${name},

${message}

Bot ID: ${botInstanceId}
Status: Running - Actively trading

Your bot will continue executing trades based on your strategy.

View dashboard: https://nexusmeme.com/dashboard

Best regards,
The NexusMeme Team
    `,
  };
}
