import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

interface WelcomeEmailProps {
  name: string;
  verificationUrl: string;
}

export function WelcomeEmailTemplate({ name, verificationUrl }: WelcomeEmailProps): EmailTemplate {
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
            <p>NexusMeme is your AI-powered trading bot platform designed to help you execute profitable trades across multiple exchanges with intelligent risk management.</p>
            <p><strong>You've been assigned to our live trading trial:</strong></p>
            <ul style="margin: 15px 0;">
              <li>10-day live trading trial - no capital limits</li>
              <li>1 trading bot with real market data</li>
              <li>Trade BTC & ETH — most liquid crypto markets</li>
              <li>Full AI-powered market regime detection</li>
              <li>No payment required during trial</li>
              <li>After trial, pay only 15% on profits</li>
            </ul>
            <p><strong>To get started, please verify your email address:</strong></p>
            <a href="${verificationUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Verify Email Address</a>
            <p style="font-size: 12px; color: #666;">This link will expire in 24 hours.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h2>What's Next?</h2>
            <ol>
              <li>Verify your email address</li>
              <li>Configure your API keys for exchanges (Kraken, Binance, Coinbase)</li>
              <li>Choose your first trading strategy</li>
              <li>Deploy your bot and start trading</li>
            </ol>
            <p>Our documentation and tutorials are available at <a href="https://docs.nexusmeme.com">docs.nexusmeme.com</a></p>
            <p style="margin-top: 30px; font-size: 14px; color: #666;">Have questions? Reply to this email or visit our support center.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/unsubscribe" style="color: #667eea; text-decoration: none;">Unsubscribe</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
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

Please verify your email address to get started:
${verificationUrl}

This link will expire in 24 hours.

Best regards,
The NexusMeme Team
    `,
  };
}
