import { Metadata } from 'next';
import Link from 'next/link';

/**
 * Performance Fees Help Page
 * Dedicated page for performance fee documentation
 * SEO-optimized with metadata and structured data
 */

export const metadata: Metadata = {
  title: 'Performance Fees Guide - NexusMeme Trading Bot Platform',
  description:
    'Learn how NexusMeme performance fees work. You only pay 15% on profits, monthly billing, and complete fee breakdown with examples.',
  keywords: 'performance fees, trading fees, 15% fee model, billing, crypto trading, NexusMeme',
  alternates: {
    canonical: 'https://nexusmeme.com/help/performance-fees',
  },
  openGraph: {
    title: 'Performance Fees Guide - NexusMeme',
    description: 'Complete guide to performance-based fee model',
    url: 'https://nexusmeme.com/help/performance-fees',
    type: 'website',
  },
};

const feeSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much do NexusMeme fees cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NexusMeme charges 15% performance fee only on profitable trades. You pay nothing on losing trades or if your bot has no activity. The fee is automatically charged monthly on the 1st.',
      },
    },
    {
      '@type': 'Question',
      name: 'When am I charged?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All fees for the month are combined and charged on the 1st of each month at 2 AM UTC. Your payment is processed through Stripe with automatic retries if the initial charge fails.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if my bot loses money?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You are not charged for losing trades. Only profitable trades incur the 15% performance fee. If your bot has no profitable trades in a month, there is no charge.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I trade multiple pairs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Your bot trades BTC and ETH — the most established crypto markets. Fees are calculated on the combined profits across all pairs.',
      },
    },
  ],
};

