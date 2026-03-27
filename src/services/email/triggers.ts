/**
 * Email Triggers
 * Functions that trigger email sending based on user events
 */

import { queueEmail } from './queue';
import { EmailContext } from '@/types/email';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

async function getDefaultFeePercent(): Promise<number> {
  try {
    const rows = await query("SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'", []);
    if (rows[0]) return parseFloat(String(rows[0].value)) * 100;
  } catch {
    console.warn('[email/triggers] WARNING: DB unavailable — using PERFORMANCE_FEE_RATE env fallback for email. Fee may not reflect admin-configured value.');
  }
  const env = getEnvironmentConfig();
  return env.PERFORMANCE_FEE_RATE * 100;
}

/**
 * Send welcome email after signup
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  verificationUrl: string
): Promise<string> {
  const feePercent = await getDefaultFeePercent();
  const context: EmailContext = {
    name,
    verificationUrl,
    feePercent,
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
  trades?: number,
  feePercent?: number
): Promise<string> {
  const resolvedFeePercent = feePercent ?? await getDefaultFeePercent();
  const context: EmailContext = {
    name,
    amount,
    invoiceId,
    invoiceUrl,
    trades: trades || 1,
    feePercent: resolvedFeePercent,
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
  deadline: string,
  walletAddress?: string,
  paymentReference?: string,
  billingUrl?: string,
  daysUntilSuspension?: number
): Promise<string> {
  const context: EmailContext = {
    name,
    amount,
    attemptNumber,
    deadline,
    daysUntilSuspension,
    walletAddress,
    paymentReference,
    billingUrl,
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
 * Send upcoming billing reminder email
 */
