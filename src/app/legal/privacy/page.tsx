import { Metadata } from 'next';
import Link from 'next/link';

/**
 * Privacy Policy Page
 * Comprehensive privacy policy covering data collection and usage
 * SEO-optimized with metadata
 */

export const metadata: Metadata = {
  title: 'Privacy Policy - NexusMeme Trading Bot Platform',
  description:
    'NexusMeme privacy policy. Learn how we collect, use, and protect your data.',
  alternates: {
    canonical: 'https://nexusmeme.com/legal/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-slate-300">Last Updated: January 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {/* Overview */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-700 dark:text-slate-300">
            NexusMeme ("we", "us", "our") operates the NexusMeme platform. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our service and the choices you have associated with that data.
          </p>
        </div>

        {/* Section 1 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. Information We Collect</h2>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Personal Identification Information</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            When you create an account, we collect:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Email address</li>
            <li>• Full name</li>
            <li>• Password (hashed and encrypted)</li>
            <li>• Timezone and language preferences</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Trading Data</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We collect and store:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Trading bot configurations and strategies</li>
            <li>• Trade execution history and performance metrics</li>
            <li>• Profit and loss data</li>
            <li>• Fees calculated and charged</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Payment Information</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Payment details are handled by Stripe, a PCI DSS Level 1 compliant processor. We do not store full credit card information on our servers. We only receive and store:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Last 4 digits of payment method</li>
            <li>• Billing address</li>
            <li>• Charge history and invoice records</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Exchange API Credentials</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            You provide exchange API keys (Kraken, Binance, Coinbase) to enable trading. These credentials are:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Encrypted at rest using industry-standard AES-256 encryption</li>
            <li>• Never displayed in plaintext after initial entry</li>
            <li>• Only used to execute trades on your behalf via the exchange's API</li>
            <li>• Never shared with third parties</li>
          </ul>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Usage and Analytics Data</h3>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We collect anonymous usage data including:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• IP address</li>
            <li>• Browser type and version</li>
            <li>• Pages visited and time spent</li>
            <li>• Device information</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. How We Use Your Information</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">We use collected information for:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Creating and maintaining your account</li>
            <li>• Executing and monitoring trading bots</li>
            <li>• Processing payments and billing</li>
            <li>• Sending service-related notifications and updates</li>
            <li>• Improving platform features and user experience</li>
            <li>• Detecting and preventing fraud or security issues</li>
            <li>• Complying with legal obligations</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. Data Security</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We implement industry-standard security measures to protect your data:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• SSL/TLS encryption for data in transit</li>
            <li>• AES-256 encryption for sensitive data at rest</li>
            <li>• Regular security audits and penetration testing</li>
            <li>• Restricted access to personal data (need-to-know basis)</li>
            <li>• Secure password hashing with bcrypt</li>
          </ul>
          <p className="text-slate-700 dark:text-slate-300">
            While we strive to protect your information, no method of transmission over the internet is 100% secure. You are responsible for maintaining the confidentiality of your account credentials.
          </p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. Data Sharing and Third Parties</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We do not sell or rent your personal information to third parties. We may share information with:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• <strong>Payment Processors:</strong> Stripe for billing and payment processing</li>
            <li>• <strong>Exchanges:</strong> Only API credentials you provide to Kraken, Binance, or Coinbase</li>
            <li>• <strong>Legal Authorities:</strong> When required by law or court order</li>
            <li>• <strong>Service Providers:</strong> Only as needed to operate the platform</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Data Retention</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We retain your data for as long as your account is active or as needed to provide services. After account deletion:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Account information is deleted within 30 days</li>
            <li>• Trading history is retained for 7 years for tax and regulatory purposes</li>
            <li>• Billing records are retained for 7 years as required by law</li>
            <li>• API credentials are permanently deleted</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. Your Rights and Choices</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">You have the right to:</p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Access your personal data</li>
            <li>• Correct inaccurate information</li>
            <li>• Request deletion of your data (subject to legal requirements)</li>
            <li>• Opt-out of non-essential communications</li>
            <li>• Export your data in a machine-readable format</li>
          </ul>
          <p className="text-slate-700 dark:text-slate-300">
            To exercise these rights, contact support@nexusmeme.com.
          </p>
        </section>

        {/* Section 7 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Cookies and Tracking</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We use cookies and similar technologies to:
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 mb-4">
            <li>• Maintain your login session</li>
            <li>• Remember your preferences</li>
            <li>• Analyze platform usage (analytics)</li>
            <li>• Prevent fraud and security issues</li>
          </ul>
          <p className="text-slate-700 dark:text-slate-300">
            You can disable cookies in your browser settings, but this may affect functionality.
          </p>
        </section>

        {/* Section 8 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">8. GDPR and CCPA Compliance</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            <strong>For EU Residents (GDPR):</strong> We process your data based on your consent. You have rights to data portability, erasure, and objection. Our Data Protection Officer can be contacted at support@nexusmeme.com.
          </p>
          <p className="text-slate-700 dark:text-slate-300">
            <strong>For California Residents (CCPA):</strong> You have rights to know, delete, and opt-out of data sales (which we don't do). To exercise these rights, contact support@nexusmeme.com.
          </p>
        </section>

        {/* Section 9 */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">9. Changes to Privacy Policy</h2>
          <p className="text-slate-700 dark:text-slate-300">
            We may update this privacy policy. Changes will be posted on this page with an updated "Last Updated" date. Your continued use of the Platform after changes constitute your acceptance.
          </p>
        </section>

        {/* Contact */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-3">Questions About Your Privacy?</h2>
          <p className="text-blue-900 dark:text-blue-100">
            Contact our privacy team at{' '}
            <a href="mailto:support@nexusmeme.com" className="font-semibold underline">
              support@nexusmeme.com
            </a>
          </p>
        </div>

        {/* Links */}
        <div className="flex gap-4 justify-center text-sm">
          <Link href="/legal/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
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
