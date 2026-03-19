import { Metadata } from 'next';
import Link from 'next/link';

/**
 * Terms of Service Page
 * Comprehensive terms covering usage, billing, and disclaimers
 * SEO-optimized with metadata
 */

export const metadata: Metadata = {
  title: 'Terms of Service - NexusMeme Trading Bot Platform',
  description:
    'Read the NexusMeme terms of service. Covers account usage, performance fees, billing, and trading bot operation.',
  alternates: {
    canonical: 'https://nexusmeme.com/legal/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 text-white py-12 px-4 sm:px-6 lg:px-8 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-slate-300">Last Updated: March 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {/* Table of Contents */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Table of Contents</h2>
          <ul className="space-y-2 text-sm text-blue-600 dark:text-blue-400">
            <li><a href="#acceptance" className="hover:underline">1. Acceptance of Terms</a></li>
            <li><a href="#use-license" className="hover:underline">2. License to Use</a></li>
            <li><a href="#trading-disclaimer" className="hover:underline">3. Trading Disclaimer</a></li>
            <li><a href="#performance-fees" className="hover:underline">4. Performance Fees & Billing</a></li>
            <li><a href="#payment" className="hover:underline">5. Payment Methods</a></li>
            <li><a href="#user-responsibilities" className="hover:underline">6. User Responsibilities</a></li>
            <li><a href="#liability" className="hover:underline">7. Limitation of Liability & Indemnification</a></li>
            <li><a href="#force-majeure" className="hover:underline">8. Force Majeure</a></li>
            <li><a href="#termination" className="hover:underline">9. Termination</a></li>
            <li><a href="#governing-law" className="hover:underline">10. Governing Law & Disputes</a></li>
            <li><a href="#changes" className="hover:underline">11. Changes to Terms</a></li>
          </ul>
        </div>

        {/* Section 1 */}
        <section id="acceptance">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            By accessing and using NexusMeme ("the Platform"), you accept and agree to be bound by and comply with these Terms of Service. If you do not agree to abide by the above, please do not use this service.
          </p>
          <p className="text-slate-700 dark:text-slate-300">
            We reserve the right to update these terms at any time. Your continued use of the Platform following the posting of revised terms means you accept and agree to the changes.
          </p>
        </section>

        {/* Section 2 */}
        <section id="use-license">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. License to Use</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            NexusMeme grants you a limited, non-exclusive, non-transferable license to use the Platform for your personal, non-commercial trading purposes, subject to these terms.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">You may not:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Reproduce, duplicate, copy, or sell any part of the Platform</li>
            <li>• Attempt to gain unauthorized access to the Platform or its systems</li>
            <li>• Use the Platform for commercial purposes without authorization</li>
            <li>• Interfere with or disrupt the integrity of the Platform</li>
            <li>• Use automated tools (bots, scrapers) beyond the permitted bot features</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section id="trading-disclaimer">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. Trading Disclaimer</h2>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-4">
            <h3 className="font-bold text-red-900 dark:text-red-100 mb-2">⚠️ Important Risk Warning</h3>
            <p className="text-red-900 dark:text-red-100 text-sm">
              Cryptocurrency trading involves substantial risk of loss. NexusMeme's automated trading strategies are provided "as is" without any guarantee of profitability or success. Past performance is not indicative of future results.
            </p>
          </div>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            You acknowledge and agree that:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Trading cryptocurrency is inherently risky and may result in partial or total loss of capital</li>
            <li>• NexusMeme does not provide financial advice, only trading automation tools</li>
            <li>• You are solely responsible for any trading decisions and losses incurred</li>
            <li>• Market conditions can change unexpectedly, affecting bot performance</li>
            <li>• You should never invest more capital than you can afford to lose</li>
            <li>• The $1,000 USDT minimum balance is a floor requirement only — operating close to the minimum increases the impact of any single trade on your overall account and may cause trading gaps if your balance dips below the threshold</li>
            <li>• Paper trading performance during the free trial is simulated and does not account for real exchange spreads, slippage, partial fills, or order execution latency — live trading results will differ and may be lower than trial performance</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section id="performance-fees">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. Performance Fees & Billing</h2>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Fee Model</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            NexusMeme charges a <strong>performance fee on profits only</strong>. The current fee rate is displayed in your Billing Dashboard and at <a href="/help/performance-fees" className="text-blue-600 dark:text-blue-400 underline">nexusmeme.com/help/performance-fees</a>. You are charged when your trading bot generates profitable trades. Losing trades incur no fee.
          </p>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Minimum Balance Requirement</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Live trading requires a minimum of <strong>$1,000 USDT/USD</strong> in your exchange account. If your account balance falls below this threshold, the bot will pause trading until the balance is restored. NexusMeme is not liable for missed trading opportunities resulting from an insufficient balance.
          </p>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Billing Schedule</h3>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Fees are calculated on all profitable trades completed during each calendar month</li>
            <li>• Combined monthly charges are processed on the <strong>1st of each month at 2:00 AM UTC</strong></li>
            <li>• Pending fees are shown in your dashboard before billing</li>
            <li>• If multiple bots are active, profits are combined before calculating the fee</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Billing Status</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-2">Your billing account has three possible statuses:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• <strong>Active:</strong> Account in good standing; all invoices paid</li>
            <li>• <strong>Past Due:</strong> A USDC invoice is overdue; your bot continues trading until Day 14</li>
            <li>• <strong>Suspended:</strong> Invoice unpaid beyond 14 days; bot is paused until USDC payment is confirmed on the Base network</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">No Charge Scenarios</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-2">You are not charged when:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Your bot makes no trades during a month</li>
            <li>• All trades during a month result in losses</li>
            <li>• You delete your bot before the monthly billing date</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Refunds & Adjustments</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Refunds and fee adjustments are considered on a case-by-case basis for legitimate disputes, technical errors, or system failures. Contact support@nexusmeme.com to request a review. Standard trading losses are not eligible for refunds.
          </p>
        </section>

        {/* Section 5 */}
        <section id="payment">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Payment Methods</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            All payments are made via USDC on the Base network. Monthly invoices are generated on the 1st of each month and must be paid by sending USDC to the wallet address shown in your billing dashboard.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            You are responsible for paying invoices on time. If an invoice remains unpaid past its due date, your account may be suspended.
          </p>
        </section>

        {/* Section 6 */}
        <section id="user-responsibilities">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. User Responsibilities</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">You are responsible for:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Maintaining the confidentiality of your account credentials</li>
            <li>• All activities occurring under your account</li>
            <li>• Ensuring your exchange API keys are configured with appropriate permissions for the trading mode selected (paper or live). NexusMeme is not liable for unintended exchange activity resulting from incorrectly configured or overly permissive API keys</li>
            <li>• Monitoring your trading activity and account balance</li>
            <li>• Maintaining sufficient exchange balance to meet the minimum live trading threshold</li>
            <li>• Compliance with all applicable laws and regulations in your jurisdiction, including tax reporting obligations on trading profits</li>
            <li>• Understanding the risks associated with automated cryptocurrency trading</li>
          </ul>
        </section>

        {/* Section 7 */}
        <section id="liability">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Limitation of Liability & Indemnification</h2>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 mb-4">
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              To the fullest extent permitted by law, NexusMeme and its owners, operators, and employees shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Platform, including but not limited to trading losses, loss of profits, or loss of data.
            </p>
            <p className="text-slate-700 dark:text-slate-300">
              This includes damages resulting from market volatility, technical failures, exchange outages, unauthorized access, incorrect API key configuration, or any cause beyond our reasonable control.
            </p>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Indemnification</h3>
          <p className="text-slate-700 dark:text-slate-300">
            You agree to indemnify, defend, and hold harmless NexusMeme and its owners, operators, and employees from and against any claims, liabilities, damages, losses, or expenses — including legal fees — arising out of or in any way connected with your use of the Platform, your violation of these Terms, your exchange API key configuration, or your violation of any applicable law or the rights of any third party.
          </p>
        </section>

        {/* Section 8 */}
        <section id="force-majeure">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">8. Force Majeure</h2>
          <p className="text-slate-700 dark:text-slate-300">
            NexusMeme shall not be held liable for any failure or delay in performance of its obligations where such failure or delay results from causes beyond its reasonable control, including but not limited to: exchange API outages or changes, blockchain network congestion or failure, internet or infrastructure outages, regulatory actions, acts of government, natural disasters, or other force majeure events. Trading opportunities missed during such periods are not compensable.
          </p>
        </section>

        {/* Section 9 */}
        <section id="termination">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">9. Termination</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We reserve the right to terminate your account at any time for violation of these terms, fraudulent activity, or other reasons at our sole discretion.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Upon termination, your trading bot will be stopped, and you will not incur additional charges. You remain responsible for any fees already incurred before termination.
          </p>
        </section>

        {/* Section 10 */}
        <section id="governing-law">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">10. Governing Law & Disputes</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            These Terms shall be governed by and construed in accordance with applicable law. Any dispute arising out of or in connection with these Terms that cannot be resolved informally shall first be submitted to good-faith mediation before any legal proceedings are initiated.
          </p>
          <p className="text-slate-700 dark:text-slate-300">
            To initiate a dispute resolution process, contact support@nexusmeme.com with a written description of the dispute. We will respond within 10 business days to attempt an informal resolution.
          </p>
        </section>

        {/* Section 11 */}
        <section id="changes">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">11. Changes to Terms</h2>
          <p className="text-slate-700 dark:text-slate-300">
            We may modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of the Platform after modifications constitute your acceptance of the new terms. We will notify users of significant changes via email.
          </p>
        </section>

        {/* Contact */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-3">Questions?</h2>
          <p className="text-blue-900 dark:text-blue-100">
            If you have questions about these terms, please contact us at{' '}
            <a href="mailto:support@nexusmeme.com" className="font-semibold underline">
              support@nexusmeme.com
            </a>
          </p>
        </div>

        {/* Links */}
        <div className="flex gap-4 justify-center text-sm">
          <Link href="/legal/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
            Privacy Policy
          </Link>
          <span className="text-slate-400">•</span>
          <Link href="/help/performance-fees" className="text-blue-600 dark:text-blue-400 hover:underline">
            Performance Fees Guide
          </Link>
          <span className="text-slate-400">•</span>
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
