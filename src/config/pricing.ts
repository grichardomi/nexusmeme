/**
 * Pricing Configuration - Single Source of Truth
 * All pricing plans and feature limits defined here
 * Used across the entire application for consistency
 *
 * MODEL: Performance-Based Pricing
 * - No monthly subscriptions, no setup fees
 * - Only pay 5% of profits from closed trades
 * - Everyone starts with 10-day Live Trading Trial
 * - No legacy "paper trading forever" - encourages conversion
 */

import { SubscriptionPlan } from '@/types/billing';

/**
 * Stripe Price IDs - Legacy, kept for backward compatibility
 * These are no longer used with performance fees model
 */
const STRIPE_PRICE_IDS = {
  standard: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD || 'price_1RZNjaD6muARz8OlT8QMEetc',
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || 'price_1SUrYID6muARz8OljOoP7nJK',
};

export { STRIPE_PRICE_IDS };

/**
 * Pricing Plans
 *
 * LIVE TRADING TRIAL (10 days):
 * - Real money live trading execution
 * - AI-powered regime detection & market analysis
 * - 1 trading bot with up to 5 pairs
 * - No capital limits - trade with your own funds
 * - 10-day trial period (no upfront payment needed)
 * - Free to use during trial
 * - After trial: Only pay 5% on profitable closed trades
 *
 * PERFORMANCE FEES (After trial expires):
 * - Continue live trading with unlimited capital
 * - 5% performance fee on all profitable trades only
 * - No losing trades = no fees at all
 * - Monthly billing on 1st at 2 AM UTC
 * - No subscription, no monthly fees
 * - Cancel anytime with no penalties
 */

export const PRICING_PLANS = {
  live_trial: {
    id: 'live_trial' as SubscriptionPlan,
    name: 'Live Trading Trial',
    description: 'Trade with real money free for 10 days',
    monthlyPrice: 0,
    yearlyPrice: 0,
    stripePriceId: undefined,
    features: [
      'Real money live trading execution',
      '1 trading bot',
      'Up to 5 trading pairs (BTC, ETH, ALTs)',
      'AI-powered regime detection & market analysis',
      'Automated trade execution on regime signals',
      'Dynamic profit targeting based on market conditions',
      'Full access to all exchanges (Kraken, Binance, Coinbase)',
      '10-day trial period (no payment required)',
      'No capital limits - trade with your own funds',
      'Real-time market data & price feeds',
      'Complete trade history & performance analytics',
      'Email notifications for trade alerts',
      'After trial: Only pay 5% on profits',
    ],
    limits: {
      botsPerUser: 1,
      tradingPairsPerBot: 5,
      tradingMode: 'dynamic', // Determined at runtime from bot config
    },
    highlight: 'Start trading immediately',
    trialType: 'live_trading',
    trialDurationDays: 10
  },

  performance_fees: {
    id: 'performance_fees' as SubscriptionPlan,
    name: 'Performance Fees Plan',
    description: 'Unlimited live trading with 5% fee on profits only',
    monthlyPrice: 0, // No subscription
    yearlyPrice: 0,
    stripePriceId: undefined,
    features: [
      'Everything in Live Trial, plus:',
      'Unlimited capital - trade as much as you want',
      'Unlimited trading duration - no expiration',
      'Simple transparent pricing: 5% of profits only',
      'No monthly subscription fees',
      'No setup costs or hidden charges',
      'Losing trades = $0 fees',
      'Monthly billing on 1st at 2 AM UTC',
      'Cancel anytime with no penalties',
      'Full feature access across all exchanges',
      'Priority support',
    ],
    limits: {
      botsPerUser: 1,
      tradingPairsPerBot: 5,
      tradingMode: 'dynamic', // Determined at runtime from bot config
    },
    highlight: 'Unlimited profitable trading',
    trialType: 'none',
    performanceFeePercent: 5,
  },
};

/**
 * Get pricing plan by ID
 */
export function getPricingPlan(planId: string) {
  return PRICING_PLANS[planId as keyof typeof PRICING_PLANS];
}

/**
 * Trial Configuration
 */
export const TRIAL_CONFIG = {
  LIVE_TRADING_DURATION_DAYS: 10,
  PERFORMANCE_FEE_PERCENT: 5,
  BILLING_DAY_OF_MONTH: 1,
  BILLING_HOUR_UTC: 2,
};

/**
 * Determine which plan a user should be on based on their status
 *
 * Priority:
 * 1. If trial active and not expired: live_trial
 * 2. If trial expired: performance_fees (must add payment to continue trading)
 * 3. If no trial started: live_trial (new user, auto-enroll)
 */
export function determineUserPlan(userStatus: {
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  hasPaymentMethod: boolean;
}): SubscriptionPlan {
  const now = new Date();

  // Check if user has active trial
  if (userStatus.trialStartedAt && userStatus.trialEndsAt) {
    const isTrialExpired = now > userStatus.trialEndsAt;

    if (!isTrialExpired) {
      return 'live_trial';
    }

    // Trial expired - user moves to performance fees
    // If they don't have payment method, they'll see a message to add one before trading
    return 'performance_fees';
  }

  // Default: new users start on live_trial
  return 'live_trial';
}
