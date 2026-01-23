'use client';

import { PerformanceFeesPricing } from '@/components/billing/PerformanceFeesPricing';
import { Footer } from '@/components/layouts/Footer';

/**
 * Pricing Page
 * Displays performance fee pricing model
 * Supports light/dark mode with Tailwind CSS
 */

export default function PricingPage() {

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-24 bg-gradient-to-b from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-4">
                Pay Only When You Profit
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                Performance-based pricing means your costs align with your success. Trade with confidence knowing you only pay when you win.
              </p>
            </div>

            {/* Pricing Component */}
            <PerformanceFeesPricing />
          </div>
        </section>

        {/* Trust Section */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-24 bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-12">
              Trusted by traders worldwide
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  5000+
                </div>
                <p className="text-slate-600 dark:text-slate-400">Active Traders</p>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  $500M+
                </div>
                <p className="text-slate-600 dark:text-slate-400">Trading Volume</p>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  99.9%
                </div>
                <p className="text-slate-600 dark:text-slate-400">Uptime Guarantee</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
