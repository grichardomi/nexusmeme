/**
 * Email Template Renderer
 * Renders email templates based on type and context
 */

import type {
  EmailTemplate,
  EmailTemplateType,
  EmailContext,
  WelcomeEmailContext,
  PasswordResetEmailContext,
  SubscriptionCreatedContext,
  SubscriptionUpgradedContext,
  SubscriptionCancelledContext,
  TrialEndingContext,
  TrialEndingPerformanceFeesContext,
  InvoiceEmailContext,
  BotCreatedContext,
  TradeAlertContext,
  AccountSettingsChangedContext,
  TicketCreatedContext,
  TicketRepliedContext,
  TicketResolvedContext,
  NewTicketAdminContext,
  PerformanceFeeChargedContext,
  PerformanceFeeFailedContext,
  PerformanceFeeDunningContext,
  PerformanceFeeAdjustmentContext,
  PerformanceFeeRefundContext,
  BotSuspensionContext,
  BotResumedContext,
} from '@/types/email';
import { WelcomeEmailTemplate } from './templates/welcome';
import { PasswordResetEmailTemplate } from './templates/password-reset';
import {
  SubscriptionCreatedEmailTemplate,
  SubscriptionUpgradedEmailTemplate,
  SubscriptionCancelledEmailTemplate,
} from './templates/subscription';
import {
  TrialEndingEmailTemplate,
  TrialEndingPerformanceFeesEmailTemplate,
  TrialEndingSoonPerformanceFeesEmailTemplate,
  TrialEndingSoonAddPaymentEmailTemplate,
} from './templates/trial-ending';
import { InvoiceEmailTemplate } from './templates/invoice';
import { BotCreatedEmailTemplate, TradeAlertEmailTemplate } from './templates/bot-alerts';
import {
  TicketCreatedEmailTemplate,
  TicketRepliedEmailTemplate,
  NewTicketAdminEmailTemplate,
} from './templates/support-tickets';
import {
  PerformanceFeeChargedEmailTemplate,
  PerformanceFeeFailedEmailTemplate,
  FeeAdjustmentEmailTemplate,
} from './templates/performance-fees';

/**
 * Render email template based on type
 */
