import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy - NexusMeme Trading Bot Platform',
  description:
    'Learn how NexusMeme uses cookies and how you can manage your preferences.',
  alternates: {
    canonical: 'https://nexusmeme.com/legal/cookies',
  },
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 text-white py-12 px-4 sm:px-6 lg:px-8 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
          <p className="text-slate-300">Last Updated: January 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {/* Overview */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
          <p className="text-slate-700 dark:text-slate-300">
            This Cookie Policy explains how NexusMeme ("we", "us") uses cookies and similar
            technologies to provide, protect, and improve our trading platform. By using the
            platform, you consent to the use of cookies as described here.
          </p>
        </div>

        {/* What cookies are */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. What Are Cookies?</h2>
          <p className="text-slate-700 dark:text-slate-300">
            Cookies are small text files stored on your device by your browser. They help us
            remember your preferences, keep you signed in, secure your account, and measure how the
            platform is used.
          </p>
        </section>

        {/* Types of cookies */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. Types of Cookies We Use</h2>
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Essential</h3>
              <p className="text-slate-700 dark:text-slate-300 text-sm">
                Required for core functionality, including authentication, session management, CSRF
                protection, and keeping your preferences intact.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Performance & Analytics</h3>
              <p className="text-slate-700 dark:text-slate-300 text-sm">
                Help us understand usage patterns, diagnose issues, and improve reliability. Data is
                aggregated and not used to identify you individually.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Functional</h3>
              <p className="text-slate-700 dark:text-slate-300 text-sm">
                Enable optional features such as language, theme, and dashboard layout preferences
                to provide a smoother experience.
              </p>
            </div>
          </div>
        </section>

        {/* Third-party */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. Third-Party Cookies</h2>
          <p className="text-slate-700 dark:text-slate-300">
            We may use trusted third-party services for analytics, performance monitoring, and
            payment processing. These providers may set their own cookies to deliver their services.
            We do not allow third parties to use cookies for advertising or profiling.
          </p>
        </section>

        {/* Managing cookies */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. Managing Your Preferences</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            You can manage or disable cookies in your browser settings. Essential cookies are
            required for the platform to function; disabling them may break login, security, and
            trading features.
          </p>
          <ul className="space-y-2 text-slate-700 dark:text-slate-300 ml-6 list-disc">
            <li>Adjust cookie and tracking settings in your browser preferences</li>
            <li>Use private/incognito mode to limit persistence</li>
            <li>Clear cookies to remove stored preferences and sessions</li>
          </ul>
        </section>

        {/* Data retention */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Retention</h2>
          <p className="text-slate-700 dark:text-slate-300">
            Cookies expire after their defined lifespan or when you clear them. Session cookies are
            removed when you close your browser; persistent cookies last no longer than 13 months
            unless you clear them sooner.
          </p>
        </section>

        {/* Updates */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. Updates to This Policy</h2>
          <p className="text-slate-700 dark:text-slate-300">
            We may update this Cookie Policy to reflect product changes or legal requirements. We
            will update the "Last Updated" date above and, where appropriate, notify you through the
            platform or email.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Contact Us</h2>
          <p className="text-slate-700 dark:text-slate-300">
            Questions about this Cookie Policy? Email us at support@nexusmeme.com.
          </p>
        </section>
      </div>
    </div>
  );
}
