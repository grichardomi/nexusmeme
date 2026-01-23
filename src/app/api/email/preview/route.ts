import { NextRequest, NextResponse } from 'next/server';
import { renderEmailTemplate } from '@/email/render';
import { EmailTemplateType } from '@/types/email';

/**
 * Email Preview API
 * GET - Preview email templates for testing/development
 * Only available in development mode
 */

export async function GET(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Email preview only available in development' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const templateType = searchParams.get('type') as EmailTemplateType;
  const format = searchParams.get('format') || 'html'; // html or text

  if (!templateType) {
    return NextResponse.json(
      { error: 'Template type required' },
      { status: 400 }
    );
  }

  // Mock context data for different template types
  const contextMap: Record<EmailTemplateType, any> = {
    welcome: {
      name: 'John Trader',
      verificationUrl: 'https://nexusmeme.com/verify?token=abc123',
    },
    email_verification: {
      name: 'Jane Smith',
      verificationUrl: 'https://nexusmeme.com/verify?token=abc123',
    },
    password_reset: {
      name: 'John Trader',
      resetUrl: 'https://nexusmeme.com/reset?token=xyz789',
    },
    subscription_created: {
      name: 'John Trader',
      plan: 'Pro',
      price: 99,
      period: 'monthly',
      dashboardUrl: 'https://nexusmeme.com/dashboard',
    },
    subscription_upgraded: {
      name: 'John Trader',
      oldPlan: 'Free',
      newPlan: 'Enterprise',
      newPrice: 499,
      period: 'monthly',
    },
    subscription_cancelled: {
      name: 'John Trader',
      plan: 'Pro',
      endDate: '2024-02-15',
    },
    trial_ending: {
      name: 'John Trader',
      trialEndsDate: '2024-02-15',
      daysRemaining: 3,
      upgradePath: 'https://nexusmeme.com/pricing',
    },
    invoice_created: {
      name: 'John Trader',
      invoiceNumber: 'INV-2024-001',
      plan: 'Pro',
      amount: 9900, // in cents
      currency: 'USD',
      period: 'monthly',
      issueDate: '2024-01-15',
      dueDate: '2024-02-15',
      invoiceUrl: 'https://nexusmeme.com/invoices/INV-2024-001',
    },
    bot_created: {
      name: 'John Trader',
      botName: 'Momentum Trader #1',
      strategy: 'Moving Average Crossover',
      exchange: 'Binance',
      dashboardUrl: 'https://nexusmeme.com/dashboard/bots/bot123',
    },
    trade_alert: {
      name: 'John Trader',
      botName: 'Momentum Trader #1',
      pair: 'BTC/USD',
      action: 'BUY',
      price: 45231.5,
      amount: 0.002,
      profit: 150.25,
      dashboardUrl: 'https://nexusmeme.com/dashboard',
    },
    account_settings_changed: {
      name: 'John Trader',
    },
    ticket_created: {
      ticketId: 'TICKET-001',
      subject: 'Problem with bot configuration',
      message: 'I\'m having issues with my bot setup',
      ticketUrl: 'https://nexusmeme.com/support/tickets/TICKET-001',
    },
    ticket_replied: {
      ticketId: 'TICKET-001',
      subject: 'Problem with bot configuration',
      replyMessage: 'We\'ve identified the issue. Please check your configuration settings.',
      ticketUrl: 'https://nexusmeme.com/support/tickets/TICKET-001',
    },
    ticket_resolved: {
      ticketId: 'TICKET-001',
      subject: 'Problem with bot configuration',
      ticketUrl: 'https://nexusmeme.com/support/tickets/TICKET-001',
    },
    new_ticket_admin: {
      ticketId: 'TICKET-001',
      subject: 'Problem with bot configuration',
      userEmail: 'user@example.com',
      message: 'I\'m having issues with my bot setup',
      ticketUrl: 'https://nexusmeme.com/admin/tickets/TICKET-001',
    },
    performance_fee_charged: {
      name: 'John Trader',
      amount: 50.25,
      invoiceId: 'in_1234567890',
      invoiceUrl: 'https://invoice.stripe.com/i/acct_1234567890',
      trades: 3,
    },
    performance_fee_failed: {
      name: 'John Trader',
      amount: 50.25,
      retryCount: 2,
      supportUrl: 'https://nexusmeme.com/support',
    },
    performance_fee_dunning: {
      name: 'John Trader',
      amount: 50.25,
      attemptNumber: 1,
      deadline: '2024-02-15T02:00:00Z',
    },
    performance_fee_adjustment: {
      name: 'John Trader',
      originalAmount: 50.25,
      adjustedAmount: 45.00,
      reason: 'Fee adjustment due to market volatility',
    },
    performance_fee_refund: {
      name: 'John Trader',
      refundAmount: 50.25,
      reason: 'Duplicate charge refund',
    },
    bot_suspended_payment_failure: {
      name: 'John Trader',
      botInstanceId: 'bot_123',
      reason: 'Payment for performance fees failed 3 times',
      action: 'Please update your payment method',
      billingUrl: 'https://nexusmeme.com/dashboard/billing',
    },
    bot_resumed: {
      name: 'John Trader',
      botInstanceId: 'bot_123',
      message: 'Your trading bot has been resumed after payment was successfully processed',
    },
    trial_ending_performance_fees: {
      name: 'John Trader',
      trialEndsDate: '2024-02-15',
      daysRemaining: 3,
      performanceFeePercent: 5,
      addPaymentPath: 'https://nexusmeme.com/dashboard/billing/payment-methods?returnTo=trading',
    },
    trial_ending_soon_performance_fees: {
      name: 'John Trader',
      trialEndsDate: '2024-02-15',
      daysRemaining: 1,
      performanceFeePercent: 5,
      addPaymentPath: 'https://nexusmeme.com/dashboard/billing/payment-methods?returnTo=trading',
    },
    trial_ending_soon_add_payment: {
      name: 'John Trader',
      trialEndsDate: '2024-02-15',
      daysRemaining: 1,
      performanceFeePercent: 5,
      setupPaymentPath: 'https://nexusmeme.com/dashboard/billing/payment-methods?setup=true',
    },
  };

  const context = contextMap[templateType];
  if (!context) {
    return NextResponse.json(
      { error: `Unknown template type: ${templateType}` },
      { status: 400 }
    );
  }

  try {
    const template = renderEmailTemplate(templateType, context);

    if (format === 'text') {
      return new NextResponse(template.text || template.html, {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Return HTML with style wrapper for preview
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${template.subject}</title>
          <style>
            body { margin: 0; padding: 20px; background: #f5f5f5; font-family: sans-serif; }
            .preview-container { background: white; max-width: 600px; margin: 0 auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .preview-header { background: #f9f9f9; padding: 20px; border-bottom: 1px solid #eee; }
            .preview-header h1 { margin: 0; font-size: 18px; }
            .preview-content { padding: 0; }
            .preview-footer { background: #f9f9f9; padding: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="preview-container">
            <div class="preview-header">
              <h1>Email Preview</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
                <strong>Type:</strong> ${templateType}<br>
                <strong>Subject:</strong> ${template.subject}
              </p>
            </div>
            <div class="preview-content">
              ${template.html}
            </div>
            <div class="preview-footer">
              <p style="margin: 0;">This is a preview of the email template. This is not an actual email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error rendering template:', error);
    return NextResponse.json(
      { error: 'Failed to render template' },
      { status: 500 }
    );
  }
}

/**
 * List available email templates
 */
export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Email preview only available in development' },
      { status: 403 }
    );
  }

  const templates: EmailTemplateType[] = [
    'welcome',
    'email_verification',
    'password_reset',
    'subscription_created',
    'subscription_upgraded',
    'subscription_cancelled',
    'trial_ending',
    'invoice_created',
    'bot_created',
    'trade_alert',
    'account_settings_changed',
    'ticket_created',
    'ticket_replied',
    'ticket_resolved',
    'new_ticket_admin',
    'performance_fee_charged',
    'performance_fee_failed',
    'performance_fee_dunning',
    'performance_fee_adjustment',
    'performance_fee_refund',
    'bot_suspended_payment_failure',
    'bot_resumed',
  ];

  return NextResponse.json({
    templates,
    message: 'Use GET /api/email/preview?type=<template-type> to preview a template',
  });
}
