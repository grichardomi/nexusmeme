import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

interface InvoiceEmailProps {
  name: string;
  invoiceNumber: string;
  plan: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'yearly';
  issueDate: string;
  dueDate: string;
  invoiceUrl: string;
}

export function InvoiceEmailTemplate({
  name,
  invoiceNumber,
  plan,
  amount,
  currency,
  period,
  issueDate,
  dueDate,
  invoiceUrl,
}: InvoiceEmailProps): EmailTemplate {
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
          .content { background: white; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .invoice-box { border: 1px solid #ddd; margin: 20px 0; padding: 20px; border-radius: 8px; }
          .invoice-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .invoice-row.total { border-bottom: 2px solid #333; font-weight: bold; font-size: 18px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
          p { margin: 10px 0; }
          .label { color: #666; font-size: 14px; }
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
            <h1>📄 Invoice #${invoiceNumber}</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>Your invoice for your NexusMeme ${plan} plan subscription is ready.</p>

            <div class="invoice-box">
              <div class="invoice-row">
                <span>Invoice Number:</span>
                <strong>${invoiceNumber}</strong>
              </div>
              <div class="invoice-row">
                <span>Invoice Date:</span>
                <strong>${issueDate}</strong>
              </div>
              <div class="invoice-row">
                <span>Due Date:</span>
                <strong>${dueDate}</strong>
              </div>
              <div class="invoice-row">
                <span>Description:</span>
                <strong>${plan} Plan (${period})</strong>
              </div>
              <div class="invoice-row total">
                <span>Amount Due:</span>
                <strong>${currency} ${(amount / 100).toFixed(2)}</strong>
              </div>
            </div>

            <p style="text-align: center;">
              <a href="${invoiceUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">View Full Invoice</a>
            </p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

            <h3>Payment Information</h3>
            <p>Your payment is automatically charged to the payment method on file. If you need to update your payment information, you can do so in your account settings.</p>

            <h3>Need Help?</h3>
            <p>If you have any questions about this invoice, please contact <a href="mailto:billing@nexusmeme.com">billing@nexusmeme.com</a>.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/billing" style="color: #667eea; text-decoration: none;">Billing Portal</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: `Invoice #${invoiceNumber} - NexusMeme ${plan} Plan`,
    html,
    text: `
Invoice #${invoiceNumber}

Hi ${name || 'Trader'},

Here's your invoice for your NexusMeme ${plan} plan.

Invoice Number: ${invoiceNumber}
Invoice Date: ${issueDate}
Due Date: ${dueDate}
Description: ${plan} Plan (${period})
Amount: ${currency} ${(amount / 100).toFixed(2)}

View your full invoice: ${invoiceUrl}

Best regards,
The NexusMeme Team
    `,
  };
}
