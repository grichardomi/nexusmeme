'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function PerformanceFeesPricing() {
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [flatFeeUsdc, setFlatFeeUsdc] = useState<number | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => setFeePercent(d.feePercent ?? null))
      .catch(() => {});
    fetch('/api/billing/flat-fee')
      .then(r => r.json())
      .then(d => setFlatFeeUsdc(typeof d.flatFeeUsdc === 'number' ? d.flatFeeUsdc : null))
      .catch(() => {});
    fetch('/api/billing/trial-days')
      .then(r => r.json())
      .then(d => setTrialDays(typeof d.trialDays === 'number' ? d.trialDays : null))
      .catch(() => {});
  }, []);

  const fee = feePercent !== null ? `${feePercent}%` : '…';
  const flatFee = flatFeeUsdc !== null && flatFeeUsdc > 0 ? `$${flatFeeUsdc} USDC/mo` : null;
  const feeDecimal = feePercent !== null ? feePercent / 100 : null;

  return (
    <div className="space-y-12">
      {/* Main Pricing */}
      <div className="text-center">
        <div className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-semibold mb-6">
          Simple, Transparent Pricing
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 mb-6">
          {/* Flat fee */}
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-5xl font-bold text-slate-900 dark:text-white">
                {flatFeeUsdc !== null && flatFeeUsdc > 0 ? `$${flatFeeUsdc}` : '…'}
              </span>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-sm">USDC / month</div>
            <div className="text-slate-700 dark:text-slate-300 font-medium mt-1">Platform fee</div>
          </div>

          <div className="text-3xl font-light text-slate-300 dark:text-slate-600">+</div>

          {/* Performance fee */}
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-5xl font-bold text-slate-900 dark:text-white">{fee}</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-sm">of profits only</div>
            <div className="text-slate-700 dark:text-slate-300 font-medium mt-1">Performance fee</div>
          </div>
        </div>

        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          {flatFee ? `${flatFee} keeps the platform running. ` : ''}
          {fee} performance fee only when your bot profits — $0 when it doesn&apos;t.
        </p>
      </div>

      {/* How It Works */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900/20 rounded-lg p-8 border border-slate-200 dark:border-slate-800">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">How It Works</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              1
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Flat Fee Billed Monthly</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {flatFee ?? '…'} on the 1st — covers infrastructure regardless of trade outcomes
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              2
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Bot Trades</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your AI bot executes trades 24/7 based on market regime and AI signals
            </p>
          </div>

          <div className="hidden md:flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              3
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Performance Fee on Profits</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {fee} of monthly profits billed on the 1st. $0 if your bot had no profitable trades.
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Why This Model?</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">✓</div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Aligned Incentives</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                We earn more only when you earn more. Your success drives ours.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">✓</div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Predictable Platform Cost</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {flatFee ?? 'A small flat fee'} covers infrastructure. No surprise overages.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">✓</div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">$0 Performance Fee on Losses</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Losing months? No performance fee. Just the flat platform fee.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">✓</div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Transparent</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {flatFee ?? '…'} flat + {fee} on profits. No hidden fees or surprise charges.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Example */}
      <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-lg p-8 border border-slate-800">
        <h3 className="text-2xl font-bold mb-8">Example Month</h3>

        <div className="space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-slate-700">
            <span className="text-slate-300">Trade 1: BTC/USDT profit</span>
            <span className="font-mono">+$500</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-slate-700">
            <span className="text-slate-300">Trade 2: ETH/USDT profit</span>
            <span className="font-mono">+$300</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-slate-700">
            <span className="text-slate-300">Trade 3: BTC/USDT loss</span>
            <span className="font-mono text-red-400">-$200</span>
          </div>

          <div className="pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Total Profits</span>
              <span className="font-mono font-semibold">$800</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Platform fee (flat)</span>
              <span className="font-mono">
                {flatFeeUsdc !== null && flatFeeUsdc > 0 ? `$${flatFeeUsdc}.00` : '…'}
              </span>
            </div>
            <div className="flex justify-between text-blue-400">
              <span>Performance fee ({fee})</span>
              <span className="font-mono font-semibold">
                {feeDecimal !== null ? `$${(800 * feeDecimal).toFixed(2)}` : '…'}
              </span>
            </div>
            <div className="flex justify-between text-green-400 pt-2 border-t border-slate-700">
              <span>You Keep</span>
              <span className="font-mono font-semibold">
                {feeDecimal !== null && flatFeeUsdc !== null
                  ? `$${(800 * (1 - feeDecimal) - flatFeeUsdc).toFixed(2)}`
                  : '…'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-400 mt-6">
          💡 Losing trades don&apos;t incur performance fees. In a losing month you only pay the {flatFee ?? 'flat platform fee'}.
        </p>
      </div>

      {/* Comparison */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">vs. Traditional Plans</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900 dark:text-white">Traditional Plans</th>
                <th className="text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">NexusMeme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Monthly Platform Fee</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  $29–$299
                  <br />
                  <span className="text-xs text-slate-500">Regardless of profit</span>
                </td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  {flatFee ?? '…'}
                  <br />
                  <span className="text-xs text-green-600 dark:text-green-400">Small fixed cost</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Performance Fee</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Often 0%</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  {fee} of profits
                  <br />
                  <span className="text-xs text-green-600 dark:text-green-400">$0 on losing months</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Pay Without Profit</td>
                <td className="py-3 px-4 text-center">
                  <span className="text-red-600 dark:text-red-400">Full subscription</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="text-green-600 dark:text-green-400">Flat fee only</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">AI Strategy</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Limited</td>
                <td className="py-3 px-4 text-center">
                  <span className="text-green-600 dark:text-green-400">✓ Advanced AI</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Pairs</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Varies</td>
                <td className="py-3 px-4 text-center">
                  <span className="text-green-600 dark:text-green-400">BTC &amp; ETH</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg p-8 text-center text-white">
        <h3 className="text-2xl font-bold mb-4">Ready to Get Started?</h3>
        <p className="mb-6 text-blue-100">
          {trialDays !== null ? `${trialDays}-day` : '…'} free trial — no credit card required. Start trading in minutes.
        </p>
        <Link
          href="/dashboard/bots/new"
          className="inline-block bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition"
        >
          Start Free Trial
        </Link>
      </div>

      {/* FAQ */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Questions?</h3>

        <div className="space-y-4">
          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              What does the flat fee cover?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              The {flatFee ?? 'monthly flat fee'} covers infrastructure — servers, market data feeds, AI inference, and 24/7 bot uptime. It&apos;s billed on the 1st regardless of trade outcomes.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Do I pay the performance fee if my bot loses money?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              No. You only pay the {fee} performance fee on profitable trades. Losing months incur only the {flatFee ?? 'flat platform fee'}.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              When do I get charged?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Both fees are billed on the 1st of each month at 2 AM UTC. The flat fee and any performance fees from profitable trades are combined into one invoice payable in USDC on Base.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Is my payment information secure?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Yes. Payments are made with USDC on Base — a blockchain-native stablecoin. No credit card details stored. Pay with MetaMask, WalletConnect, or any USDC-compatible wallet.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Can I cancel anytime?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Yes. Delete your bot and stop paying. No cancellation fees or penalties. You only owe fees for the current billing period.
            </p>
          </details>
        </div>

        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Want to learn more?</strong> Read our complete{' '}
            <Link href="/help/performance-fees" className="underline font-semibold hover:text-blue-700 dark:hover:text-blue-300">
              Performance Fees Guide
            </Link>
            {' '}or{' '}
            <Link href="/dashboard/support" className="underline font-semibold hover:text-blue-700 dark:hover:text-blue-300">
              contact support
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
