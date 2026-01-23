'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface TrialInfo {
  isTrialActive: boolean;
  plan: string;
  trialEndsAt: Date;
  daysRemaining: number;
  capitalUsed: number;
  capitalLimit: number;
  capitalRemaining: number;
}

interface TrialWarningBannerProps {
  minimal?: boolean; // Show minimal version on dashboard
}

export function TrialWarningBanner({ minimal = false }: TrialWarningBannerProps) {
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const fetchTrialInfo = async () => {
      try {
        const res = await fetch('/api/billing/trial-info');
        if (res.ok) {
          const data = await res.json();
          if (data.isTrialActive && data.trialInfo) {
            setTrialInfo(data.trialInfo);
            setShowBanner(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch trial info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrialInfo();
  }, []);

  if (loading || !showBanner || !trialInfo) {
    return null;
  }

  const isEnding = trialInfo.daysRemaining <= 3;
  const isEndingTomorrow = trialInfo.daysRemaining <= 1;

  if (minimal) {
    // Minimal version for dashboard sidebar
    return (
      <div className={`rounded-lg p-4 border-l-4 ${
        isEndingTomorrow
          ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
      }`}>
        <p className={`text-sm font-semibold ${
          isEndingTomorrow
            ? 'text-red-700 dark:text-red-300'
            : 'text-yellow-700 dark:text-yellow-300'
        }`}>
          {isEndingTomorrow ? '🚨 Trial Expires Tomorrow!' : `⏰ Trial Expires in ${trialInfo.daysRemaining} Days`}
        </p>
        <p className={`text-xs mt-1 ${
          isEndingTomorrow
            ? 'text-red-600 dark:text-red-400'
            : 'text-yellow-600 dark:text-yellow-400'
        }`}>
          Add payment method to continue trading
        </p>
        <Link
          href="/dashboard/billing#payment-methods"
          className={`text-xs font-semibold mt-2 inline-block ${
            isEndingTomorrow
              ? 'text-red-700 dark:text-red-300 hover:underline'
              : 'text-yellow-700 dark:text-yellow-300 hover:underline'
          }`}
        >
          Add Payment →
        </Link>
      </div>
    );
  }

  // Full version for billing page
  return (
    <div className={`rounded-lg border-l-4 p-6 ${
      isEndingTomorrow
        ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
        : isEnding
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
    }`}>
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <h3 className={`text-lg font-bold mb-2 ${
            isEndingTomorrow
              ? 'text-red-700 dark:text-red-300'
              : isEnding
              ? 'text-yellow-700 dark:text-yellow-300'
              : 'text-blue-700 dark:text-blue-300'
          }`}>
            {isEndingTomorrow
              ? '🚨 Your Live Trading Trial Expires Tomorrow!'
              : isEnding
              ? `⏰ Your Trial Expires in ${trialInfo.daysRemaining} Day${trialInfo.daysRemaining !== 1 ? 's' : ''}`
              : `ℹ️ Live Trading Trial Active`}
          </h3>

          <p className={`text-sm mb-4 ${
            isEndingTomorrow
              ? 'text-red-600 dark:text-red-400'
              : isEnding
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}>
            Expires on {new Date(trialInfo.trialEndsAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          {/* Capital Usage */}
          <div className="mb-4">
            <p className={`text-sm font-semibold mb-2 ${
              isEndingTomorrow
                ? 'text-red-700 dark:text-red-300'
                : isEnding
                ? 'text-yellow-700 dark:text-yellow-300'
                : 'text-blue-700 dark:text-blue-300'
            }`}>
              Capital Used During Trial
            </p>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  trialInfo.capitalUsed / trialInfo.capitalLimit > 0.8
                    ? 'bg-red-500'
                    : trialInfo.capitalUsed / trialInfo.capitalLimit > 0.5
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{
                  width: `${(trialInfo.capitalUsed / trialInfo.capitalLimit) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              ${trialInfo.capitalUsed.toFixed(2)} / ${trialInfo.capitalLimit.toFixed(2)} USD used
            </p>
          </div>

          <p className={`text-sm mb-4 ${
            isEndingTomorrow
              ? 'text-red-600 dark:text-red-400'
              : isEnding
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}>
            After your trial ends, you can continue with our <strong>performance fees plan</strong>:
          </p>

          <ul className={`text-sm space-y-1 mb-4 ${
            isEndingTomorrow
              ? 'text-red-600 dark:text-red-400'
              : isEnding
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}>
            <li>✅ Unlimited live trading with your own capital</li>
            <li>✅ Pay only 5% on profitable trades</li>
            <li>✅ No subscription fees, no setup costs</li>
            <li>✅ Monthly billing on 1st of month</li>
          </ul>
        </div>

        <Link
          href="/dashboard/billing?tab=payment-methods"
          className={`px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap transition ${
            isEndingTomorrow
              ? 'bg-red-600 hover:bg-red-700'
              : isEnding
              ? 'bg-yellow-600 hover:bg-yellow-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isEndingTomorrow ? 'Add Payment Now' : 'Add Payment Method'}
        </Link>
      </div>
    </div>
  );
}
