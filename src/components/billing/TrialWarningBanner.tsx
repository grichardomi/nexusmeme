'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface TrialInfo {
  isTrialActive: boolean;
  plan: string;
  trialEndsAt: Date;
  daysRemaining: number;
}

interface TrialWarningBannerProps {
  minimal?: boolean; // Show minimal version on dashboard
  onGoLive?: () => void; // If provided, opens wizard directly instead of navigating
}

export function TrialWarningBanner({ minimal = false, onGoLive }: TrialWarningBannerProps) {
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setFeePercent(d.feePercent ?? null))
      .catch(() => {});
  }, []);
  const fee = feePercent !== null ? `${feePercent}%` : '…';

  useEffect(() => {
    const fetchTrialInfo = async () => {
      try {
        const [trialRes, subsRes] = await Promise.all([
          fetch('/api/billing/trial-info'),
          fetch('/api/billing/subscriptions'),
        ]);

        // If user already has a live bot, suppress the trial banner entirely —
        // they've already switched to live trading, no need to prompt them again.
        if (subsRes.ok) {
          const subsData = await subsRes.json();
          if (subsData.planUsage?.limits?.tradingMode === 'live') {
            setLoading(false);
            return;
          }
        }

        if (trialRes.ok) {
          const data = await trialRes.json();
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
          Upgrade to live trading to continue with real money
        </p>
        <Link
          href="/dashboard/billing"
          className={`text-xs font-semibold mt-2 inline-block ${
            isEndingTomorrow
              ? 'text-red-700 dark:text-red-300 hover:underline'
              : 'text-yellow-700 dark:text-yellow-300 hover:underline'
          }`}
        >
          Go Live →
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
              ? '🚨 Your Free Trial Expires Tomorrow!'
              : isEnding
              ? `⏰ Your Free Trial Expires in ${trialInfo.daysRemaining} Day${trialInfo.daysRemaining !== 1 ? 's' : ''}`
              : `ℹ️ Free Trial Active (Paper Trading)`}
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

          <p className={`text-sm mb-4 ${
            isEndingTomorrow
              ? 'text-red-600 dark:text-red-400'
              : isEnding
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}>
            Upgrade to <strong>live trading</strong> and trade with real money:
          </p>

          <ul className={`text-sm space-y-1 mb-4 ${
            isEndingTomorrow
              ? 'text-red-600 dark:text-red-400'
              : isEnding
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}>
            <li>✅ Trade with your own capital ($1,000 total account value minimum)</li>
            <li>✅ Pay only {fee} on profitable trades</li>
            <li>✅ No subscription fees, no setup costs</li>
            <li>✅ Cancel anytime</li>
          </ul>
        </div>

        {onGoLive ? (
          <button
            onClick={onGoLive}
            className={`px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap transition ${
              isEndingTomorrow
                ? 'bg-red-600 hover:bg-red-700'
                : isEnding
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isEndingTomorrow ? 'Switch to Live Trading Now' : 'Switch to Live Trading'}
          </button>
        ) : (
          <Link
            href="/dashboard/billing"
            className={`px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap transition ${
              isEndingTomorrow
                ? 'bg-red-600 hover:bg-red-700'
                : isEnding
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isEndingTomorrow ? 'Switch to Live Trading Now' : 'Switch to Live Trading'}
          </Link>
        )}
      </div>
    </div>
  );
}
