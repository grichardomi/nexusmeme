'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface BillingConfig {
  feePercent: number;
  gracePeriodDays: number;
  dunningWarningDays: number;
  suspensionDays: number;
}

function useBillingConfig() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setConfig({
        feePercent: d.feePercent,
        gracePeriodDays: d.gracePeriodDays ?? 7,
        dunningWarningDays: d.dunningWarningDays ?? 10,
        suspensionDays: d.suspensionDays ?? 14,
      }))
      .catch(() => {});
  }, []);
  return config;
}

export default function PerformanceFeesPage() {
  const billing = useBillingConfig();
  const feePercent = billing?.feePercent ?? null;
  const fee = feePercent !== null ? `${feePercent}%` : '…';
  const feeDecimal = feePercent !== null ? feePercent / 100 : null;
  const suspensionDays = billing?.suspensionDays ?? 14;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 text-white py-8 px-4 sm:px-6 lg:px-8 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <Link href="/help" className="text-blue-100 hover:text-white mb-4 inline-block text-sm">
            ← Back to Help Center
          </Link>
          <h1 className="text-4xl font-bold mb-2">Performance Fees Guide</h1>
          <p className="text-blue-100">Understand how our {fee} fee model works</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Overview */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">How Performance Fees Work</h2>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
              NexusMeme uses a <strong>performance-based pricing model</strong>. You only pay <strong>{fee} of your profits</strong> when your trading bot generates profitable trades. No subscription fees, no monthly minimums, no setup costs. We only earn when you earn.
            </p>
            <ul className="space-y-2 text-slate-700 dark:text-slate-300">
              <li>✓ Pay only when profitable</li>
              <li>✓ Losing trades don&apos;t cost anything</li>
              <li>✓ Transparent {fee} fee on profits only</li>
              <li>✓ Monthly billing on the 1st</li>
              <li>✓ Pay directly with USDC on Base — no credit cards needed</li>
              <li>✓ Minimum $1,000 total account value for live trading</li>
            </ul>
          </div>
        </section>

        {/* Example */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Example Month</h2>
          <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-lg p-8">
            <p className="text-sm text-slate-400 mb-6">Here&apos;s what a typical month looks like:</p>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between pb-3 border-b border-slate-700">
                <span className="text-slate-300">Trade 1: BTC/USDT profit</span>
                <span className="font-mono">+$500</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-700">
                <span className="text-slate-300">Trade 2: ETH/USDT profit</span>
                <span className="font-mono">+$300</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-700">
                <span className="text-slate-300">Trade 3: BTC/USDT loss (no fee)</span>
                <span className="font-mono text-red-400">-$200</span>
              </div>
              <div className="pt-3 space-y-2">
                <div className="flex justify-between font-semibold">
                  <span>Total Profits</span>
                  <span className="font-mono">$800</span>
                </div>
                <div className="flex justify-between text-blue-400 font-semibold">
                  <span>Your Fee ({fee})</span>
                  <span className="font-mono">
                    {feeDecimal !== null ? `$${(800 * feeDecimal).toFixed(2)}` : '…'}
                  </span>
                </div>
                <div className="flex justify-between text-green-400 font-semibold pt-2 border-t border-slate-700">
                  <span>You Keep</span>
                  <span className="font-mono">
                    {feeDecimal !== null ? `$${(800 * (1 - feeDecimal)).toFixed(2)}` : '…'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-400">
              💡 Note: Trade 3 lost $200, so no fee is charged. You only pay on the $800 in total profits.
            </p>
          </div>
        </section>

        {/* Billing Details */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Monthly Billing Details</h2>
          <div className="space-y-4">
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Billing Date & Time</h3>
              <p className="text-slate-700 dark:text-slate-300">
                All fees are billed on the <strong>1st of each month at 2:00 AM UTC</strong>. Pending fees from the previous month are combined into a single invoice.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">BTC & ETH Trading</h3>
              <p className="text-slate-700 dark:text-slate-300">
                Your bot trades BTC and ETH — the most established crypto markets. Fees are calculated on <strong>total profits across all pairs</strong> in a single monthly invoice.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">How to Pay</h3>
              <p className="text-slate-700 dark:text-slate-300">
                Payments are made directly with <strong>USDC on Base</strong>. Pay from MetaMask, any WalletConnect wallet, or scan a QR code from a mobile wallet. No credit cards, no banks, no processor fees.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Minimum Account Balance</h3>
              <p className="text-slate-700 dark:text-slate-300">
                Live trading requires a minimum of <strong>$1,000 USDT/USD</strong> in your exchange account. Paper trading during your free trial has no minimum.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Fees Accumulate Month to Month</h3>
              <p className="text-slate-700 dark:text-slate-300">
                Fees below $1.00 carry forward and accumulate until they exceed the minimum invoice threshold. You are never billed for a trivial amount.
              </p>
            </div>
          </div>
        </section>

        {/* Billing Statuses */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Understanding Your Billing Status</h2>
          <div className="space-y-3">
            <div className="flex gap-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="text-2xl flex-shrink-0">🟢</div>
              <div>
                <h4 className="font-semibold text-green-900 dark:text-green-100">Active</h4>
                <p className="text-sm text-green-800 dark:text-green-200">Your billing account is in good standing. Invoices are generated on the 1st and paid directly with USDC.</p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="text-2xl flex-shrink-0">🟡</div>
              <div>
                <h4 className="font-semibold text-yellow-900 dark:text-yellow-100">Overdue</h4>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">An invoice is awaiting your USDC payment. Your bot continues trading until Day {suspensionDays}. Go to Billing &amp; Plans to pay. If the invoice has expired, generate a new one there.</p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-2xl flex-shrink-0">🔴</div>
              <div>
                <h4 className="font-semibold text-red-900 dark:text-red-100">Suspended</h4>
                <p className="text-sm text-red-800 dark:text-red-200">Your invoice is more than {suspensionDays} days overdue. Your bot has been paused and will not execute any trades. Go to Billing &amp; Plans, pay the USDC invoice on Base network — your bot resumes automatically once payment is confirmed. If the invoice has expired, generate a new one there.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Do I pay if my bot loses money?',
                a: `No. You only pay ${fee} on profitable trades. If your bot loses money or has no trades, there is no fee.`,
              },
              {
                q: 'How do I view my fees in the dashboard?',
                a: 'Go to Dashboard → Billing & Plans. You\'ll see Total Profits, Fees Collected, Pending Fees, Recent Transactions, and Charge History.',
              },
              {
                q: 'Can I cancel my bot and stop paying?',
                a: 'Yes. Stop or delete your bot at any time — you\'ll only owe fees for profits already made. No cancellation fees or penalties.',
              },
              {
                q: 'Why USDC instead of credit card?',
                a: 'USDC on Base settles in seconds, costs less than $0.01 per transaction, and has no chargebacks or processor fees.',
              },
              {
                q: 'Can I request a refund or fee waiver?',
                a: 'Refunds and fee waivers are reviewed case-by-case. Contact support@nexusmeme.com with details.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  {q}
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 rounded-lg p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Start Trading?</h2>
          <p className="mb-6 text-blue-100">10-day free trial. Pay {fee} only when you profit.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/dashboard/bots/new" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition">
              Create Bot
            </Link>
            <Link href="/dashboard/billing" className="bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition border border-blue-500">
              View Billing Dashboard
            </Link>
          </div>
        </section>

        <section className="bg-slate-100 dark:bg-slate-900 rounded-lg p-8 text-center">
          <p className="text-slate-700 dark:text-slate-300 mb-4"><strong>Still have questions?</strong> We&apos;re here to help.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="mailto:support@nexusmeme.com" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Email Support</a>
            <span className="text-slate-400">•</span>
            <Link href="/dashboard/support" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Contact Form</Link>
            <span className="text-slate-400">•</span>
            <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Back to Help Center</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
