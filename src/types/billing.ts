/**
 * Billing Types
 * Subscription and pricing related types
 *
 * Plans:
 * - live_trial: 10-day live trading trial (new users start here)
 * - performance_fees: Unlimited live trading with 5% fee on profits (after trial)
 * - free: (legacy, deprecated - no longer used)
 */

export type SubscriptionPlan = 'free' | 'live_trial' | 'performance_fees';

export type BillingPeriod = 'monthly' | 'yearly';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'unpaid' | 'trialing';

export type TradingMode = 'paper' | 'live';

export type TrialType = 'none' | 'live_trading';

export interface PricingPlan {
  id: SubscriptionPlan;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  stripePriceId?: string;
  features: string[];
  limits: {
    botsPerUser: number;
    tradingPairsPerBot: number;
    tradingMode: TradingMode;
  };
  highlight?: string;
  trialType: TrialType;
  trialDurationDays?: number;
  performanceFeePercent?: number;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  period: BillingPeriod;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  userId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoiceNumber: string;
  dueDate: Date;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Usage {
  id: string;
  userId: string;
  month: Date;
  apiCallsUsed: number;
  botsCreated: number;
  tradesExecuted: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  stripePaymentMethodId: string;
  type: string; // 'card', 'bank_account', etc.
  brand?: string; // 'visa', 'mastercard', etc.
  last4: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  createdAt: Date;
}
