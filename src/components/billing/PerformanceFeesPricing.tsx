'use client';

import Link from 'next/link';

/**
 * Performance Fees Pricing Component
 * Explains the 15% performance fee model
 * Replaces traditional subscription tiers
 */
export function PerformanceFeesPricing() {
  return (
    <div className="space-y-12">
      {/* Main Pricing */}
      <div className="text-center">
        <div className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-semibold mb-6">
          Performance-Based Pricing
        </div>
        <div className="flex items-baseline justify-center gap-2 mb-6">
          <span className="text-5xl font-bold text-slate-900 dark:text-white">15%</span>
          <span className="text-xl text-slate-600 dark:text-slate-400">of profits</span>
        </div>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          You only pay when your bot makes profits. No subscription fees, no monthly minimums, no setup costs.
        </p>
      </div>

      {/* How It Works */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900/20 rounded-lg p-8 border border-slate-200 dark:border-slate-800">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">How It Works</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              1
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Bot Trades</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your AI bot executes trades based on your strategy
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* Step 2 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              2
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Trade Closes</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              If profitable, 15% fee is recorded pending
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* Step 3 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full font-bold mb-4">
              3
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Monthly Billing</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              1st of month: all fees charged automatically
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Why Performance Fees?</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">
                ✓
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Aligned Incentives</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                We win when you win. We're motivated to make profitable bots.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">
                ✓
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">No Risk</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Losing trades don't cost anything. Only pay on profits.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">
                ✓
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">BTC & ETH Focus</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Trade the most liquid, profitable crypto markets. Fees scale with your success.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-blue-600 text-white">
                ✓
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Transparent</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Simple 15% model. No hidden fees or surprise charges.
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
            <span className="text-slate-300">Trade 1: BTC/USD profit</span>
            <span className="font-mono">+$500</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-slate-700">
            <span className="text-slate-300">Trade 2: ETH/USD profit</span>
            <span className="font-mono">+$300</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-slate-700">
            <span className="text-slate-300">Trade 3: BTC/EUR loss</span>
            <span className="font-mono text-red-400">-$200</span>
          </div>

          <div className="pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Total Profits</span>
              <span className="font-mono font-semibold">$800</span>
            </div>
            <div className="flex justify-between text-blue-400">
              <span>Your Fee (15%)</span>
              <span className="font-mono font-semibold">$120</span>
            </div>
            <div className="flex justify-between text-green-400 pt-2 border-t border-slate-700">
              <span>You Keep</span>
              <span className="font-mono font-semibold">$680</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-400 mt-6">
          💡 Note: Losing trades (Trade 3) don't incur fees. You only pay on profits.
        </p>
      </div>

      {/* Comparison */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">vs. Traditional Plans</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-semibold text-slate-900 dark:text-white">
                  Feature
                </th>
                <th className="text-center py-3 px-4 font-semibold text-slate-900 dark:text-white">
                  Traditional Plans
                </th>
                <th className="text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">
                  Performance Fees
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Monthly Cost</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  $29-$299
                  <br />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Regardless of profit</span>
                </td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  15% of profits
                  <br />
                  <span className="text-xs text-green-600 dark:text-green-400">Only when you profit</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Setup Fee</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Often $0-$99</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  <span className="text-green-600 dark:text-green-400 font-semibold">$0</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Pay Without Profit</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  <span className="text-red-600 dark:text-red-400">Yes</span>
                </td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  <span className="text-green-600 dark:text-green-400">No</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Bots per User</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Usually 1-3</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  <span className="text-green-600 dark:text-green-400">1 Focused Bot</span>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">AI Strategy</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">Limited Options</td>
                <td className="py-3 px-4 text-center text-slate-900 dark:text-white">
                  <span className="text-green-600 dark:text-green-400">✓ Advanced AI Strategy</span>
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
          Create your first bot in minutes. Set up billing during bot creation.
        </p>
        <Link
          href="/dashboard/bots/new"
          className="inline-block bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition"
        >
          Create Your First Bot
        </Link>
      </div>

      {/* FAQ */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Questions?</h3>

        <div className="space-y-4">
          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Do I pay if my bot loses money?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              No. You only pay 15% on profitable trades. If your bot loses money or has no trades, there's no fee.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              When do I get charged?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Monthly on the 1st at 2 AM UTC. All fees from profitable trades in that month are combined into one charge.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Can I trade multiple pairs?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Yes! Your bot trades BTC & ETH — the most liquid, profitable crypto markets. Fees are calculated on the combined profits across all pairs.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Is my payment information secure?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Yes. We use Stripe for payments, a PCI DSS Level 1 compliant processor. Your card details are never stored on our servers.
            </p>
          </details>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 group cursor-pointer">
            <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
              Can I cancel anytime?
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
              Yes. Delete your bot and stop paying. No cancellation fees or penalties. You only pay for past profits.
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
