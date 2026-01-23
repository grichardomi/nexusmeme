'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { PerformanceFeesSummary } from '@/components/billing/PerformanceFeesSummary';
import { RecentTransactions } from '@/components/billing/RecentTransactions';
import { ChargeHistory } from '@/components/billing/ChargeHistory';
import { TrialWarningBanner } from '@/components/billing/TrialWarningBanner';

/**
 * Billing & Plan Page
 * Shows current plan, trial status, performance fees, and payment methods
 * No traditional subscriptions - instead tracks plan (free/live_trial/performance_fees)
 */

interface UserPlan {
  plan: 'free' | 'live_trial' | 'performance_fees';
  tradingMode: 'paper' | 'live';
  botsPerUser: number;
  tradingPairsPerBot: number;
  maxCapitalPerBot: number;
}

export default function BillingPage() {
  const { status } = useSession();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin');
    }
  }, [status]);

  useEffect(() => {
    const fetchUserPlan = async () => {
      try {
        const res = await fetch('/api/billing/subscriptions');
        if (res.ok) {
          const data = await res.json();
          const planUsage = data.planUsage;
          setUserPlan({
            plan: (planUsage?.plan || 'live_trial') as 'live_trial' | 'performance_fees',
            tradingMode: planUsage?.limits?.tradingMode || 'live',
            botsPerUser: planUsage?.limits?.botsPerUser || 1,
            tradingPairsPerBot: planUsage?.limits?.tradingPairsPerBot || 5,
            maxCapitalPerBot: planUsage?.limits?.maxCapitalPerBot || 200,
          });
        }
      } catch (error) {
        console.error('Failed to fetch user plan:', error);
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchUserPlan();
    }
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout title="Billing & Plans">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-900 dark:text-white text-lg">Loading billing information...</div>
        </div>
      </DashboardLayout>
    );
  }

  const getPlanColor = () => {
    switch (userPlan?.plan) {
      case 'live_trial':
        return { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300' };
      case 'performance_fees':
        return { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300' };
      default:
        return { bg: 'bg-slate-50 dark:bg-slate-900/20', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-700 dark:text-slate-300', badge: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' };
    }
  };

  const getPlanName = () => {
    switch (userPlan?.plan) {
      case 'live_trial':
        return '10-Day Live Trading Trial';
      case 'performance_fees':
        return 'Performance Fees Plan (Unlimited Trading)';
      default:
        return 'Live Trading Trial';
    }
  };

  const getPlanDescription = () => {
    switch (userPlan?.plan) {
      case 'live_trial':
        return 'You have a limited-time trial to trade with real money. Add a payment method to continue after the trial ends.';
      case 'performance_fees':
        return 'You pay 5% only on profitable trades. No subscription fees, no monthly charges. Complete freedom to trade.';
      default:
        return 'You are on Live Trading Trial. Trade with real money for a limited time.';
    }
  };

  const colors = getPlanColor();

  return (
    <DashboardLayout title="Billing & Plans">
      <div className="space-y-8">
        {/* Trial Warning Banner (if applicable) */}
        <TrialWarningBanner />

        {/* Current Plan Section */}
        <section className={`rounded-lg border p-8 ${colors.bg} ${colors.border}`}>
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className={`text-2xl font-bold ${colors.text}`}>{getPlanName()}</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors.badge}`}>
                  {userPlan?.plan === 'live_trial'
                    ? 'Active'
                    : userPlan?.plan === 'performance_fees'
                    ? 'Active'
                    : 'Default'}
                </span>
              </div>
              <p className={`text-sm mb-4 ${colors.text}`}>{getPlanDescription()}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className={`text-xs font-semibold uppercase mb-1 ${colors.text}`}>Trading Mode</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {userPlan?.tradingMode === 'live' ? '🔴 Real Money' : '📊 Paper Trading'}
                  </p>
                </div>
                <div>
                  <p className={`text-xs font-semibold uppercase mb-1 ${colors.text}`}>Bots Allowed</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {userPlan?.botsPerUser} Bot{userPlan?.botsPerUser !== 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <p className={`text-xs font-semibold uppercase mb-1 ${colors.text}`}>Pairs Per Bot</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Up to {userPlan?.tradingPairsPerBot}
                  </p>
                </div>
                <div>
                  <p className={`text-xs font-semibold uppercase mb-1 ${colors.text}`}>Capital</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {userPlan?.maxCapitalPerBot === -1 ? 'Unlimited' : `$${userPlan?.maxCapitalPerBot}`}
                  </p>
                </div>
              </div>

              {userPlan?.plan === 'live_trial' && (
                <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
                  <p className={`text-sm mb-3 ${colors.text}`}>Your trial includes:</p>
                  <ul className={`text-sm space-y-1 ${colors.text}`}>
                    <li>✓ 10 days to test live trading</li>
                    <li>✓ $200 USD capital limit</li>
                    <li>✓ No payment required during trial</li>
                    <li>✓ After trial: 5% fee on profits only</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
          <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
            💡 <strong>How Our Pricing Works:</strong> No monthly subscriptions. No hidden fees. You pay 5% only on profits from closed trades.{' '}
            <a href="/help/performance-fees" className="underline hover:text-blue-800 dark:hover:text-blue-200">
              Learn more →
            </a>
          </p>
        </section>

        {/* Performance Fees Summary */}
        <PerformanceFeesSummary />

        {/* Recent Transactions */}
        <RecentTransactions />

        {/* Charge History */}
        <ChargeHistory />

        {/* Payment Methods Section */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Payment Methods</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Manage your payment methods for live trading fees and trial extensions.
          </p>
          <button
            onClick={() => {
              window.location.href = '/api/billing/customer-portal';
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition"
          >
            Open Stripe Portal →
          </button>
        </section>
      </div>
    </DashboardLayout>
  );
}
