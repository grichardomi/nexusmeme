'use client';

import { useState } from 'react';
import Link from 'next/link';

interface BillingSetupModalProps {
  botId: string;
  botName?: string;
  onClose?: () => void;
}

/**
 * Billing Setup Modal Component
 * Shown after successful bot creation to guide user through billing setup
 */
export function BillingSetupModal({ botName }: BillingSetupModalProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 text-white px-6 py-6 rounded-t-lg">
          <h2 className="text-2xl font-bold mb-2">🎉 Bot Created!</h2>
          <p className="text-blue-100">One final step: Set up billing to enable live trading</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            Your trading bot <strong>{botName || 'is ready'}</strong>, but you'll need to set up billing before it can trade with real money.
          </p>

          {/* Billing Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">
              <strong>How it works:</strong>
            </p>
            <ul className="text-sm text-blue-900 dark:text-blue-100 space-y-1 ml-4">
              <li>✓ 15% fee on profits only</li>
              <li>✓ No subscription fees</li>
              <li>✓ Charged monthly on the 1st</li>
              <li>✓ Free if bot loses money</li>
            </ul>
          </div>

          {/* Quick Setup Steps */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-300">
            <p className="font-semibold mb-2">Quick setup (2 minutes):</p>
            <ol className="space-y-2 ml-4">
              <li>1. Go to Billing Dashboard</li>
              <li>2. Add your payment method</li>
              <li>3. Your bot starts trading immediately</li>
            </ol>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-6 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <Link
            href="/dashboard/billing"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg text-center transition"
          >
            Set Up Billing Now →
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="block w-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium py-3 transition"
          >
            I'll Do This Later
          </button>
        </div>

        {/* Footer Info */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
          <p>
            Your bot is ready to go. Learn more about our{' '}
            <Link href="/help/performance-fees" className="text-blue-600 dark:text-blue-400 hover:underline">
              performance fees →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
