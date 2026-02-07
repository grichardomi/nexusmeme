import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

interface TrialEndingEmailProps {
  name: string;
  trialEndsDate: string;
  daysRemaining: number;
  upgradePath: string;
}

export function TrialEndingEmailTemplate({
  name,
  trialEndsDate,
  daysRemaining,
  upgradePath,
}: TrialEndingEmailProps): EmailTemplate {
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
          .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .plan-highlight { background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          .btn-secondary { display: inline-block; background: #6c757d; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn-secondary:hover { background: #5a6268; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
          .countdown { font-size: 24px; font-weight: bold; color: #667eea; margin: 15px 0; }
          .pricing-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .pricing-table td { padding: 10px; border-bottom: 1px solid #eee; }
          .pricing-table strong { color: #667eea; }
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
            <h1>⏰ Your Trial Ends Soon</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your NexusMeme <strong>10-day live trading trial</strong> is about to expire!</p>

            <div class="warning-box">
              <strong>Your trial ends on ${trialEndsDate}</strong><br>
              <div class="countdown">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining</div>
            </div>

            <p>We hope you've enjoyed testing NexusMeme! Your live trading trial includes:</p>
            <ul>
              <li>1 trading bot with live market data</li>
              <li>Trade BTC & ETH — most liquid crypto markets</li>
              <li>No capital limits - trade with your own funds</li>
              <li>Full AI-powered market regime detection</li>
              <li>Real trading with real market conditions</li>
            </ul>

            <p><strong>Ready to continue trading?</strong> After your trial, keep trading with our simple performance-based model:</p>

            <div class="plan-highlight">
              <h3 style="margin-top: 0;">Performance Fees Model - <strong>15% on Profits Only</strong></h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>1 trading bot</li>
                <li>BTC & ETH — focused where the money is</li>
                <li>Trade with any amount of capital</li>
                <li>Only pay when your bot makes money</li>
                <li>No subscription fees, no setup costs</li>
                <li>Monthly billing on the 1st</li>
              </ul>
            </div>

            <p><strong>How it works:</strong> Your bot makes a $1,000 profit? You pay $150 (15% fee). Your bot loses money? You pay nothing. That's it!</p>

            <p style="text-align: center;">
              <a href="${upgradePath}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Add Payment Method</a>
              <a href="https://nexusmeme.com/help/performance-fees" class="btn-secondary" style="background-color: #6c757d; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Learn More</a>
            </p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

            <h2>What Happens When Your Trial Ends?</h2>
            <p>When your 10-day trial expires:</p>
            <ul>
              <li>Your bot will pause (not deleted)</li>
              <li>You can add a payment method to continue</li>
              <li>Your historical trade data is preserved</li>
              <li>You'll only pay 15% on any profits after trial ends</li>
            </ul>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Questions? Reply to this email or visit our <a href="https://docs.nexusmeme.com">documentation</a>.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/plans" style="color: #667eea; text-decoration: none;">View Plans</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Your NexusMeme trial ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
    html,
    text: `
Your NexusMeme Trial Expires Soon

Hi ${name || 'Trader'},

Your 10-day live trading trial will expire on ${trialEndsDate} (${daysRemaining} days remaining).

To keep your trading bot active, add a payment method to continue:
- Performance Fee Model: 15% on profits only
- No subscription fees, no setup costs
- Only pay when your bot makes money
- You can trade with any amount of capital

Add payment method: ${upgradePath}

When your trial expires, your bot will pause. You can reactivate anytime by adding a payment method.

Learn more: https://nexusmeme.com/help/performance-fees

Best regards,
The NexusMeme Team
    `,
  };
}

// New Trial Ending Email Templates for Performance Fees Model

interface TrialEndingPerformanceFeesEmailProps {
  name: string;
  trialEndsDate: string;
  daysRemaining: number;
  performanceFeePercent: number;
  addPaymentPath: string;
}

export function TrialEndingPerformanceFeesEmailTemplate({
  name,
  trialEndsDate,
  daysRemaining,
  performanceFeePercent,
  addPaymentPath,
}: TrialEndingPerformanceFeesEmailProps): EmailTemplate {
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
          .info-box { background: #e8f4fd; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .highlight-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
          .countdown { font-size: 24px; font-weight: bold; color: #667eea; margin: 15px 0; }
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
            <h1>⏰ Your Live Trading Trial Ends Soon</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your <strong>10-day live trading trial</strong> is about to expire!</p>

            <div class="highlight-box">
              <strong>Your trial ends on ${trialEndsDate}</strong><br>
              <div class="countdown">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining</div>
            </div>

            <h2>What Happens After Your Trial?</h2>
            <div class="info-box">
              <p><strong>Good news!</strong> You can continue live trading with our performance fees model:</p>
              <ul>
                <li>✅ Trade with your own capital</li>
                <li>✅ Trade BTC & ETH — most liquid crypto markets</li>
                <li>✅ Pay only <strong>${performanceFeePercent}%</strong> on profitable trades</li>
                <li>✅ No subscription fees or setup costs</li>
              </ul>
            </div>

            <h2>How Performance Fees Work</h2>
            <p>You only pay when you profit! Here's the breakdown:</p>
            <ul>
              <li><strong>Losing trade:</strong> No fee charged</li>
              <li><strong>Profitable trade:</strong> ${performanceFeePercent}% of your profit is charged</li>
              <li><strong>Monthly billing:</strong> All fees collected on the 1st of each month</li>
              <li><strong>Minimum charge:</strong> Only if fees exceed $1</li>
            </ul>

            <p style="text-align: center; margin: 30px 0;">
              <a href="${addPaymentPath}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">Add Payment Method</a>
            </p>

            <h2>Example Scenarios</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #e8f4fd;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Trade Result</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Your Fee</strong></td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">Profit $100</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${(100 * performanceFeePercent / 100).toFixed(2)}</td>
              </tr>
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px; border: 1px solid #ddd;">Loss $50</td>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>$0 - No fee</strong></td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">Profit $1,000</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${(1000 * performanceFeePercent / 100).toFixed(2)}</td>
              </tr>
            </table>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Have questions? Visit our <a href="https://nexusmeme.com/help/billing">billing FAQ</a> or reply to this email.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/pricing" style="color: #667eea; text-decoration: none;">View Plans</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Your live trading trial ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} - Continue with performance fees`,
    html,
    text: `
Your NexusMeme Live Trading Trial Expires Soon

Hi ${name || 'Trader'},

Your 10-day live trading trial will expire on ${trialEndsDate} (${daysRemaining} days remaining).

After your trial, you can continue trading with our performance fees model:
- Trade with your own capital (no minimum)
- Pay only ${performanceFeePercent}% on profitable trades
- No subscription fees or setup costs

How it works:
- You only pay when you profit
- Fees are charged monthly on the 1st
- Losing trades are free
- Zero upfront costs

Add a payment method to continue: ${addPaymentPath}

Questions? Visit our billing FAQ: https://nexusmeme.com/help/billing

Best regards,
The NexusMeme Team
    `,
  };
}

interface TrialEndingSoonPerformanceFeesEmailProps {
  name: string;
  trialEndsDate: string;
  daysRemaining: number;
  performanceFeePercent: number;
  addPaymentPath: string;
}

export function TrialEndingSoonPerformanceFeesEmailTemplate({
  name,
  trialEndsDate,
  daysRemaining,
  performanceFeePercent,
  addPaymentPath,
}: TrialEndingSoonPerformanceFeesEmailProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #c92a2a 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .urgency-box { background: #ffe8e8; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .feature-box { background: #e8f4fd; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .btn { display: inline-block; background: #ff6b6b; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #c92a2a; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
          .countdown { font-size: 24px; font-weight: bold; color: #ff6b6b; margin: 15px 0; }
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
            <h1>🚨 Your Trial Ends Tomorrow!</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>

            <div class="urgency-box">
              <strong>⏰ Your live trading trial expires on ${trialEndsDate}</strong><br>
              <div class="countdown">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left</div>
              <p style="margin: 10px 0 0 0;">Add a payment method now to continue trading without interruption!</p>
            </div>

            <h2>Continue Trading with Performance Fees</h2>
            <div class="feature-box">
              <p><strong>Pay only when you win!</strong></p>
              <ul style="margin: 10px 0;">
                <li>✅ Unlimited live trading after trial</li>
                <li>✅ ${performanceFeePercent}% fee on profitable trades only</li>
                <li>✅ No minimum capital requirement</li>
                <li>✅ Monthly billing on 1st of month</li>
              </ul>
            </div>

            <p><strong>Quick Example:</strong> If you make $1,000 profit, you pay ${(1000 * performanceFeePercent / 100).toFixed(2)}. If you lose money, you pay nothing!</p>

            <p style="text-align: center; margin: 30px 0;">
              <a href="${addPaymentPath}" class="btn" style="background-color: #ff6b6b; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">Add Payment Method Now</a>
            </p>

            <p><strong>What happens if you don't add a payment method?</strong></p>
            <ul>
              <li>Your bot will pause after the trial ends</li>
              <li>You won't be charged any fees</li>
              <li>You can add payment and resume anytime</li>
              <li>All your historical data is preserved</li>
            </ul>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Need help? <a href="https://nexusmeme.com/help/billing">View billing FAQ</a> or reply to this email.
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
    subject: `🚨 Your trial ends tomorrow - Add payment to keep trading`,
    html,
    text: `
Last Day: Your Live Trading Trial Expires Tomorrow!

Hi ${name || 'Trader'},

Your live trading trial expires on ${trialEndsDate} (${daysRemaining} day remaining).

Add a payment method now to continue trading! You'll pay only ${performanceFeePercent}% on profitable trades.

Example: $1,000 profit = ${(1000 * performanceFeePercent / 100).toFixed(2)} fee

Add payment: ${addPaymentPath}

If you don't add payment:
- Your bot will pause after trial
- You won't be charged any fees
- You can resume trading anytime by adding a payment method

Best regards,
The NexusMeme Team
    `,
  };
}

interface TrialEndingSoonAddPaymentEmailProps {
  name: string;
  trialEndsDate: string;
  daysRemaining: number;
  performanceFeePercent: number;
  setupPaymentPath: string;
}

export function TrialEndingSoonAddPaymentEmailTemplate({
  name,
  trialEndsDate,
  daysRemaining,
  performanceFeePercent,
  setupPaymentPath,
}: TrialEndingSoonAddPaymentEmailProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #c92a2a 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #ffe8e8; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .action-box { background: #e8f4fd; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .btn { display: inline-block; background: #ff6b6b; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #c92a2a; }
          h1 { margin: 0; font-size: 28px; }
          h2 { margin: 20px 0 10px 0; font-size: 20px; }
          p { margin: 10px 0; }
          .countdown { font-size: 24px; font-weight: bold; color: #ff6b6b; margin: 15px 0; }
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
            <h1>⏰ Final Reminder: Set Up Payment</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>

            <div class="alert-box">
              <strong>Your live trading trial expires on ${trialEndsDate}</strong><br>
              <div class="countdown">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left to set up payment</div>
            </div>

            <h2>Continue Live Trading After Your Trial</h2>
            <div class="action-box">
              <p><strong>To keep trading with real money, you need to add a payment method.</strong></p>
              <p>After your trial, we charge:</p>
              <ul style="margin: 10px 0;">
                <li>✅ ${performanceFeePercent}% of your profits only</li>
                <li>✅ Nothing if you lose money</li>
                <li>✅ Monthly billing (1st of each month)</li>
                <li>✅ Minimum charge: $1</li>
              </ul>
            </div>

            <p><strong>Set up now, it takes 1 minute:</strong></p>
            <ol>
              <li>Click the button below</li>
              <li>Enter your payment method</li>
              <li>Continue trading seamlessly</li>
            </ol>

            <p style="text-align: center; margin: 30px 0;">
              <a href="${setupPaymentPath}" class="btn" style="background-color: #ff6b6b; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px;">Set Up Payment in 1 Minute</a>
            </p>

            <h2>No Upfront Cost</h2>
            <p>You don't pay anything until you make a profit. The fee is charged only on winning trades.</p>

            <h2>What Happens If You Don't Add Payment?</h2>
            <ul>
              <li>Your live trading will stop</li>
              <li>Paper trading (free) stays available</li>
              <li>All your trades are saved</li>
              <li>You can resume anytime</li>
            </ul>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Questions about our performance fee structure? <a href="https://nexusmeme.com/help/billing">View FAQ</a> or reply to this email.
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
    subject: `⏰ Complete setup before tomorrow - Add payment method`,
    html,
    text: `
Complete Your Setup: Add Payment Method

Hi ${name || 'Trader'},

Your live trading trial ends on ${trialEndsDate} (${daysRemaining} day remaining).

To keep trading after your trial, add a payment method:
${setupPaymentPath}

You'll pay only ${performanceFeePercent}% on profitable trades. Nothing if you lose.

Set up takes 1 minute, no upfront charges.

If you don't set up:
- Live trading stops after trial
- Paper trading stays free
- Resume anytime by adding payment

Best regards,
The NexusMeme Team
    `,
  };
}
