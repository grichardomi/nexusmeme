'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
// import Image from 'next/image';
import { Footer } from '@/components/layouts/Footer';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect authenticated users to dashboard
    if (status === 'authenticated' && session?.user?.id) {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  // Show loading state while checking auth
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <main className="flex-1">
        {/* Hero Section - Premium Design */}
        <section className="px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 md:pt-28 pb-12 sm:pb-16 md:pb-24 bg-gradient-to-br from-white via-blue-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-900/50 dark:to-slate-900">
          <div className="max-w-7xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 px-4 py-2 rounded-full border border-blue-200 dark:border-blue-800">
                <span className="w-2 h-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  🚀 AI Crypto Trading Bots for Kraken, Binance, Coinbase
                </span>
              </div>
            </div>

              {/* Content */}
              <div className="flex flex-col items-center text-center space-y-6 lg:space-y-8 max-w-4xl mx-auto">
                {/* Main Headline - Benefit Focused */}
                <div>
                  <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
                    Automated <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Crypto Trading</span> That Works
                  </h1>

                  <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                    AI-powered bots focused on BTC & ETH — the most liquid, profitable crypto markets. Trade across Kraken, Binance, and Coinbase with a 10-day free trial.
                  </p>
                  <p className="text-base text-slate-600 dark:text-slate-400">
                    15% only when your bot profits. $0 when it doesn't. Other platforms charge $50-100/month whether you win or lose.
                  </p>
                </div>

                {/* Primary CTA - Prominent */}
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-4 pt-4 justify-center">
                  <Link
                    href="/auth/signup"
                    className="group inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-8 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    <span>Start Free Trial</span>
                    <svg className="w-5 h-5 ml-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  <Link
                    href="/auth/signin"
                    className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold py-4 px-8 rounded-xl transition duration-200"
                  >
                    Sign In
                  </Link>
                </div>

                {/* Trust Signals - Key Benefits */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 w-full">
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">BTC & ETH</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Focused Trading</div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">10 days</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Free Trial</div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">3 Exchanges</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Kraken, Binance, CB</div>
                  </div>
                </div>
              </div>
          </div>
        </section>

        {/* Why NexusMeme Section */}
        <section id="features" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 bg-white dark:bg-slate-950">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14 sm:mb-16">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6">
                Crypto Trading Built for <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Real Profits</span>
              </h2>
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
                AI-powered automation designed specifically for cryptocurrency markets on Kraken, Binance, and Coinbase
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-8">
              {/* Feature 1 - AI Strategies */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    AI Strategies
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Continuously learns and adapts to crypto market conditions
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-600 rounded-full flex-shrink-0"></span>
                    Real-time optimization
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-600 rounded-full flex-shrink-0"></span>
                    Dynamic risk management
                  </li>
                </ul>
              </div>

              {/* Feature 2 - Fast Execution */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    Lightning-Fast
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Sub-millisecond execution captures every profitable crypto opportunity
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-purple-600 rounded-full flex-shrink-0"></span>
                    Direct exchange connections
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-purple-600 rounded-full flex-shrink-0"></span>
                    Minimal latency
                  </li>
                </ul>
              </div>

              {/* Feature 3 - Security */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7.538-4a5.5 5.5 0 00-7.573 7.573L3 13.407m0 0l7.538 7.538" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    Bank-Grade Security
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Military-grade encryption protects your crypto assets 24/7
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-emerald-600 rounded-full flex-shrink-0"></span>
                    End-to-end encryption
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-emerald-600 rounded-full flex-shrink-0"></span>
                    Industry compliance
                  </li>
                </ul>
              </div>

              {/* Feature 4 - Easy Management */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    Simple Control
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  One bot trades BTC & ETH — focused where the money is
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-orange-600 rounded-full flex-shrink-0"></span>
                    One-click deployment
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-orange-600 rounded-full flex-shrink-0"></span>
                    BTC & ETH pairs
                  </li>
                </ul>
              </div>

              {/* Feature 5 - Real-Time Insights */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-pink-400 dark:hover:border-pink-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-900/40 dark:to-pink-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    Real-Time Analytics
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Track every crypto trade, fee, and profit in real-time
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-pink-600 rounded-full flex-shrink-0"></span>
                    Live performance tracking
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-pink-600 rounded-full flex-shrink-0"></span>
                    Profit metrics
                  </li>
                </ul>
              </div>

              {/* Feature 6 - Multi-Exchange */}
              <div className="group bg-white dark:bg-slate-900/50 rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-5 lg:p-8 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md sm:hover:shadow-lg lg:hover:shadow-xl transition-all duration-300">
                <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3 lg:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-indigo-900/20 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white pt-0.5">
                    3 Major Exchanges
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Trade crypto on Kraken, Binance, and Coinbase APIs
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-indigo-600 rounded-full flex-shrink-0"></span>
                    Kraken, Binance, Coinbase
                  </li>
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-indigo-600 rounded-full flex-shrink-0"></span>
                    BTC & ETH trading
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 sm:mb-20">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6">
                Crypto Trading Pricing <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">That Makes Sense</span>
              </h2>
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
                We only earn when you earn. Pay nothing when you lose, 15% when you win.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {/* Card 1 - Performance Fee */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
                <div className="mb-6">
                  <div className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-2">
                    15%
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Performance Fee</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                  Only when your bot makes money. Monthly billing on the 1st.
                </p>
                <ul className="space-y-3">
                  {[
                    'Pay 0% when bot loses money',
                    'No hidden fees or subscriptions',
                    'BTC & ETH — most liquid markets',
                    'Monthly transparent billing',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card 2 - Free Trial (Featured) */}
              <div className="relative lg:col-span-1 md:col-span-2 lg:col-auto">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-100 transition"></div>
                <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-8 border-2 border-blue-600 dark:border-blue-500">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                      START HERE
                    </span>
                  </div>
                  <div className="mb-6 mt-4">
                    <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">$0</div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">10-Day Free Trial</h3>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mb-8 leading-relaxed font-semibold">
                    no capital limits to test live trading. No credit card required.
                  </p>
                  <ul className="space-y-3">
                    {[
                      'Real live trading - not paper trading',
                      'Connect any major exchange',
                      'Deploy AI strategies immediately',
                      'Scale to performance fees after',
                    ].map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-slate-700 dark:text-slate-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/auth/signup"
                    className="w-full mt-8 inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105"
                  >
                    Start Free Trial →
                  </Link>
                </div>
              </div>

              {/* Card 3 - Transparent */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
                <div className="mb-6">
                  <div className="text-6xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">✓</div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">100% Transparent</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                  Know exactly what you're paying and earning at all times.
                </p>
                <ul className="space-y-3">
                  {[
                    'Real-time billing dashboard',
                    'See every trade and fee',
                    'Detailed profit breakdowns',
                    'Monthly invoices & receipts',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-center">
              <p className="text-slate-700 dark:text-slate-300 mb-2">
                <strong>Everyone starts with the same 10-day free crypto trading trial</strong> and no capital limits on Kraken, Binance, or Coinbase.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                After trial ends, you automatically scale to our performance fee model. 15% on profits — $0 on losses. We only earn when you do.
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA Section - High Impact */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950 relative overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Automate Your Crypto Trading Today
            </h2>
            <p className="text-lg sm:text-xl text-blue-100 mb-4 leading-relaxed">
              Join traders on Kraken, Binance, and Coinbase earning passive income with AI-powered bots.
            </p>
            <p className="text-base text-blue-200 mb-10">
              Your 10-day free crypto trading trial starts today. no capital limits. No credit card needed.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/auth/signup"
                className="group inline-flex items-center justify-center bg-white hover:bg-gray-50 text-blue-600 font-bold py-4 px-10 rounded-xl transition-all transform hover:scale-105 shadow-2xl hover:shadow-2xl"
              >
                <span className="text-lg">Start Your Free Trial</span>
                <svg className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/help"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-semibold py-4 px-8 rounded-xl transition-all border border-white/30 hover:border-white/50"
              >
                Learn More
              </Link>
            </div>

            {/* Trust Signals */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <p className="text-sm text-blue-200 mb-4">Trusted by traders worldwide</p>
              <div className="flex justify-center items-center gap-6 flex-wrap text-white/70">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 3.062v6.218c0 1.264-.534 2.472-1.463 3.315-.929.843-2.181 1.308-3.496 1.308-1.315 0-2.567-.465-3.496-1.308-.929-.843-1.463-2.051-1.463-3.315V6.517c0-1.687.972-3.146 2.389-3.875a3.066 3.066 0 011.636-.187zm7.196 2.488a.75.75 0 10-1.06-1.06L9 10.939 7.854 9.793a.75.75 0 10-1.06 1.06l1.5 1.5a.75.75 0 001.06 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Bank-Level Security</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 3.062v6.218c0 1.264-.534 2.472-1.463 3.315-.929.843-2.181 1.308-3.496 1.308-1.315 0-2.567-.465-3.496-1.308-.929-.843-1.463-2.051-1.463-3.315V6.517c0-1.687.972-3.146 2.389-3.875a3.066 3.066 0 011.636-.187zm7.196 2.488a.75.75 0 10-1.06-1.06L9 10.939 7.854 9.793a.75.75 0 10-1.06 1.06l1.5 1.5a.75.75 0 001.06 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>24/7 Support</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 3.062v6.218c0 1.264-.534 2.472-1.463 3.315-.929.843-2.181 1.308-3.496 1.308-1.315 0-2.567-.465-3.496-1.308-.929-.843-1.463-2.051-1.463-3.315V6.517c0-1.687.972-3.146 2.389-3.875a3.066 3.066 0 011.636-.187zm7.196 2.488a.75.75 0 10-1.06-1.06L9 10.939 7.854 9.793a.75.75 0 10-1.06 1.06l1.5 1.5a.75.75 0 001.06 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>No Hidden Fees</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
