'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Step {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

interface OnboardingChecklistProps {
  hasApiKeys: boolean | null;
  hasBots: boolean;
  botRunning: boolean;
  accountFunded: boolean; // total account value >= $1,000
}

const DISMISSED_KEY = 'nexusmeme_onboarding_dismissed';

export function OnboardingChecklist({ hasApiKeys, hasBots, botRunning, accountFunded }: OnboardingChecklistProps) {
  // null = unknown (localStorage not yet read); true = show; false = hide
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    // If the bot is already running, the user has completed everything —
    // permanently dismiss without showing a flash even if localStorage was cleared.
    if (botRunning) {
      localStorage.setItem(DISMISSED_KEY, '1');
      setVisible(false);
      return;
    }
    const alreadyDismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    setVisible(!alreadyDismissed);
  }, [botRunning]);

  const steps: Step[] = [
    {
      id: 'api_keys',
      label: 'Connect your Binance API keys',
      description: 'NexusMeme needs read + trade access to execute orders on your behalf.',
      done: hasApiKeys === true,
      href: '/dashboard/settings#api-keys',
      cta: 'Add API Keys',
    },
    {
      id: 'create_bot',
      label: 'Create your trading bot',
      description: 'Set your pairs and risk profile. Takes under a minute.',
      done: hasBots,
      href: '/dashboard/bots',
      cta: 'Create Bot',
    },
    {
      id: 'fund',
      label: 'Fund your Binance account ($1,000+ USDT)',
      description: 'Minimum account value for live trading. Convert other assets to USDT in Binance if needed.',
      done: accountFunded,
      href: 'https://www.binance.us/buy-sell-crypto',
      cta: 'Fund Account',
    },
    {
      id: 'start_bot',
      label: 'Start your bot',
      description: 'Activate live trading. The bot runs 24/7 and handles entries and exits automatically.',
      done: botRunning,
      href: '/dashboard/bots',
      cta: 'Start Bot',
    },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;

  // Auto-dismiss once all steps complete
  useEffect(() => {
    if (allDone && visible) {
      localStorage.setItem(DISMISSED_KEY, '1');
      setVisible(false);
    }
  }, [allDone, visible]);

  // Unknown state — don't render anything until localStorage is read
  if (visible === null || !visible) return null;

  const progressPct = Math.round((completedCount / steps.length) * 100);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Get started with NexusMeme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {completedCount} of {steps.length} steps complete
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg leading-none shrink-0 mt-0.5"
          aria-label="Dismiss checklist"
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-start gap-3">
            {/* Step indicator */}
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
              step.done
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
            }`}>
              {step.done ? '✓' : i + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className={`text-sm font-medium ${
                  step.done
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : 'text-slate-800 dark:text-slate-200'
                }`}>
                  {step.label}
                </span>
                {!step.done && (
                  <Link
                    href={step.href}
                    target={step.href.startsWith('http') ? '_blank' : undefined}
                    rel={step.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                  >
                    {step.cta} →
                  </Link>
                )}
              </div>
              {!step.done && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
