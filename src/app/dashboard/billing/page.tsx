'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { PerformanceFeesSummary } from '@/components/billing/PerformanceFeesSummary';
import { RecentTransactions } from '@/components/billing/RecentTransactions';
import { ChargeHistory } from '@/components/billing/ChargeHistory';
import { TrialWarningBanner } from '@/components/billing/TrialWarningBanner';
import { CryptoPayButton } from '@/components/billing/CryptoPayButton';

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
            tradingPairsPerBot: planUsage?.limits?.tradingPairsPerBot || 2,
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
    // Paper trading doesn't require payment
    if (userPlan?.tradingMode === 'paper') {
      return 'Paper trading mode - practice with simulated trades. No payment required. Switch to live trading when ready.';
    }

    switch (userPlan?.plan) {
      case 'live_trial':
        return 'You have a limited-time trial to trade with real money. Add a payment method to continue after the trial ends.';
      case 'performance_fees':
        return '15% only on profitable trades. No subscription fees, no monthly charges. We only earn when you do.';
      default:
        return 'You are on Live Trading Trial. Trade with real money for a limited time.';
    }
  };

  const colors = getPlanColor();

  return (
    <DashboardLayout title="Billing & Plans">
      <div className="space-y-4 sm:space-y-6">
        {/* Trial Warning Banner (if applicable - not for paper trading) */}
        <TrialWarningBanner tradingMode={userPlan?.tradingMode} />

        {/* Current Plan Section - Compact on mobile */}
        <section className={`rounded-xl border p-4 sm:p-6 ${colors.bg} ${colors.border}`}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className={`text-lg sm:text-xl font-bold ${colors.text}`}>{getPlanName()}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors.badge}`}>
                  Active
                </span>
              </div>
              <p className={`text-sm ${colors.text}`}>{getPlanDescription()}</p>
            </div>
          </div>

          {/* Plan Stats - Horizontal on mobile */}
          <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <div className="text-center flex-1">
              <p className={`text-xs font-medium ${colors.text}`}>Mode</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {userPlan?.tradingMode === 'live' ? '🔴 Live' : '📊 Paper'}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
            <div className="text-center flex-1">
              <p className={`text-xs font-medium ${colors.text}`}>Bots</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {userPlan?.botsPerUser}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
            <div className="text-center flex-1">
              <p className={`text-xs font-medium ${colors.text}`}>Pairs</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {userPlan?.tradingPairsPerBot}
              </p>
            </div>
          </div>

          {/* Trial Details - Collapsible on mobile */}
          {userPlan?.plan === 'live_trial' && (
            <details className="mt-4 group">
              <summary className={`cursor-pointer text-sm font-medium ${colors.text} flex items-center gap-2`}>
                <span>Trial includes</span>
                <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <ul className={`text-sm space-y-1 mt-2 ${colors.text}`}>
                <li>✓ 10 days to test live trading</li>
                <li>✓ No capital limits</li>
                <li>✓ No payment required</li>
                <li>✓ After trial: 15% on profits</li>
              </ul>
            </details>
          )}
        </section>

        {/* Info Banner - Compact */}
        {userPlan?.tradingMode === 'paper' ? (
          <section className="bg-slate-50 dark:bg-slate-900/10 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  📊 <strong>Paper Trading Mode.</strong> Practice with simulated trades - no real money, no fees.
                </p>
              </div>
              <a
                href="/dashboard/bots"
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
              >
                Switch to Live Trading →
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Go to your bot settings to enable live trading with real funds.
            </p>
          </section>
        ) : (
          <section className="bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 p-3 sm:p-4">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>No subscriptions.</strong> 15% on profits — we only earn when you do.{' '}
              <a href="/help/performance-fees" className="underline">Learn more →</a>
            </p>
          </section>
        )}

        {/* Performance Fees - Full width on mobile, priority position */}
        <PerformanceFeesSummary tradingMode={userPlan?.tradingMode} />

        {/* Crypto Payment - Below fees on mobile */}
        <CryptoPayButton tradingMode={userPlan?.tradingMode} />

        {/* Recent Transactions */}
        <RecentTransactions />

        {/* Charge History */}
        <ChargeHistory />

        {/* Payment Methods Section - Compact */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Payment Methods</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Manage cards and payment options
              </p>
            </div>
            <button
              onClick={() => {
                window.location.href = '/api/billing/customer-portal';
              }}
              className="px-4 py-2 bg-blue-600 active:bg-blue-700 text-white rounded-lg font-semibold text-sm shrink-0"
            >
              Manage
            </button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
