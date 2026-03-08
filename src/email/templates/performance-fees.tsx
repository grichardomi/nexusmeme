import { EmailTemplate } from '@/types/email';
import { getLogoUrl, appUrl } from './shared';

/**
 * Performance Fee Charged Email
 * Sent when a performance fee is successfully charged
 */
interface PerformanceFeeChargedProps {
  name?: string;
  amount: number | string;
  feePercent?: number | string;
  invoiceId: string;
  invoiceUrl?: string;
  trades: number;
}

export function PerformanceFeeChargedEmailTemplate({
  name = 'Trader',
  amount,
  feePercent = 6,
  invoiceId,
  invoiceUrl,
  trades,
}: PerformanceFeeChargedProps): EmailTemplate {
  const amountNum = parseFloat(String(amount));
  const feePercentNum = parseFloat(String(feePercent));
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
            <h1>🧾 Performance Fee Invoice</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Your trading bot generated profits this month. Here is your performance fee invoice — pay via USDC on Base network.</p>
            <div class="fee-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Performance Fee (${feePercentNum}% of Profits)</p>
              <div class="amount">$${amountNum.toFixed(2)} USDC</div>
              <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">From ${trades} profitable trade(s)</p>
            </div>
            <div class="details">
              <p><strong>Invoice Reference:</strong> ${invoiceId}</p>
              <p style="margin-bottom: 0;"><strong>Status:</strong> <span style="color: #f59e0b;">⏳ Awaiting Payment</span></p>
            </div>
            <p>Send exactly <strong>$${amountNum.toFixed(6)} USDC</strong> on the <strong>Base network</strong> to your dashboard wallet address. Payment confirms automatically within seconds.</p>
            ${invoiceUrl ? `<table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #28a745;">
                  <a href="${invoiceUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Pay Now →</a>
                </td>
              </tr>
            </table>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>How Performance Fees Work</h3>
            <p>You only pay when your bot generates profits. We charge ${feePercentNum}% of your realized profits each month. We only earn when you earn.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `🧾 Performance Fee Invoice - $${amountNum.toFixed(2)} USDC due`,
    html,
    text: `
Performance Fee Invoice

Hi ${name},

Your trading bot generated profits. Here is your invoice.

Performance Fee (${feePercentNum}% of profits): $${amountNum.toFixed(2)} USDC
From: ${trades} profitable trade(s)
Invoice Reference: ${invoiceId}
Status: Awaiting Payment

Send $${amountNum.toFixed(6)} USDC on Base network via your billing dashboard.
${invoiceUrl ? `Pay here: ${invoiceUrl}` : ''}

We only earn when you earn.

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
              <p style="margin-bottom: 0;"><strong>Payment Method:</strong> USDC on Base network</p>
            </div>
            <p>An invoice will be generated on the billing date. You'll receive a USDC payment request to your dashboard wallet — simply send the exact amount shown and it confirms automatically.</p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #007bff;">
                  <a href="${billingUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Manage Billing</a>
                </td>
              </tr>
            </table>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>How Performance Fees Work</h3>
            <p>You only pay when your bot generates profits. We charge 15% of your realized profits each month. No profits = no charge.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
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
  amount: number | string;
  retryCount?: number;
  supportUrl?: string;
}

export function PerformanceFeeFailedEmailTemplate({
  name = 'Trader',
  amount,
  retryCount = 1,
  supportUrl,
}: PerformanceFeeFailedProps): EmailTemplate {
  const billingUrl = appUrl('/dashboard/billing');
  const resolvedSupportUrl = supportUrl || appUrl('/support');
  const amountNum = parseFloat(String(amount));
  let messageText = '';
  let actionText = '';

  if (retryCount === 1) {
    messageText = `We haven't received your USDC performance fee payment of $${amountNum.toFixed(2)}. This can happen if the payment window expired before sending.`;
    actionText = 'Head to your billing dashboard to view your open invoice and send payment — it only takes a moment.';
  } else if (retryCount === 2) {
    messageText = `Your performance fee of $${amountNum.toFixed(2)} USDC is still outstanding after a second notice. Please pay promptly to keep your bot running.`;
    actionText = 'Send payment from your billing dashboard now to avoid your trading bot being suspended.';
  } else {
    messageText = `Your performance fee of $${amountNum.toFixed(2)} USDC remains unpaid. Your trading bot will be paused in 24 hours if payment is not received.`;
    actionText = 'Pay now via your billing dashboard to restore full bot access.';
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
              <div class="amount">$${amountNum.toFixed(2)}</div>
              <p style="margin: 10px 0 0 0; color: #333; font-size: 14px;">Attempt: ${retryCount} of 3</p>
            </div>
            <h3>⚡ Action Required</h3>
            <p>${actionText}</p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #ff6b6b;">
                  <a href="${billingUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Pay Now →</a>
                </td>
              </tr>
            </table>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <h3>Need Help?</h3>
            <p>If you have questions about your invoice, please <a href="${resolvedSupportUrl}" style="color: #ff6b6b; text-decoration: none; font-weight: 600;">contact our support team</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${resolvedSupportUrl}" style="color: #ff6b6b; text-decoration: none;">Contact Support</a></p>
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

Amount Due: $${amountNum.toFixed(2)}
Attempt: ${retryCount} of 3

${actionText}

Pay now: ${billingUrl}

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
            <p><a href="${appUrl('/dashboard/billing')}" style="color: #007bff; text-decoration: none; font-weight: 600;">View your billing details &rarr;</a></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
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
 * Performance Fee Dunning Email
 * Sent when a USDC invoice is overdue (Day 7 first reminder, Day 10 final warning)
 */
interface PerformanceFeeDunningProps {
  name?: string;
  amount: number;
  attemptNumber: number;
  deadline: string;
  walletAddress?: string;
  paymentReference?: string;
  billingUrl?: string;
}

export function PerformanceFeeDunningEmailTemplate({
  name = 'Trader',
  amount,
  attemptNumber,
  deadline,
  walletAddress,
  paymentReference,
  billingUrl,
}: PerformanceFeeDunningProps): EmailTemplate {
  const resolvedBillingUrl = billingUrl || appUrl('/dashboard/billing');
  const amountNum = parseFloat(String(amount));
  const isFinalWarning = attemptNumber >= 2;
  const headerColor = isFinalWarning ? '#dc3545' : '#f59e0b';
  const headerTitle = isFinalWarning
    ? '🚨 Final Payment Warning — Bots Suspend in 4 Days'
    : '⚠️ Invoice Overdue — Payment Required';
  const bodyMessage = isFinalWarning
    ? `This is your <strong>final warning</strong>. Your invoice of <strong>$${amountNum.toFixed(2)} USDC</strong> is still unpaid. Your bots will be <strong>suspended on ${deadline}</strong> if payment is not received.`
    : `Your invoice of <strong>$${amountNum.toFixed(2)} USDC</strong> is overdue. Please pay before <strong>${deadline}</strong> to keep your bots trading.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${headerColor}; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #fff3cd; border-left: 4px solid ${headerColor}; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 28px; font-weight: bold; color: ${headerColor}; }
          .payment-box { background: #fff; border: 1px solid #dee2e6; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
          .btn { display: inline-block; background: ${headerColor}; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; font-size: 16px; }
          h1 { margin: 0; font-size: 24px; }
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
            <h1>${headerTitle}</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>${bodyMessage}</p>
            <div class="alert-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Amount Due</p>
              <div class="amount">$${amountNum.toFixed(2)} USDC</div>
              <p style="margin: 8px 0 0 0; font-size: 14px;"><strong>Deadline:</strong> ${deadline}</p>
              ${paymentReference ? `<p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Reference:</strong> ${paymentReference}</p>` : ''}
            </div>
            ${walletAddress ? `
            <div class="payment-box">
              <p style="margin: 0 0 8px; font-weight: 600;">How to Pay</p>
              <p style="margin: 0;">Send <strong>$${amountNum.toFixed(6)} USDC</strong> on <strong>Base network</strong> to:</p>
              <p style="font-family: monospace; background: #f8f9fa; padding: 8px; border-radius: 4px; word-break: break-all; margin: 8px 0 0;">${walletAddress}</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #666;">Include memo/reference: <strong>${paymentReference || ''}</strong></p>
            </div>` : ''}
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: ${headerColor};">
                  <a href="${resolvedBillingUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Pay Now →</a>
                </td>
              </tr>
            </table>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #ccc; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: isFinalWarning
      ? `🚨 Final Warning: Pay $${amountNum.toFixed(2)} USDC by ${deadline} or bots suspend`
      : `⚠️ Invoice Overdue: $${amountNum.toFixed(2)} USDC due by ${deadline}`,
    html,
    text: `
${isFinalWarning ? 'FINAL WARNING' : 'Invoice Overdue'}

Hi ${name},

${isFinalWarning
  ? `Your invoice of $${amountNum.toFixed(2)} USDC is still unpaid. Your bots will be SUSPENDED on ${deadline} if not paid.`
  : `Your invoice of $${amountNum.toFixed(2)} USDC is overdue. Please pay before ${deadline}.`}

Amount Due: $${amountNum.toFixed(2)} USDC
${paymentReference ? `Reference: ${paymentReference}` : ''}
Deadline: ${deadline}
${walletAddress ? `\nSend to wallet: ${walletAddress}` : ''}

Pay now: ${resolvedBillingUrl}

Best regards,
The NexusMeme Team
    `,
  };
}

/**
 * Invoice Expired Email
 * Sent when a USDC invoice expires without payment
 */
interface InvoiceExpiredProps {
  name?: string;
  amount: number;
  paymentReference: string;
  billingUrl: string;
}

export function InvoiceExpiredEmailTemplate({
  name = 'Trader',
  amount,
  paymentReference,
  billingUrl,
}: InvoiceExpiredProps): EmailTemplate {
  const amountNum = parseFloat(String(amount));
  const resolvedBillingUrl = billingUrl || appUrl('/dashboard/billing');
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6c757d; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .info-box { background: #fff; border-left: 4px solid #6c757d; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 28px; font-weight: bold; color: #6c757d; }
          .btn { display: inline-block; background: #007bff; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; font-size: 16px; }
          h1 { margin: 0; font-size: 24px; }
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
            <h1>🕐 Invoice Expired</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Your performance fee invoice has expired without payment. Your bots have been paused.</p>
            <div class="info-box">
              <p style="margin: 0; color: #666; font-size: 14px;">Expired Invoice</p>
              <div class="amount">$${amountNum.toFixed(2)} USDC</div>
              <p style="margin: 8px 0 0; font-size: 14px;"><strong>Reference:</strong> ${paymentReference}</p>
            </div>
            <p>To resume trading, please visit your billing dashboard to generate a new invoice and make payment. Your bots will resume automatically once payment is confirmed.</p>
            <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="border-radius: 4px; background-color: #007bff;">
                  <a href="${resolvedBillingUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif;">Go to Billing →</a>
                </td>
              </tr>
            </table>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #ccc; text-decoration: none;">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Invoice Expired — ${paymentReference} ($${amountNum.toFixed(2)} USDC)`,
    html,
    text: `
Invoice Expired

Hi ${name},

Your performance fee invoice ${paymentReference} for $${amountNum.toFixed(2)} USDC has expired without payment. Your bots have been paused.

To resume trading, generate a new invoice on your billing dashboard and make payment. Bots resume automatically on confirmation.

Billing: ${resolvedBillingUrl}

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
            <p><a href="${appUrl('/dashboard/billing')}" style="color: #007bff; text-decoration: none; font-weight: 600;">View your billing details →</a></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/support')}" style="color: #007bff; text-decoration: none;">Contact Support</a></p>
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
