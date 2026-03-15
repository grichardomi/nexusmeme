/**
 * Email Template Renderer
 * Renders email templates based on type and context
 */

import type {
  EmailTemplate,
  EmailTemplateType,
  EmailContext,
  LoginAlertContext,
  FeeRateChangedContext,
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
  UpcomingBillingContext,
  BotSuspensionContext,
  BotResumedContext,
  TrialStartedContext,
  InvoiceExpiredContext,
} from '@/types/email';
import { WelcomeEmailTemplate } from './templates/welcome';
import { PasswordResetEmailTemplate } from './templates/password-reset';
import {
  SubscriptionCreatedEmailTemplate,
  SubscriptionUpgradedEmailTemplate,
  SubscriptionCancelledEmailTemplate,
  TrialStartedEmailTemplate,
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
  PerformanceFeeRefundEmailTemplate,
  PerformanceFeeDunningEmailTemplate,
  InvoiceExpiredEmailTemplate,
  FeeAdjustmentEmailTemplate,
  UpcomingBillingEmailTemplate,
} from './templates/performance-fees';
import {
  BotSuspendedEmailTemplate,
  BotResumedEmailTemplate,
} from './templates/bot-lifecycle';
import { LoginAlertEmailTemplate } from './templates/login-alert';

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
        feePercent: ctx.feePercent,
      });
    }

    case 'email_verification': {
      const ctx = context as WelcomeEmailContext;
      return WelcomeEmailTemplate({
        name: ctx.name || '',
        verificationUrl: ctx.verificationUrl,
        feePercent: ctx.feePercent,
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
        feePercent: ctx.feePercent,
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
        feePercent: ctx.feePercent ?? 6,
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
      return PerformanceFeeDunningEmailTemplate({
        name: ctx.name,
        amount: ctx.amount,
        attemptNumber: ctx.attemptNumber,
        deadline: ctx.deadline,
        daysUntilSuspension: ctx.daysUntilSuspension,
        walletAddress: ctx.walletAddress,
        paymentReference: ctx.paymentReference,
        billingUrl: ctx.billingUrl,
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
      return PerformanceFeeRefundEmailTemplate({
        name: ctx.name,
        refundAmount: ctx.refundAmount,
        reason: ctx.reason,
      });
    }

    case 'bot_suspended_payment_failure': {
      const ctx = context as BotSuspensionContext;
      return BotSuspendedEmailTemplate({
        name: ctx.name,
        botInstanceId: ctx.botInstanceId,
        reason: ctx.reason,
        action: ctx.action,
        billingUrl: ctx.billingUrl,
      });
    }

    case 'upcoming_billing': {
      const ctx = context as UpcomingBillingContext;
      return UpcomingBillingEmailTemplate({
        name: ctx.name,
        totalPendingFees: ctx.totalPendingFees,
        tradeCount: ctx.tradeCount,
        billingDate: ctx.billingDate,
        billingUrl: ctx.billingUrl,
        feePercent: ctx.feePercent,
      });
    }

    case 'bot_resumed': {
      const ctx = context as BotResumedContext;
      return BotResumedEmailTemplate({
        name: ctx.name,
        botInstanceId: ctx.botInstanceId,
        message: ctx.message,
      });
    }

    case 'trial_started': {
      const ctx = context as TrialStartedContext;
      return TrialStartedEmailTemplate({
        name: ctx.name,
        trialDays: ctx.trialDays,
        trialEndsAt: ctx.trialEndsAt,
        dashboardUrl: ctx.dashboardUrl,
      });
    }

    case 'invoice_expired': {
      const ctx = context as InvoiceExpiredContext;
      return InvoiceExpiredEmailTemplate({
        name: ctx.name,
        amount: ctx.amount,
        paymentReference: ctx.paymentReference,
        billingUrl: ctx.billingUrl,
      });
    }

    case 'fee_rate_changed': {
      const ctx = context as FeeRateChangedContext;
      const direction = ctx.newRatePct > ctx.prevRatePct ? 'increased' : 'decreased';
      return {
        subject: `Your Performance Fee Rate Has Been Updated — ${ctx.newRatePct.toFixed(1)}%`,
        html: `
          <!DOCTYPE html><html><head><meta charset="utf-8">
          <style>
            body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333}
            .container{max-width:600px;margin:0 auto;padding:20px}
            .header{background:#007bff;color:white;padding:40px 20px;text-align:center;border-radius:8px 8px 0 0}
            .content{background:#f9f9f9;padding:40px 20px}
            .footer{background:#333;color:white;padding:20px;text-align:center;font-size:12px;border-radius:0 0 8px 8px}
            .rate-box{background:white;border:2px solid #007bff;padding:20px;border-radius:8px;margin:20px 0;display:flex;justify-content:space-between;align-items:center}
            .rate{font-size:28px;font-weight:bold}
            .old{color:#999;text-decoration:line-through}
            .new{color:#007bff}
            p{margin:10px 0}
          </style></head><body>
          <div class="container">
            <div class="header"><h1 style="margin:0;font-size:24px">📋 Performance Fee Rate Update</h1></div>
            <div class="content">
              <p>Hi ${ctx.name || 'Trader'},</p>
              <p>Your performance fee rate has been <strong>${direction}</strong>.</p>
              <div class="rate-box">
                <div><div style="font-size:12px;color:#666;margin-bottom:4px">Previous Rate</div><div class="rate old">${ctx.prevRatePct.toFixed(1)}%</div></div>
                <div style="font-size:24px;color:#ccc">→</div>
                <div><div style="font-size:12px;color:#666;margin-bottom:4px">New Rate</div><div class="rate new">${ctx.newRatePct.toFixed(1)}%</div></div>
              </div>
              ${ctx.reason ? `<p><strong>Note:</strong> ${ctx.reason}</p>` : ''}
              <p>This rate applies to all future profitable trades. You only pay when your bot earns.</p>
            </div>
            <div class="footer"><p>&copy; 2024 NexusMeme. All rights reserved.</p></div>
          </div></body></html>`,
        text: `Performance Fee Rate Updated\n\nHi ${ctx.name || 'Trader'},\n\nYour performance fee rate has been ${direction} from ${ctx.prevRatePct.toFixed(1)}% to ${ctx.newRatePct.toFixed(1)}%.\n\n${ctx.reason || ''}\n\nThe NexusMeme Team`,
      };
    }

    case 'login_alert': {
      const ctx = context as LoginAlertContext;
      return LoginAlertEmailTemplate({
        name: ctx.name,
        attemptCount: ctx.attemptCount,
        isLocked: ctx.isLocked,
        lockedUntil: ctx.lockedUntil,
        resetUrl: ctx.resetUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/auth/forgot-password`,
        ipAddress: ctx.ipAddress,
      });
    }

    default:
      throw new Error(`Unknown email template type: ${type}`);
  }
}
