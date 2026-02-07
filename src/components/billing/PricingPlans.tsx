'use client';

import React, { useState } from 'react';
import { PRICING_PLANS } from '@/config/pricing';

/**
 * Pricing Plans Component
 * Displays available subscription plans with features and pricing
 * Supports light/dark mode with Tailwind CSS
 */

interface PricingPlansProps {
  currentPlan?: string;
  onSelectPlan?: (plan: string, period: 'monthly' | 'yearly') => void;
  userCanUpgrade?: boolean;
}

export function PricingPlans({ currentPlan, onSelectPlan, userCanUpgrade = true }: PricingPlansProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const plans = Object.values(PRICING_PLANS);

  const calculateAnnualSavings = (monthly: number, yearly: number) => {
    if (yearly === 0 || monthly === 0) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  };

  return (
    <div className="space-y-8">
      {/* Billing Period Toggle */}
      <div className="flex justify-center items-center gap-4">
        <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
          className="relative inline-flex h-8 w-14 items-center rounded-full bg-slate-200 dark:bg-slate-700 transition-colors hover:bg-slate-300 dark:hover:bg-slate-600"
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-slate-900 transition-transform ${
              billingPeriod === 'yearly' ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className={`text-sm ${billingPeriod === 'yearly' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
          Yearly <span className="text-green-600 dark:text-green-400 text-xs ml-1">(Save 17%)</span>
        </span>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map(plan => {
          const isCurrentPlan = currentPlan === plan.id;
          const price = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          const savings = calculateAnnualSavings(plan.monthlyPrice, plan.yearlyPrice);

          return (
            <div
              key={plan.id}
              className={`rounded-lg border-2 p-8 transition-all ${
                isCurrentPlan
                  ? 'border-blue-500 bg-white dark:bg-slate-800'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              } ${plan.id === 'live_trial' ? 'md:scale-105' : ''}`}
            >
              {/* Popular Badge */}
              {plan.id === 'live_trial' && (
                <div className="mb-4 inline-block bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}

              {/* Plan Name */}
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{plan.description}</p>

              {/* Pricing */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-slate-900 dark:text-white">
                    ${price === 0 ? 'Free' : price}
                  </span>
                  {price > 0 && (
                    <span className="text-slate-600 dark:text-slate-400">/{billingPeriod === 'yearly' ? 'year' : 'month'}</span>
                  )}
                </div>
                {billingPeriod === 'yearly' && savings > 0 && (
                  <p className="text-green-600 dark:text-green-400 text-sm">Save {savings}% compared to monthly</p>
                )}
              </div>

              {/* CTA Button */}
              {isCurrentPlan ? (
                <button disabled className="w-full bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-white py-3 rounded font-semibold mb-8 cursor-not-allowed">
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => onSelectPlan?.(plan.id, billingPeriod)}
                  disabled={!userCanUpgrade}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white py-3 rounded font-semibold mb-8 transition"
                >
                  {plan.id === 'live_trial' ? 'Start Free Trial' : `Upgrade to ${plan.name}`}
                </button>
              )}

              {/* Features List */}
              <div className="space-y-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase">Features</p>
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                    <span className="text-slate-700 dark:text-slate-300 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Limits */}
              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase mb-4">Limits</p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li>• {plan.limits.botsPerUser} trading {plan.limits.botsPerUser === 1 ? 'bot' : 'bots'}</li>
                  <li>• {plan.limits.tradingPairsPerBot} pairs per bot</li>
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="mt-16 bg-slate-50 dark:bg-slate-900 rounded-lg p-8 border border-slate-200 dark:border-slate-700">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Frequently Asked Questions</h3>
        <div className="space-y-6">
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">Can I change plans anytime?</h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately with pro-rata billing.
            </p>
          </div>
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">What payment methods do you accept?</h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              We accept all major credit and debit cards through Stripe. Your payment information is always secure and encrypted.
            </p>
          </div>
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">Is there a free trial?</h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Yes! Everyone starts with a 10-day live trading trial. No capital limits - trade with your own funds. No payment required. After the trial, pay only 15% on profits.
            </p>
          </div>
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">What happens after my trial?</h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Add a payment method and continue trading. You only pay 15% on profitable trades. If you lose money, you pay nothing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