export function renderEmailTemplate(
  type: EmailTemplateType,
  context: EmailContext
): EmailTemplate {
  switch (type) {
    case 'welcome': {
      const ctx = context as WelcomeEmailContext;
      return WelcomeEmailTemplate({
        name: ctx.name || '',
        verificationUrl: ctx.verificationUrl,
      });
    }

    case 'email_verification': {
      const ctx = context as WelcomeEmailContext;
      return WelcomeEmailTemplate({
        name: ctx.name || '',
        verificationUrl: ctx.verificationUrl,
      });
    }

    case 'password_reset': {
      const ctx = context as PasswordResetEmailContext;
      return PasswordResetEmailTemplate({
        name: ctx.name || '',
        resetUrl: ctx.resetUrl,
      });
    }

    case 'subscription_created': {
      const ctx = context as SubscriptionCreatedContext;
      return SubscriptionCreatedEmailTemplate({
        name: ctx.name || '',
        plan: ctx.plan,
        price: ctx.price,
        period: ctx.period,
        dashboardUrl: ctx.dashboardUrl,
      });
    }

    case 'subscription_upgraded': {
      const ctx = context as SubscriptionUpgradedContext;
      return SubscriptionUpgradedEmailTemplate({
        name: ctx.name || '',
        oldPlan: ctx.oldPlan,
        newPlan: ctx.newPlan,
        newPrice: ctx.newPrice,
        period: ctx.period,
      });
    }

    case 'subscription_cancelled': {
      const ctx = context as SubscriptionCancelledContext;
      return SubscriptionCancelledEmailTemplate({
        name: ctx.name || '',
        plan: ctx.plan,
        endDate: ctx.endDate,
      });
    }

    case 'trial_ending': {
      const ctx = context as TrialEndingContext;
      return TrialEndingEmailTemplate({
        name: ctx.name || '',
        trialEndsDate: ctx.trialEndsDate,
        daysRemaining: ctx.daysRemaining,
        upgradePath: ctx.upgradePath,
      });
    }

    case 'trial_ending_performance_fees': {
      const ctx = context as TrialEndingPerformanceFeesContext;
      return TrialEndingPerformanceFeesEmailTemplate({
        name: ctx.name || '',
        trialEndsDate: ctx.trialEndsDate,
        daysRemaining: ctx.daysRemaining,
        performanceFeePercent: ctx.performanceFeePercent,
        addPaymentPath: ctx.addPaymentPath,
      });
    }

    case 'trial_ending_soon_performance_fees': {
      const ctx = context as TrialEndingPerformanceFeesContext;
      return TrialEndingSoonPerformanceFeesEmailTemplate({
        name: ctx.name || '',
        trialEndsDate: ctx.trialEndsDate,
        daysRemaining: ctx.daysRemaining,
        performanceFeePercent: ctx.performanceFeePercent,
        addPaymentPath: ctx.addPaymentPath,
      });
    }

    case 'trial_ending_soon_add_payment': {
      const ctx = context as TrialEndingPerformanceFeesContext;
      return TrialEndingSoonAddPaymentEmailTemplate({
        name: ctx.name || '',
        trialEndsDate: ctx.trialEndsDate,
        daysRemaining: ctx.daysRemaining,
        performanceFeePercent: ctx.performanceFeePercent,
        setupPaymentPath: ctx.addPaymentPath,
      });
    }

    case 'invoice_created': {
      const ctx = context as InvoiceEmailContext;
      return InvoiceEmailTemplate({
        name: ctx.name || '',
        invoiceNumber: ctx.invoiceNumber,
        plan: ctx.plan,
        amount: ctx.amount,
        currency: ctx.currency || 'USD',
        period: ctx.period,
        issueDate: ctx.issueDate,
        dueDate: ctx.dueDate,
        invoiceUrl: ctx.invoiceUrl,
      });
    }

    case 'bot_created': {
      const ctx = context as BotCreatedContext;
      return BotCreatedEmailTemplate({
        name: ctx.name || '',
        botName: ctx.botName,
        strategy: ctx.strategy,
        exchange: ctx.exchange,
        dashboardUrl: ctx.dashboardUrl,
      });
    }

    case 'trade_alert': {
      const ctx = context as TradeAlertContext;
      return TradeAlertEmailTemplate({
        name: ctx.name || '',
        botName: ctx.botName,
        pair: ctx.pair,
        action: ctx.action,
        price: ctx.price,
        amount: ctx.amount,
        profit: ctx.profit,
        dashboardUrl: ctx.dashboardUrl,
      });
    }

    case 'account_settings_changed': {
      const ctx = context as AccountSettingsChangedContext;
      return {
        subject: 'Your Account Settings Have Changed',
        html: `
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, sans-serif;">
              <p>Hi ${ctx.name || 'Trader'},</p>
              <p>Your account settings were recently updated.</p>
              <p>If you didn&apos;t make these changes, please log in to your account and review your settings immediately.</p>
              <p>Best regards,<br>The NexusMeme Team</p>
            </body>
          </html>
        `,
        text: `Hi ${ctx.name || 'Trader'},\n\nYour account settings were recently updated.\n\nIf you didn't make these changes, please log in and review your settings.\n\nBest regards,\nThe NexusMeme Team`,
      };
    }

    case 'ticket_created': {
      const ctx = context as TicketCreatedContext;
      return TicketCreatedEmailTemplate({
        name: ctx.name,
        ticketId: ctx.ticketId,
        subject: ctx.subject,
        ticketUrl: ctx.ticketUrl,
      });
    }

    case 'ticket_replied': {
      const ctx = context as TicketRepliedContext;
      return TicketRepliedEmailTemplate({
        name: ctx.name,
        ticketId: ctx.ticketId,
        subject: ctx.subject,
        replyMessage: ctx.replyMessage,
        ticketUrl: ctx.ticketUrl,
      });
    }

    case 'ticket_resolved': {
      const ctx = context as TicketResolvedContext;
      return TicketRepliedEmailTemplate({
        name: ctx.name,
        ticketId: ctx.ticketId,
        subject: ctx.subject,
        replyMessage: `Your ticket has been resolved:\n\n${ctx.resolution}`,
        ticketUrl: ctx.ticketUrl,
      });
    }

    case 'new_ticket_admin': {
      const ctx = context as NewTicketAdminContext;
      return NewTicketAdminEmailTemplate({
        name: ctx.name,
        ticketId: ctx.ticketId,
        subject: ctx.subject,
        priority: ctx.priority,
        userEmail: ctx.userEmail,
        ticketUrl: ctx.ticketUrl,
      });
    }

    case 'performance_fee_charged': {
      const ctx = context as PerformanceFeeChargedContext;
      return PerformanceFeeChargedEmailTemplate({
        name: ctx.name,
        amount: ctx.amount,
        invoiceId: ctx.invoiceId,
        invoiceUrl: ctx.invoiceUrl,
        trades: ctx.trades || 1,
      });
    }

    case 'performance_fee_failed': {
      const ctx = context as PerformanceFeeFailedContext;
      return PerformanceFeeFailedEmailTemplate({
        name: ctx.name,
        amount: ctx.amount,
        retryCount: ctx.retryCount,
        supportUrl: ctx.supportUrl,
      });
    }

    case 'performance_fee_dunning': {
      const ctx = context as PerformanceFeeDunningContext;
      return PerformanceFeeFailedEmailTemplate({
        name: ctx.name,
        amount: ctx.amount,
        retryCount: ctx.attemptNumber,
        supportUrl: process.env.NEXTAUTH_URL,
      });
    }

    case 'performance_fee_adjustment': {
      const ctx = context as PerformanceFeeAdjustmentContext;
      return FeeAdjustmentEmailTemplate({
        name: ctx.name,
        originalAmount: ctx.originalAmount,
        adjustedAmount: ctx.adjustedAmount,
        reason: ctx.reason,
      });
    }

    case 'performance_fee_refund': {
      const ctx = context as PerformanceFeeRefundContext;
      return {
        subject: 'Performance Fee Refunded',
        html: `
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;">
              <p>Hi ${ctx.name || 'Trader'},</p>
              <p>We've processed a refund of <strong>$${ctx.refundAmount.toFixed(2)}</strong> to your payment method.</p>
              <p><strong>Reason:</strong> ${ctx.reason}</p>
              <p>The refund should appear within 5-10 business days.</p>
              <p>Best regards,<br>The NexusMeme Team</p>
            </body>
          </html>
        `,
        text: `Hi ${ctx.name || 'Trader'},\n\nWe've refunded $${ctx.refundAmount.toFixed(2)} to your payment method.\n\nReason: ${ctx.reason}\n\nBest regards,\nThe NexusMeme Team`,
      };
    }

    case 'bot_suspended_payment_failure': {
      const ctx = context as BotSuspensionContext;
      return {
        subject: 'Trading Bot Suspended - Payment Issue',
        html: `
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;">
              <p>Hi ${ctx.name || 'Trader'},</p>
              <p>Your trading bot has been suspended due to payment failures.</p>
              <p><strong>Reason:</strong> ${ctx.reason || 'Multiple payment attempts failed'}</p>
              <p><strong>Action Required:</strong> ${ctx.action || 'Please update your payment method to restore trading'}</p>
              <p><a href="${ctx.billingUrl || `${process.env.NEXTAUTH_URL}/dashboard/billing`}" style="background-color: #ff6b6b; color: white; padding: 10px 20px; text-decoration: none; display: inline-block;">Update Payment Method</a></p>
              <p>Best regards,<br>The NexusMeme Team</p>
            </body>
          </html>
        `,
        text: `Hi ${ctx.name || 'Trader'},\n\nYour trading bot has been suspended due to payment failures.\n\nReason: ${ctx.reason || 'Multiple payment attempts failed'}\n\nAction: ${ctx.action || 'Please update your payment method'}\n\nBest regards,\nThe NexusMeme Team`,
      };
    }

    case 'bot_resumed': {
      const ctx = context as BotResumedContext;
      return {
        subject: 'Trading Bot Resumed',
        html: `
          <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;">
              <p>Hi ${ctx.name || 'Trader'},</p>
              <p>${ctx.message || 'Your trading bot has been resumed after payment was successfully processed.'}</p>
              <p>Your bot is now actively trading again.</p>
              <p>Best regards,<br>The NexusMeme Team</p>
            </body>
          </html>
        `,
        text: `Hi ${ctx.name || 'Trader'},\n\n${ctx.message || 'Your trading bot has been resumed.'}\n\nYour bot is now actively trading again.\n\nBest regards,\nThe NexusMeme Team`,
      };
    }

    default:
      throw new Error(`Unknown email template type: ${type}`);
  }
}
