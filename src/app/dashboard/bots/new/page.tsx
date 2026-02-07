'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { CreateBotForm } from '@/components/bots/CreateBotForm';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

/**
 * Create Bot Page
 * New bot setup wizard
 */

export default function CreateBotPage() {
  const { status } = useSession();

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardLayout title="Create New Trading Bot">
      <div className="max-w-2xl space-y-6">
        {/* Billing Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>💳 Billing Setup:</strong> After creating your bot, you'll set up billing to enable live trading. You'll only be charged 15% of your profits when your bot makes money. No subscription fees. <a href="/help/performance-fees" className="underline hover:text-blue-700 dark:hover:text-blue-300 font-semibold">Learn more →</a>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">Set Up Your Trading Bot</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Configure your bot parameters and connect to your exchange account.
            </p>
          </div>

          <CreateBotForm />

          {/* Help Section */}
          <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Getting Started</h3>
            <div className="space-y-4 text-slate-600 dark:text-slate-400 text-sm">
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-1">1. Select Exchange</h4>
                <p>Choose which cryptocurrency exchange you want to trade on.</p>
              </div>
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-1">2. Choose Trading Pairs</h4>
                <p>Select the trading pairs you want the bot to monitor and trade.</p>
              </div>
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-1">3. Set Capital</h4>
                <p>Specify how much capital you want to allocate to this bot.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