export async function sendUpcomingBillingEmail(
  email: string,
  name: string,
  totalPendingFees: number,
  tradeCount: number,
  billingDate: string
): Promise<string> {
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://nexusmeme.com'}/dashboard/billing`;
  const feePercent = await getDefaultFeePercent();

  const context: EmailContext = {
    name,
    totalPendingFees,
    tradeCount,
    billingDate,
    billingUrl,
    feePercent,
  };

  return queueEmail('upcoming_billing', email, context);
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

/**
 * Send trial started email (new user live trial activated)
 */
export async function sendTrialStartedEmail(
  email: string,
  name: string,
  trialDays: number,
  trialEndsAt: Date,
  dashboardUrl: string
): Promise<string> {
  const feePercent = await getDefaultFeePercent();
  const context = {
    name,
    trialDays,
    trialEndsAt: trialEndsAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    dashboardUrl,
    feePercent,
  };

  return queueEmail('trial_started', email, context as any);
}

/**
 * Send invoice expired email
 */
export async function sendInvoiceExpiredEmail(
  email: string,
  name: string,
  amount: number,
  paymentReference: string,
  billingUrl: string
): Promise<string> {
  const context = {
    name,
    amount,
    paymentReference,
    billingUrl,
  };

  return queueEmail('invoice_expired', email, context as any);
}

/**
 * Notify user their performance fee rate has changed
 */
/**
 * Send low balance alert — bot cannot trade due to insufficient free cash.
 * Caller is responsible for rate-limiting (once per day per bot).
 */
export async function sendLowBalanceEmail(
  email: string,
  name: string,
  botId: string,
  botName: string,
  exchange: string,
  freeBalance: number,
  minimumRequired: number,
): Promise<void> {
  const env = getEnvironmentConfig();
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/bots/${botId}`;
  await queueEmail('low_balance', email, {
    name,
    botName,
    exchange,
    freeBalance,
    minimumRequired,
    dashboardUrl,
  } as any);
}

export async function sendFeeRateChangedEmail(
  email: string,
  name: string,
  prevRate: number,
  newRate: number,
  reason?: string
): Promise<string> {
  const context = {
    name,
    prevRatePct: prevRate * 100,
    newRatePct: newRate * 100,
    reason,
  };
  return queueEmail('fee_rate_changed', email, context as any);
}


// ─── Weekly Digest ────────────────────────────────────────────────────────────

/**
 * Send weekly bot performance digest to all users with active bots.
 * Called by the weekly-digest cron every Monday at 8 AM UTC.
 */
export async function sendWeeklyDigests(): Promise<{ sent: number; skipped: number; errors: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  // Fetch all users with running bots + their week's trade stats
  const users = await query<{
    user_id: string;
    email: string;
    name: string | null;
    bot_status: string;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    gross_profit: number;
    total_fees: number;
    best_pair: string | null;
    best_pct: number | null;
    worst_pair: string | null;
    worst_pct: number | null;
    open_trades: number;
  }>(`
    SELECT
      u.id AS user_id,
      u.email,
      u.name,
      bi.status AS bot_status,
      COUNT(t.id) FILTER (WHERE t.status = 'closed' AND t.exit_time >= $1) AS total_trades,
      COUNT(t.id) FILTER (WHERE t.status = 'closed' AND t.exit_time >= $1 AND t.profit_loss > 0) AS winning_trades,
      COUNT(t.id) FILTER (WHERE t.status = 'closed' AND t.exit_time >= $1 AND t.profit_loss <= 0) AS losing_trades,
      COALESCE(SUM(t.profit_loss) FILTER (WHERE t.status = 'closed' AND t.exit_time >= $1), 0) AS gross_profit,
      COALESCE(SUM(COALESCE((t.config->>'entryFee')::numeric,0) + COALESCE((t.config->>'exitFee')::numeric,0)) FILTER (WHERE t.status = 'closed' AND t.exit_time >= $1), 0) AS total_fees,
      (SELECT pair FROM trades WHERE bot_instance_id = bi.id AND status = 'closed' AND exit_time >= $1 AND profit_loss IS NOT NULL ORDER BY profit_loss_percent DESC LIMIT 1) AS best_pair,
      (SELECT profit_loss_percent FROM trades WHERE bot_instance_id = bi.id AND status = 'closed' AND exit_time >= $1 AND profit_loss IS NOT NULL ORDER BY profit_loss_percent DESC LIMIT 1) AS best_pct,
      (SELECT pair FROM trades WHERE bot_instance_id = bi.id AND status = 'closed' AND exit_time >= $1 AND profit_loss IS NOT NULL ORDER BY profit_loss_percent ASC LIMIT 1) AS worst_pair,
      (SELECT profit_loss_percent FROM trades WHERE bot_instance_id = bi.id AND status = 'closed' AND exit_time >= $1 AND profit_loss IS NOT NULL ORDER BY profit_loss_percent ASC LIMIT 1) AS worst_pct,
      COUNT(t.id) FILTER (WHERE t.status = 'open') AS open_trades
    FROM users u
    JOIN bot_instances bi ON bi.user_id = u.id
    LEFT JOIN trades t ON t.bot_instance_id = bi.id
    JOIN subscriptions s ON s.user_id = u.id
    WHERE bi.status IN ('running', 'paused')
      AND s.status IN ('active', 'trialing')
    GROUP BY u.id, u.email, u.name, bi.id, bi.status
  `, [sinceIso]);

  const now = new Date();
  const weekStart = since.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const weekLabel = `${weekStart} – ${weekEnd}`;

  let sent = 0; let skipped = 0; let errors = 0;

  for (const user of users) {
    try {
      const totalTrades = parseInt(String(user.total_trades), 10) || 0;
      const winningTrades = parseInt(String(user.winning_trades), 10) || 0;
      const losingTrades = parseInt(String(user.losing_trades), 10) || 0;
      const grossProfit = parseFloat(String(user.gross_profit)) || 0;
      const feesUsdt = parseFloat(String(user.total_fees)) || 0;
      const netProfit = grossProfit - feesUsdt;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const openTrades = parseInt(String(user.open_trades), 10) || 0;
      const botStatus = (user.bot_status || 'stopped') as 'running' | 'paused' | 'stopped';

      // Simple market note based on trade volume
      const marketNote = totalTrades === 0
        ? 'Low volume market — bot protecting capital, waiting for stronger signals'
        : totalTrades < 3
        ? 'Quiet week — limited opportunities met entry criteria'
        : 'Active week — bot engaged with market opportunities';

      await queueEmail('weekly_digest', user.email, {
        name: user.name || 'Trader',
        weekLabel,
        totalTrades,
        winningTrades,
        losingTrades,
        grossProfitUsdt: grossProfit,
        netProfitUsdt: netProfit,
        feesUsdt,
        winRate,
        bestTrade: user.best_pair ? { pair: user.best_pair, profitPct: parseFloat(String(user.best_pct)) || 0 } : null,
        worstTrade: user.worst_pair ? { pair: user.worst_pair, profitPct: parseFloat(String(user.worst_pct)) || 0 } : null,
        openTradesCount: openTrades,
        botStatus,
        marketNote,
      } as any);
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, skipped, errors };
}

// ─── Admin Monitoring ─────────────────────────────────────────────────────────

/**
 * Re-export convenience wrappers so callers don't need to import error-notifier directly.
 * The actual dedup + rate-limiting logic lives in error-notifier.ts.
 */
export { notifyAdminError, sendSystemHealthAlert, runSystemHealthCheck } from '@/services/monitoring/error-notifier';
