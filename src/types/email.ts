/**
 * Email Types
 * Type definitions for email templates and delivery
 */

export type EmailTemplateType =
  | 'welcome'
  | 'email_verification'
  | 'password_reset'
  | 'subscription_created'
  | 'subscription_upgraded'
  | 'subscription_cancelled'
  | 'trial_ending'
  | 'trial_ending_performance_fees'
  | 'trial_ending_soon_performance_fees'
  | 'trial_ending_soon_add_payment'
  | 'invoice_created'
  | 'bot_created'
  | 'trade_alert'
  | 'account_settings_changed'
  | 'ticket_created'
  | 'ticket_replied'
  | 'ticket_resolved'
  | 'new_ticket_admin'
  | 'performance_fee_charged'
  | 'performance_fee_failed'
  | 'performance_fee_dunning'
  | 'performance_fee_adjustment'
  | 'performance_fee_refund'
  | 'bot_suspended_payment_failure'
  | 'bot_resumed'
  | 'upcoming_billing';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface WelcomeEmailContext {
  name?: string;
  verificationUrl: string;
}

export interface PasswordResetEmailContext {
  name?: string;
  resetUrl: string;
}

export interface SubscriptionCreatedContext {
  name?: string;
  plan: string;
  price: number;
  period: 'monthly' | 'yearly';
  dashboardUrl: string;
}

export interface SubscriptionUpgradedContext {
  name?: string;
  oldPlan: string;
  newPlan: string;
  newPrice: number;
  period: 'monthly' | 'yearly';
}

export interface SubscriptionCancelledContext {
  name?: string;
  plan: string;
  endDate: string;
}

export interface TrialEndingContext {
  name?: string;
  trialEndsDate: string;
  daysRemaining: number;
  upgradePath: string;
}

export interface TrialEndingPerformanceFeesContext {
  name?: string;
  trialEndsDate: string;
  daysRemaining: number;
  performanceFeePercent: number;
  addPaymentPath: string;
}

export interface InvoiceEmailContext {
  name?: string;
  invoiceNumber: string;
  plan: string;
  amount: number;
  currency?: string;
  period: 'monthly' | 'yearly';
  issueDate: string;
  dueDate: string;
  invoiceUrl: string;
}

export interface BotCreatedContext {
  name?: string;
  botName: string;
  strategy: string;
  exchange: string;
  dashboardUrl: string;
}

export interface TradeAlertContext {
  name?: string;
  botName: string;
  pair: string;
  action: 'BUY' | 'SELL';
  price: number;
  amount: number;
  profit?: number;
  dashboardUrl: string;
}

export interface AccountSettingsChangedContext {
  name?: string;
}

export interface TicketCreatedContext {
  name?: string;
  ticketId: string;
  subject: string;
  ticketUrl: string;
}

export interface TicketRepliedContext {
  name?: string;
  ticketId: string;
  subject: string;
  replyMessage: string;
  ticketUrl: string;
}

export interface TicketResolvedContext {
  name?: string;
  ticketId: string;
  subject: string;
  resolution: string;
  ticketUrl: string;
}

export interface NewTicketAdminContext {
  name?: string;
  ticketId: string;
  subject: string;
  priority: string;
  userEmail: string;
  ticketUrl: string;
}

export interface PerformanceFeeChargedContext {
  name?: string;
  amount: number;
  invoiceId: string;
  invoiceUrl?: string;
  trades?: number;
}

export interface PerformanceFeeFailedContext {
  name?: string;
  amount: number;
  retryCount?: number;
  supportUrl?: string;
}

export interface PerformanceFeeDunningContext {
  name?: string;
  amount: number;
  attemptNumber: number;
  deadline: string;
}

export interface PerformanceFeeAdjustmentContext {
  name?: string;
  originalAmount: number;
  adjustedAmount: number;
  reason: string;
}

export interface PerformanceFeeRefundContext {
  name?: string;
  refundAmount: number;
  reason: string;
}

export interface UpcomingBillingContext {
  name?: string;
  totalPendingFees: number;
  tradeCount: number;
  billingDate: string;
  billingUrl: string;
}

export interface BotSuspensionContext {
  name?: string;
  botInstanceId: string;
  reason?: string;
  action?: string;
  billingUrl?: string;
}

export interface BotResumedContext {
  name?: string;
  botInstanceId: string;
  message?: string;
}

export type EmailContext =
  | WelcomeEmailContext
  | PasswordResetEmailContext
  | SubscriptionCreatedContext
  | SubscriptionUpgradedContext
  | SubscriptionCancelledContext
  | TrialEndingContext
  | TrialEndingPerformanceFeesContext
  | InvoiceEmailContext
  | BotCreatedContext
  | TradeAlertContext
  | AccountSettingsChangedContext
  | TicketCreatedContext
  | TicketRepliedContext
  | TicketResolvedContext
  | NewTicketAdminContext
  | PerformanceFeeChargedContext
  | PerformanceFeeFailedContext
  | PerformanceFeeDunningContext
  | PerformanceFeeAdjustmentContext
  | PerformanceFeeRefundContext
  | UpcomingBillingContext
  | BotSuspensionContext
  | BotResumedContext;

export interface EmailJob {
  id: string;
  type: EmailTemplateType;
  to: string;
  context: EmailContext;
  status: 'pending' | 'sent' | 'failed';
  retries: number;
  createdAt: Date;
  sentAt?: Date;
  error?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}
