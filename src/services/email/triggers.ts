/**
 * Email Triggers
 * Functions that trigger email sending based on user events
 */

import { queueEmail } from './queue';
import { EmailContext } from '@/types/email';

/**
 * Send welcome email after signup
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  verificationUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    verificationUrl,
  };

  return queueEmail('welcome', email, context);
}

/**
 * Send email verification email
 */
export async function sendEmailVerificationEmail(
  email: string,
  name: string,
  verificationUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    verificationUrl,
  };

  return queueEmail('email_verification', email, context);
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    resetUrl,
  };

  return queueEmail('password_reset', email, context);
}

/**
 * Send subscription created email
 */
export async function sendSubscriptionCreatedEmail(
  email: string,
  name: string,
  plan: string,
  price: number,
  period: 'monthly' | 'yearly',
  dashboardUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    plan,
    price,
    period,
    dashboardUrl,
  };

  return queueEmail('subscription_created', email, context);
}

/**
 * Send subscription upgraded email
 */
export async function sendSubscriptionUpgradedEmail(
  email: string,
  name: string,
  oldPlan: string,
  newPlan: string,
  newPrice: number,
  period: 'monthly' | 'yearly'
): Promise<string> {
  const context: EmailContext = {
    name,
    oldPlan,
    newPlan,
    newPrice,
    period,
  };

  return queueEmail('subscription_upgraded', email, context);
}

/**
 * Send subscription cancelled email
 */
export async function sendSubscriptionCancelledEmail(
  email: string,
  name: string,
  plan: string,
  endDate: string
): Promise<string> {
  const context: EmailContext = {
    name,
    plan,
    endDate,
  };

  return queueEmail('subscription_cancelled', email, context);
}

/**
 * Send invoice email
 */
export async function sendInvoiceEmail(
  email: string,
  name: string,
  invoiceNumber: string,
  plan: string,
  amount: number,
  currency: string,
  period: 'monthly' | 'yearly',
  issueDate: string,
  dueDate: string,
  invoiceUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    invoiceNumber,
    plan,
    amount,
    currency,
    period,
    issueDate,
    dueDate,
    invoiceUrl,
  };

  return queueEmail('invoice_created', email, context);
}

/**
 * Send bot created email
 */
export async function sendBotCreatedEmail(
  email: string,
  name: string,
  botName: string,
  strategy: string,
  exchange: string,
  dashboardUrl: string
): Promise<string> {
  const context: EmailContext = {
    name,
    botName,
    strategy,
    exchange,
    dashboardUrl,
  };

  return queueEmail('bot_created', email, context);
}

/**
 * Send trade alert email
 */
export async function sendTradeAlertEmail(
  email: string,
  name: string,
  botName: string,
  pair: string,
  action: 'BUY' | 'SELL',
  price: number,
  amount: number,
  dashboardUrl: string,
  profit?: number
): Promise<string> {
  const context: EmailContext = {
    name,
    botName,
    pair,
    action,
    price,
    amount,
    profit,
    dashboardUrl,
  };

  return queueEmail('trade_alert', email, context);
}

/**
 * Send account settings changed email
 */
export async function sendAccountSettingsChangedEmail(
  email: string,
  name: string
): Promise<string> {
  const context: EmailContext = {
    name,
  };

  return queueEmail('account_settings_changed', email, context);
}

/**
 * Send ticket created confirmation email to user
 */
export async function sendTicketCreatedEmail(
  email: string,
  name: string,
  ticketId: string,
  subject: string
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const ticketUrl = `${appUrl}/dashboard/support/${ticketId}`;

  const context: EmailContext = {
    name,
    ticketId,
    subject,
    ticketUrl,
  };

  return queueEmail('ticket_created', email, context);
}

/**
 * Send new ticket notification to admin
 */
export async function sendNewTicketAdminEmail(
  adminEmail: string,
  ticketId: string,
  userEmail: string,
  subject: string,
  priority: string
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const ticketUrl = `${appUrl}/admin/tickets/${ticketId}`;

  const context: EmailContext = {
    ticketId,
    userEmail,
    subject,
    priority,
    ticketUrl,
  };

  return queueEmail('new_ticket_admin', adminEmail, context);
}

/**
 * Send ticket reply notification to user
 */
export async function sendTicketRepliedEmail(
  email: string,
  name: string,
  ticketId: string,
  subject: string,
  replyMessage: string
): Promise<string> {
  const context: EmailContext = {
    name,
    ticketId,
    subject,
    replyMessage,
  };

  return queueEmail('ticket_replied', email, context);
}

/**
 * Send performance fee charged email
 */
export async function sendPerformanceFeeChargedEmail(
  email: string,
  name: string,
  amount: number,
  invoiceId: string,
  invoiceUrl?: string,
  trades?: number
): Promise<string> {
  const context: EmailContext = {
    name,
    amount,
    invoiceId,
    invoiceUrl,
    trades: trades || 1,
  };

  return queueEmail('performance_fee_charged', email, context);
}

/**
 * Send performance fee failed email
 */
export async function sendPerformanceFeeFailedEmail(
  email: string,
  name: string,
  amount: number,
  retryCount?: number
): Promise<string> {
  const context: EmailContext = {
    name,
    amount,
    retryCount: retryCount || 1,
  };

  return queueEmail('performance_fee_failed', email, context);
}

/**
 * Send performance fee dunning email (payment retry)
 */
export async function sendPerformanceFeeDunningEmail(
  email: string,
  name: string,
  amount: number,
  attemptNumber: number,
  deadline: string
): Promise<string> {
  const context: EmailContext = {
    name,
    amount,
    attemptNumber,
    deadline,
  };

  return queueEmail('performance_fee_dunning', email, context);
}

/**
 * Send fee adjustment email
 */
export async function sendFeeAdjustmentEmail(
  email: string,
  name: string,
  originalAmount: number,
  adjustedAmount: number,
  reason: string
): Promise<string> {
  const context: EmailContext = {
    name,
    originalAmount,
    adjustedAmount,
    reason,
  };

  return queueEmail('performance_fee_adjustment', email, context);
}

/**
 * Send fee refund email
 */
export async function sendFeeRefundEmail(
  email: string,
  name: string,
  refundAmount: number,
  reason: string
): Promise<string> {
  const context: EmailContext = {
    name,
    refundAmount,
    reason,
  };

  return queueEmail('performance_fee_refund', email, context);
}

/**
 * Send bot suspended email (payment failure)
 */
export async function sendBotSuspendedEmail(
  email: string,
  name: string,
  botInstanceId: string,
  reason?: string,
  action?: string,
  billingUrl?: string
): Promise<string> {
  const context: EmailContext = {
    name,
    botInstanceId,
    reason,
    action,
    billingUrl,
  };

  return queueEmail('bot_suspended_payment_failure', email, context);
}

/**
 * Send bot resumed email
 */
export async function sendBotResumedEmail(
  email: string,
  name: string,
  botInstanceId: string,
  message?: string
): Promise<string> {
  const context: EmailContext = {
    name,
    botInstanceId,
    message,
  };

  return queueEmail('bot_resumed', email, context);
}
