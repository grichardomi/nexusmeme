import { EmailTemplate } from '@/types/email';
import { getLogoUrl, appUrl } from './shared';

interface WelcomeEmailProps {
  name: string;
  verificationUrl: string;
  feePercent?: number | string;
}

export function WelcomeEmailTemplate({ name, verificationUrl, feePercent }: WelcomeEmailProps): EmailTemplate {
  const feePercentNum = feePercent != null ? parseFloat(String(feePercent)) : null;
  const feeDisplay = feePercentNum != null ? `${feePercentNum}%` : 'a performance fee';
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
            <h1>Welcome to NexusMeme</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Welcome to NexusMeme! We're excited to have you on board.</p>
            <p>NexusMeme is your AI-powered trading bot platform designed to help you execute profitable trades with intelligent risk management.</p>
            <p><strong>Your 10-day free trial starts now:</strong></p>
            <ul style="margin: 15px 0;">
              <li>1 AI trading bot — paper mode by default (zero risk, simulated trades)</li>
              <li>Switch to live trading anytime during your trial with your own Binance capital</li>
              <li>Trade BTC &amp; ETH — most liquid crypto markets</li>
              <li>Full AI-powered market regime detection</li>
              <li>No payment required during trial</li>
              <li>After trial: pay only ${feeDisplay} on profits — nothing on losses</li>
            </ul>
            <p><strong>To get started, please verify your email address:</strong></p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #667eea;">
                  <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Verify Email Address</a>
                </td>
              </tr>
            </table>
            <p style="font-size: 12px; color: #666;">This link will expire in 24 hours.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h2>What's Next?</h2>
            <ol>
              <li>Verify your email address (link above)</li>
              <li>Create an exchange account — <a href="https://www.binance.com" style="color: #667eea;">Binance International</a> (global, not US) or <a href="https://www.kraken.com" style="color: #667eea;">Kraken</a> (global + US) — $1,000 total account value minimum for live trading</li>
              <li>Connect your API keys in Settings → Exchange Connections</li>
              <li>Create your first bot — starts in paper mode (simulated, zero risk)</li>
              <li>Switch to live trading when ready to trade with real capital</li>
            </ol>
            <p>Questions? Visit our <a href="${appUrl('/help')}" style="color: #667eea;">Help Center</a> or reply to this email.</p>
            <p style="margin-top: 30px; font-size: 14px; color: #666;">Have questions? Reply to this email or visit our support center.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/unsubscribe')}" style="color: #667eea; text-decoration: none;">Unsubscribe</a> | <a href="${appUrl('/privacy')}" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Welcome to NexusMeme, ${name || 'Trader'}!`,
    html,
    text: `
Welcome to NexusMeme!

Hi ${name || 'Trader'},

Your 10-day free trial has started. Your bot begins in paper mode (simulated trades, zero risk).
You can switch to live trading during or after your trial — connect your exchange API keys first.

After your trial: pay only ${feeDisplay} on profits — nothing on losses.

WHAT'S NEXT:
1. Verify your email (link below)
2. Create an exchange account — Binance International (binance.com, global/not US) or Kraken (kraken.com, global+US) — $1,000 total account value minimum for live trading
3. Connect your API keys in Settings → Exchange Connections
4. Create your first bot (starts in paper mode)
5. Switch to live trading when ready

Verify your email:
${verificationUrl}

This link will expire in 24 hours.

Questions? Visit nexusmeme.com/help or reply to this email.

Best regards,
The NexusMeme Team
    `,
  };
}
