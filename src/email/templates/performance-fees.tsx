import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

/**
 * Performance Fee Charged Email
 * Sent when a performance fee is successfully charged
 */
interface PerformanceFeeChargedProps {
  name?: string;
  amount: number;
  invoiceId: string;
  invoiceUrl?: string;
  trades: number;
}

export function PerformanceFeeChargedEmailTemplate({
  name = 'Trader',
  amount,
  invoiceId,
  invoiceUrl,
  trades,
}: PerformanceFeeChargedProps): EmailTemplate {
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
          .fee-box { background: white; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 32px; font-weight: bold; color: #28a745; }
          .btn { display: inline-block; background: #28a745; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #218838; }
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
            <h1>✅ Performance Fee Charged</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Great news! Your trading bot has generated profits, and we've collected your performance fee.</p>
            <div class="fee-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Performance Fee (15% of Profits)</p>
              <div class="amount">$${amount.toFixed(2)}</div>
              <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">From ${trades} profitable trade(s)</p>
            </div>
            <div class="details">
              <p><strong>Invoice ID:</strong> ${invoiceId}</p>
              <p style="margin-bottom: 0;"><strong>Status:</strong> <span style="color: #28a745;">✓ Charged</span></p>
            </div>
            <p>This confirms that your performance fee has been successfully charged to your card. Your trading bot continues to run and generate signals.</p>
            ${invoiceUrl ? `<a href="${invoiceUrl}" class="btn" style="background-color: #28a745; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View Receipt</a>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>How Performance Fees Work</h3>
            <p>You only pay when your bot generates profits. We charge 15% of your realized profits each month. We only earn when you earn.</p>
            <p><a href="https://nexusmeme.com/billing" style="color: #28a745; text-decoration: none; font-weight: 600;">View your billing dashboard →</a></p>
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
    subject: `✅ Performance Fee Charged - $${amount.toFixed(2)}`,
    html,
    text: `
Performance Fee Charged

Hi ${name},

Great news! Your trading bot has generated profits, and we've collected your performance fee.

Performance Fee (15% of Profits): $${amount.toFixed(2)}
From: ${trades} profitable trade(s)

Invoice ID: ${invoiceId}
Status: Charged

This confirms that your performance fee has been successfully charged.

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Upcoming Billing Email
 * Sent ~3 days before monthly billing (28th of month)
 */
interface UpcomingBillingProps {
  name?: string;
  totalPendingFees: number;
  tradeCount: number;
  billingDate: string;
  billingUrl: string;
}

export function UpcomingBillingEmailTemplate({
  name = 'Trader',
  totalPendingFees,
  tradeCount,
  billingDate,
  billingUrl,
}: UpcomingBillingProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #007bff 0%, #00b4d8 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .fee-box { background: white; border-left: 4px solid #007bff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 32px; font-weight: bold; color: #007bff; }
          .btn { display: inline-block; background: #007bff; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
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
            <h1>Upcoming Billing Notice</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>This is a reminder that your monthly performance fees will be charged on <strong>${billingDate}</strong>.</p>
            <div class="fee-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Pending Performance Fees (15% of Profits)</p>
              <div class="amount">$${totalPendingFees.toFixed(2)}</div>
              <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">From ${tradeCount} profitable trade(s)</p>
            </div>
            <div class="details">
              <p><strong>Billing Date:</strong> ${billingDate}</p>
              <p style="margin-bottom: 0;"><strong>Payment Method:</strong> Card on file (auto-charge)</p>
            </div>
            <p>Your card on file will be charged automatically. If you need to update your payment method, please do so before the billing date.</p>
            <a href="${billingUrl}" class="btn" style="background-color: #007bff; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Manage Billing</a>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>How Performance Fees Work</h3>
            <p>You only pay when your bot generates profits. We charge 15% of your realized profits each month. No profits = no charge.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Upcoming Billing - $${totalPendingFees.toFixed(2)} due on ${billingDate}`,
    html,
    text: `
Upcoming Billing Notice

Hi ${name},

This is a reminder that your monthly performance fees will be charged on ${billingDate}.

Pending Performance Fees (15% of Profits): $${totalPendingFees.toFixed(2)}
From: ${tradeCount} profitable trade(s)

Billing Date: ${billingDate}
Payment Method: Card on file (auto-charge)

Your card on file will be charged automatically. If you need to update your payment method, please do so before the billing date.

Manage billing: ${billingUrl}

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Performance Fee Failed Email
 * Sent when payment fails
 */
interface PerformanceFeeFailedProps {
  name?: string;
  amount: number;
  retryCount?: number;
  supportUrl?: string;
}

export function PerformanceFeeFailedEmailTemplate({
  name = 'Trader',
  amount,
  retryCount = 1,
  supportUrl = 'https://nexusmeme.com/support',
}: PerformanceFeeFailedProps): EmailTemplate {
  let messageText = '';
  let actionText = '';

  if (retryCount === 1) {
    messageText = 'We attempted to charge your card but it was declined. We will automatically retry in 2 days.';
    actionText = 'No action needed right now, but we recommend updating your payment method to prevent suspension.';
  } else if (retryCount === 2) {
    messageText = 'Your payment has failed twice. This is our final automatic retry. It will occur in 1 day.';
    actionText = 'Please update your payment method immediately to avoid your trading bot being suspended.';
  } else {
    messageText = 'We were unable to collect your performance fee after multiple attempts. Your trading bot will be paused in 24 hours.';
    actionText = 'Please update your payment method now to restore your bot access.';
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff6b6b; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .warning-box { background: #fff3cd; border-left: 4px solid #ff6b6b; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #ff6b6b; }
          .btn { display: inline-block; background: #ff6b6b; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #ff5252; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
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
            <h1>⚠️ Payment Failed</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>${messageText}</p>
            <div class="warning-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Amount Due</p>
              <div class="amount">$${amount.toFixed(2)}</div>
              <p style="margin: 10px 0 0 0; color: #333; font-size: 14px;">Attempt: ${retryCount} of 3</p>
            </div>
            <h3>⚡ Action Required</h3>
            <p>${actionText}</p>
            <a href="https://nexusmeme.com/billing" class="btn" style="background-color: #ff6b6b; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Update Payment Method</a>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>Need Help?</h3>
            <p>If you believe this is an error or have questions, please <a href="${supportUrl}" style="color: #ff6b6b; text-decoration: none; font-weight: 600;">contact our support team</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${supportUrl}" style="color: #ff6b6b; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `⚠️ Payment Failed - Action Required`,
    html,
    text: `
Payment Failed - Action Required

Hi ${name},

${messageText}

Amount Due: $${amount.toFixed(2)}
Attempt: ${retryCount} of 3

${actionText}

Update your payment method: https://nexusmeme.com/billing

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Performance Fee Refund Email
 * Sent when a fee is refunded to the user
 */
interface PerformanceFeeRefundProps {
  name?: string;
  refundAmount: number;
  reason: string;
}

export function PerformanceFeeRefundEmailTemplate({
  name = 'Trader',
  refundAmount,
  reason,
}: PerformanceFeeRefundProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #007bff 0%, #00b4d8 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .refund-box { background: white; border-left: 4px solid #28a745; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 32px; font-weight: bold; color: #28a745; }
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
            <h1>Performance Fee Refunded</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>We've processed a refund to your payment method.</p>
            <div class="refund-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Refund Amount</p>
              <div class="amount">+$${refundAmount.toFixed(2)}</div>
            </div>
            <div class="details">
              <p><strong>Reason:</strong> ${reason}</p>
              <p style="margin-bottom: 0;"><strong>Timeline:</strong> 5-10 business days to appear on your statement</p>
            </div>
            <p>If you have any questions about this refund, please contact our support team.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p><a href="https://nexusmeme.com/dashboard/billing" style="color: #007bff; text-decoration: none; font-weight: 600;">View your billing details &rarr;</a></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Performance Fee Refunded - $${refundAmount.toFixed(2)}`,
    html,
    text: `
Performance Fee Refunded

Hi ${name},

We've processed a refund of $${refundAmount.toFixed(2)} to your payment method.

Reason: ${reason}

The refund should appear within 5-10 business days.

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Fee Adjustment Email
 * Sent when admin adjusts a fee
 */
interface FeeAdjustmentProps {
  name?: string;
  originalAmount: number;
  adjustedAmount: number;
  reason: string;
}

export function FeeAdjustmentEmailTemplate({
  name = 'Trader',
  originalAmount,
  adjustedAmount,
  reason,
}: FeeAdjustmentProps): EmailTemplate {
  const difference = originalAmount - adjustedAmount;
  const isCredit = difference > 0;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .adjustment-box { background: white; border: 2px solid #007bff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; margin: 10px 0; padding: 10px 0; border-bottom: 1px solid #eee; }
          .row:last-child { border-bottom: none; }
          .label { font-weight: 600; }
          .value { text-align: right; }
          .credit { color: #28a745; }
          .debit { color: #ff6b6b; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
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
            <h1>📋 Fee Adjustment Applied</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>We've reviewed your account and adjusted your performance fee.</p>
            <div class="adjustment-box">
              <div class="row">
                <span class="label">Original Fee:</span>
                <span class="value">$${originalAmount.toFixed(2)}</span>
              </div>
              <div class="row">
                <span class="label">Adjusted Fee:</span>
                <span class="value">$${adjustedAmount.toFixed(2)}</span>
              </div>
              <div class="row" style="font-size: 16px; font-weight: bold; padding: 15px 0;">
                <span class="label ${isCredit ? 'credit' : 'debit'}">${isCredit ? 'Credit' : 'Charge'}:</span>
                <span class="value ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : '-'}$${Math.abs(difference).toFixed(2)}</span>
              </div>
            </div>
            <h3>Reason</h3>
            <p>${reason}</p>
            <p>If you have any questions about this adjustment, please contact our support team.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p><a href="https://nexusmeme.com/billing" style="color: #007bff; text-decoration: none; font-weight: 600;">View your billing details →</a></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `📋 Fee Adjustment Applied`,
    html,
    text: `
Fee Adjustment Applied

Hi ${name},

We've reviewed your account and adjusted your performance fee.

Original Fee: $${originalAmount.toFixed(2)}
Adjusted Fee: $${adjustedAmount.toFixed(2)}

${isCredit ? 'Credit' : 'Charge'}: ${isCredit ? '+' : '-'}$${Math.abs(difference).toFixed(2)}

Reason: ${reason}

If you have questions, please contact support.

Best regards,
The NexusMeme Team
    `,
  };
}