export default function PerformanceFeesPage() {
  return (
    <>
      <div className="min-h-screen bg-white dark:bg-slate-950">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 text-white py-8 px-4 sm:px-6 lg:px-8 shadow-lg">
          <div className="max-w-4xl mx-auto">
            <Link href="/help" className="text-blue-100 hover:text-white mb-4 inline-block text-sm">
              ← Back to Help Center
            </Link>
            <h1 className="text-4xl font-bold mb-2">Performance Fees Guide</h1>
            <p className="text-blue-100">Understand how our 15% fee model works</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
          {/* Overview */}
          <section>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">How Performance Fees Work</h2>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
                NexusMeme uses a <strong>performance-based pricing model</strong>. You only pay <strong>15% of your profits</strong> when your trading bot generates profitable trades. There are no subscription fees, no monthly minimums, and no setup costs. We only earn when you earn.
              </p>
              <ul className="space-y-2 text-slate-700 dark:text-slate-300">
                <li>✓ Pay only when profitable</li>
                <li>✓ Losing trades don't cost anything</li>
                <li>✓ Transparent 15% fee on profits</li>
                <li>✓ Monthly billing on the 1st</li>
                <li>✓ Automatic payment processing via Stripe</li>
              </ul>
            </div>
          </section>

          {/* Example */}
          <section>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Example Month</h2>
            <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-lg p-8">
              <p className="text-sm text-slate-400 mb-6">Here's what a typical month looks like:</p>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Trade 1: BTC/USD profit</span>
                  <span className="font-mono">+$500</span>
                </div>
                <div className="flex justify-between pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Trade 2: ETH/USD profit</span>
                  <span className="font-mono">+$300</span>
                </div>
                <div className="flex justify-between pb-3 border-b border-slate-700">
                  <span className="text-slate-300">Trade 3: BTC/EUR loss (no fee)</span>
                  <span className="font-mono text-red-400">-$200</span>
                </div>
                <div className="pt-3 space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>Total Profits</span>
                    <span className="font-mono">$800</span>
                  </div>
                  <div className="flex justify-between text-blue-400 font-semibold">
                    <span>Your Fee (15%)</span>
                    <span className="font-mono">$120</span>
                  </div>
                  <div className="flex justify-between text-green-400 font-semibold pt-2 border-t border-slate-700">
                    <span>You Keep</span>
                    <span className="font-mono">$680</span>
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
                  All fees are charged on the <strong>1st of each month at 2:00 AM UTC</strong>. Your pending fees from the previous month are combined into a single charge.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">BTC & ETH Trading</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  Your bot trades BTC and ETH — the most established crypto markets. Fees are calculated on <strong>total profits across all pairs</strong> in a single monthly invoice.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Payment Method</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  Payments are processed through <strong>Stripe</strong>, a PCI DSS Level 1 compliant payment processor. Your payment method is never stored on our servers.
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Automatic Retries</h3>
                <p className="text-slate-700 dark:text-slate-300">
                  If a charge fails, Stripe automatically retries payment several times over the following days. You will be notified if additional action is needed.
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
                  <p className="text-sm text-green-800 dark:text-green-200">Your billing account is in good standing. Charges are processed normally each month.</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="text-2xl flex-shrink-0">🟡</div>
                <div>
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-100">Past Due</h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">A charge failed and Stripe is retrying automatically. Update your payment method in the billing portal to resolve immediately.</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="text-2xl flex-shrink-0">🔴</div>
                <div>
                  <h4 className="font-semibold text-red-900 dark:text-red-100">Suspended</h4>
                  <p className="text-sm text-red-800 dark:text-red-200">Multiple charge attempts have failed. Your trading bot will pause in 24 hours. Update your payment method immediately to resume trading.</p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQs */}
          <section>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  Do I pay if my bot loses money?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  No. You only pay 15% on profitable trades. If your bot loses money or has no trades, there is no fee. You only pay when you actually make money.
                </p>
              </details>

              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  How do I view my fees in the dashboard?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  Go to <strong>Dashboard → Billing</strong> to see your performance fees dashboard. You'll see:
                </p>
                <ul className="text-slate-700 dark:text-slate-300 mt-3 ml-4 space-y-2">
                  <li>• Total Profits - Sum of all profitable trades</li>
                  <li>• Fees Collected - 15% already paid out</li>
                  <li>• Pending Fees - Due on the 1st of next month</li>
                  <li>• Recent Transactions - Individual trades and their fees</li>
                  <li>• Charge History - Monthly billing cycles</li>
                </ul>
              </details>

              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  Can I cancel my bot and stop paying?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  Yes. Delete your bot at any time, and you'll only be charged for past profits. There are no cancellation fees or penalties. If you delete your bot before the monthly billing date, you won't be charged for that month's fees.
                </p>
              </details>

              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  Is my payment information secure?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  Yes. We use Stripe, a <strong>PCI DSS Level 1 compliant</strong> payment processor. Your card details are never stored on our servers - Stripe handles all payment security and encryption.
                </p>
              </details>

              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  What if I have questions about my fees?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  Contact our support team at{' '}
                  <a href="mailto:support@nexusmeme.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                    support@nexusmeme.com
                  </a>
                  . We're happy to explain your charges or discuss any billing issues. You can also visit your{' '}
                  <a href="/dashboard/billing" className="text-blue-600 dark:text-blue-400 hover:underline">
                    billing dashboard
                  </a>{' '}
                  for detailed invoice information.
                </p>
              </details>

              <details className="group bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <summary className="font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                  Can I request a refund or fee waiver?
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="text-slate-700 dark:text-slate-300 mt-4">
                  Refunds and fee waivers are reviewed on a case-by-case basis. Please contact{' '}
                  <a href="mailto:support@nexusmeme.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                    support@nexusmeme.com
                  </a>{' '}
                  with details about your request. We consider factors like trading bot errors, technical issues, or legitimate disputes.
                </p>
              </details>
            </div>
          </section>

          {/* CTA Section */}
          <section className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 rounded-lg p-8 text-white text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="mb-6 text-blue-100">Create your first bot and only pay when you profit.</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link
                href="/dashboard/bots/new"
                className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition"
              >
                Create Bot
              </Link>
              <Link
                href="/dashboard/billing"
                className="bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition border border-blue-500"
              >
                View Billing Dashboard
              </Link>
            </div>
          </section>

          {/* Support Section */}
          <section className="bg-slate-100 dark:bg-slate-900 rounded-lg p-8 text-center">
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              <strong>Still have questions?</strong> We're here to help.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <a
                href="mailto:support@nexusmeme.com"
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                Email Support
              </a>
              <span className="text-slate-400">•</span>
              <Link href="/dashboard/support" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                Contact Form
              </Link>
              <span className="text-slate-400">•</span>
              <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                Back to Help Center
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* FAQ Schema Markup for Search Engines */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(feeSchema) }} />
    </>
  );
}
