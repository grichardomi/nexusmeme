import { EmailTemplate } from '@/types/email';
import { getLogoUrl, appUrl } from './shared';

interface SubscriptionCreatedProps {
  name: string;
  plan: string;
  price: number;
  period: 'monthly' | 'yearly';
  dashboardUrl: string;
}

export function SubscriptionCreatedEmailTemplate({
  name,
  plan,
  price,
  period,
  dashboardUrl,
}: SubscriptionCreatedProps): EmailTemplate {
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
          .plan-box { background: white; border: 2px solid #667eea; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .plan-name { font-size: 24px; font-weight: bold; color: #667eea; margin-bottom: 10px; }
          .plan-price { font-size: 18px; color: #333; margin-bottom: 10px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
          p { margin: 10px 0; }
          .checkmark { color: #28a745; margin-right: 5px; }
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
            <h1>🎉 Subscription Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Thank you for upgrading to the <strong>${plan}</strong> plan! Your subscription is now active.</p>
            <div class="plan-box">
              <div class="plan-name">${plan} Plan</div>
              <div class="plan-price">$${price}/${period}</div>
              <p style="margin: 0; color: #666; font-size: 14px;">Renews on ${getNextBillingDate(period)}</p>
            </div>
            <h3>What's Included:</h3>
            <ul>
              ${getPlanFeatures(plan)
                .map(f => `<li><span class="checkmark">✓</span> ${f}</li>`)
                .join('')}
            </ul>
            <p><strong>Get started with your new plan:</strong></p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #667eea;">
                  <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Go to Dashboard</a>
                </td>
              </tr>
            </table>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>Need Help?</h3>
            <p>If you have any questions about your subscription or the features included in your plan, please visit our <a href="https://docs.nexusmeme.com">documentation</a> or contact <a href="mailto:support@nexusmeme.com">support@nexusmeme.com</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/dashboard/billing')}" style="color: #667eea; text-decoration: none;">Manage Subscription</a> | <a href="${appUrl('/privacy')}" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Welcome to NexusMeme ${plan} Plan!`,
    html,
    text: `
Subscription Confirmed!

Hi ${name || 'Trader'},

Thank you for upgrading to the ${plan} plan!

Plan: ${plan}
Price: $${price}/${period}
Renews on: ${getNextBillingDate(period)}

Visit your dashboard to get started: ${dashboardUrl}

Best regards,
The NexusMeme Team
    `,
  };
}

interface SubscriptionUpgradedProps {
  name: string;
  oldPlan: string;
  newPlan: string;
  newPrice: number;
  period: 'monthly' | 'yearly';
}

export function SubscriptionUpgradedEmailTemplate({
  name,
  oldPlan,
  newPlan,
  newPrice,
  period,
}: SubscriptionUpgradedProps): EmailTemplate {
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
          .change-box { background: white; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }
          h1 { margin: 0; font-size: 28px; }
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
            <h1>⬆️ Plan Upgraded!</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your subscription has been successfully upgraded!</p>
            <div class="change-box">
              <p><strong>From:</strong> ${oldPlan} Plan</p>
              <p><strong>To:</strong> ${newPlan} Plan</p>
              <p><strong>New Price:</strong> $${newPrice}/${period}</p>
            </div>
            <p>You now have access to all the premium features of the ${newPlan} plan. Any unused credits from your previous plan have been applied as a credit to your account.</p>
            <p>Log in to your account to explore your new features!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/privacy')}" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `You've Upgraded to the ${newPlan} Plan!`,
    html,
    text: `
Plan Upgraded!

Hi ${name || 'Trader'},

Your subscription has been successfully upgraded!

From: ${oldPlan} Plan
To: ${newPlan} Plan
New Price: $${newPrice}/${period}

Thank you for upgrading!

Best regards,
The NexusMeme Team
    `,
  };
}

interface SubscriptionCancelledProps {
  name: string;
  plan: string;
  endDate: string;
}

export function SubscriptionCancelledEmailTemplate({
  name,
  plan,
  endDate,
}: SubscriptionCancelledProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          h1 { margin: 0; font-size: 28px; }
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
            <h1>Subscription Cancelled</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your ${plan} plan subscription has been cancelled.</p>
            <p><strong>Your access will end on:</strong> ${endDate}</p>
            <p>You'll revert to the Free plan on that date.</p>
            <p>If you have any questions or would like to reactivate your subscription, please contact our support team.</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">We hope to see you again soon!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #667eea; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Your NexusMeme Subscription Has Been Cancelled`,
    html,
    text: `
Subscription Cancelled

Hi ${name || 'Trader'},

Your ${plan} plan subscription has been cancelled.

Your access will end on: ${endDate}

You'll revert to the Free plan on that date.

If you have any questions, please contact our support team.

Best regards,
The NexusMeme Team
    `,
  };
}

function getNextBillingDate(period: 'monthly' | 'yearly'): string {
  const date = new Date();
  if (period === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getPlanFeatures(plan: string): string[] {
  const features: Record<string, string[]> = {
    Starter: [
      '1 trading bot',
      '2 trading pairs (BTC & ETH)',
      'AI regime detection & analysis',
      '30-day trade history',
      'Email notifications',
    ],
    'NexusMeme Standard': [
      '1 trading bot',
      'BTC & ETH trading pairs',
      'Dynamic profit targeting',
      '1-year trade history',
      'Priority email support',
      'Advanced trade analytics',
    ],
    'NexusMeme Pro': [
      '1 trading bot',
      '10 trading pairs per bot',
      'Enterprise market data',
      'Unlimited historical data',
      '24/7 dedicated support',
      'Custom integrations & optimization',
    ],
  };
  return features[plan] || [];
}

/**
 * Trial Started Email
 * Sent when a new user's live trial is activated
 */
interface TrialStartedProps {
  name?: string;
  trialDays: number;
  trialEndsAt: string;
  dashboardUrl: string;
}

export function TrialStartedEmailTemplate({
  name = 'Trader',
  trialDays,
  trialEndsAt,
  dashboardUrl,
}: TrialStartedProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .highlight-box { background: white; border-left: 4px solid #6f42c1; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .feature-list { list-style: none; padding: 0; margin: 16px 0; }
          .feature-list li { padding: 6px 0; }
          .feature-list li::before { content: "✅ "; }
          .btn { display: inline-block; background: #6f42c1; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; font-size: 16px; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 20px 0 10px; }
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
            <h1>🚀 Your ${trialDays}-Day Live Trial Has Started!</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Welcome to NexusMeme! Your <strong>${trialDays}-day live trading trial</strong> is now active. Your AI-powered trading bot can start trading on real markets right away — for free.</p>
            <div class="highlight-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Trial Period</p>
              <p style="margin: 4px 0 0; font-size: 20px; font-weight: bold; color: #6f42c1;">${trialDays} days free — ends ${trialEndsAt}</p>
              <p style="margin: 8px 0 0; font-size: 14px; color: #555;">No credit card needed. All performance fees are waived during your trial.</p>
            </div>
            <h3>What you can do during your trial</h3>
            <ul class="feature-list">
              <li>Deploy your AI trading bot on live markets</li>
              <li>Trade up to 5 pairs simultaneously</li>
              <li>All profits are 100% yours — no fees during trial</li>
              <li>Full access to trading analytics and performance dashboard</li>
            </ul>
            <p>After your trial, we only charge a <strong>performance fee on your profits</strong> — you pay nothing if your bot doesn't make money.</p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #6f42c1;">
                  <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Launch Your Bot →</a>
                </td>
              </tr>
            </table>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="font-size: 14px; color: #666;">Need help getting started? <a href="${appUrl('/support')}" style="color: #6f42c1; text-decoration: none; font-weight: 600;">Contact our support team</a> — we're here to help.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `🚀 Your ${trialDays}-Day Live Trial is Active — Start Trading Now`,
    html,
    text: `
Welcome to NexusMeme, ${name}!

Your ${trialDays}-day live trading trial is now active.

Trial Period: ${trialDays} days free — ends ${trialEndsAt}
No credit card needed. All performance fees are waived during your trial.

What you can do:
- Deploy your AI trading bot on live markets
- Trade up to 5 pairs simultaneously
- All profits are 100% yours — no fees during trial
- Full access to trading analytics

After your trial, we only charge a performance fee on profits — you pay nothing if your bot doesn't make money.

Launch your bot: ${dashboardUrl}

Best regards,
The NexusMeme Team
    `,
  };
}
