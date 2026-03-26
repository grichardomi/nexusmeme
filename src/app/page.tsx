'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
// import Image from 'next/image';
import { Footer } from '@/components/layouts/Footer';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [flatFeeUsdc, setFlatFeeUsdc] = useState<number | null>(null);
  const fee = feePercent !== null ? `${feePercent}%` : '…';
  const trial = trialDays !== null ? `${trialDays}-day` : '…';
  const flatFee = flatFeeUsdc !== null ? (flatFeeUsdc > 0 ? `$${flatFeeUsdc} USDC/mo` : null) : '…';

  useEffect(() => {
    fetch('/api/billing/fee-rate/default')
      .then(r => r.json())
      .then(d => { if (d.feePercent) setFeePercent(d.feePercent); })
      .catch(() => {});
    fetch('/api/billing/trial-days')
      .then(r => r.json())
      .then(d => { if (d.days) setTrialDays(d.days); })
      .catch(() => {});
    fetch('/api/billing/flat-fee')
      .then(r => r.json())
      .then(d => { if (typeof d.flatFeeUsdc === 'number') setFlatFeeUsdc(d.flatFeeUsdc); })
      .catch(() => {});
  }, []);

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
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 px-4 py-2 rounded-full border border-blue-200 dark:border-blue-800">
                <span className="w-2 h-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  🚀 AI-Powered Crypto Trading Bots
                </span>
              </div>
              <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 px-4 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                <span className="text-xs text-green-700 dark:text-green-300">
                  🌍 Available worldwide — Binance International &amp; Binance US
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
                    An AI-powered trading bot focused on BTC & ETH — the most liquid, profitable crypto markets. Start your {trial} free trial today.
                  </p>
                  <p className="text-base text-slate-600 dark:text-slate-400">
                    {flatFee ? `${flatFee} platform fee + ` : ''}{fee} on profits. $0 performance fee when it doesn't.
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 w-full">
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">BTC & ETH</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Focused Trading</div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">{trialDays ?? '…'} days</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Free Trial</div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">{flatFeeUsdc !== null && flatFeeUsdc > 0 ? `$${flatFeeUsdc}` : '…'}</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">USDC/mo Flat</div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600">{fee}</div>
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">On Profits</div>
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
                AI-powered automation designed specifically for cryptocurrency markets
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
                    Secure Exchange Integration
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug sm:leading-relaxed mb-2 sm:mb-3">
                  Connect your Binance account and start trading crypto
                </p>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-1 sm:gap-1.5">
                    <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-indigo-600 rounded-full flex-shrink-0"></span>
                    API key encryption
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

        {/* How it works — Trust section for new traders */}
        <section id="how-it-works" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
                New to trading bots? <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Here's how it works</span>
              </h2>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                NexusMeme connects to your existing exchange account. Your funds never leave your exchange — ever.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-10">
              {/* Step 1 */}
              <div className="text-center">
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-blue-600 dark:text-blue-400">1</div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">Connect your exchange</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Generate a read + trade API key on Binance. Paste it into NexusMeme. Takes 2 minutes.</p>
              </div>
              {/* Step 2 */}
              <div className="text-center">
                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-purple-600 dark:text-purple-400">2</div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">Bot trades for you</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Our AI scans BTC & ETH markets 24/7. When conditions are right, it buys and sells on your exchange automatically.</p>
              </div>
              {/* Step 3 */}
              <div className="text-center">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-green-600 dark:text-green-400">3</div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">Profits stay in your account</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">All profits go directly into your exchange balance. Log in to Binance anytime to see every trade and your full P&L.</p>
              </div>
            </div>

            {/* Cost callout for newbies */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 sm:p-8 mb-6 text-white text-center">
              <p className="text-2xl sm:text-3xl font-bold mb-2">
                {flatFee ?? '…'} flat + {fee} on profits
              </p>
              <p className="text-blue-100 text-sm sm:text-base max-w-xl mx-auto">
                Small flat fee covers infrastructure. Performance fee is {fee} — only on profits.
                If your bot has a losing month, performance fee is <strong>$0</strong>.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
                <span className="bg-white/20 rounded-full px-4 py-1">No credit card required</span>
                <span className="bg-white/20 rounded-full px-4 py-1">{flatFee ?? '…'} flat/mo</span>
                <span className="bg-white/20 rounded-full px-4 py-1">$0 performance fee when bot loses</span>
              </div>
            </div>

            {/* Key trust callouts */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl flex-shrink-0 mt-0.5">🔒</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Your money never leaves your exchange</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">NexusMeme does not hold, move, or custody your funds. We only place trades via your API key.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-500 text-xl flex-shrink-0 mt-0.5">🔑</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Withdrawal access is never required</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Only enable Read + Spot Trading permissions. Never grant withdrawal access — we don't need it.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-500 text-xl flex-shrink-0 mt-0.5">👁️</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Full transparency on your exchange</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Every trade NexusMeme places is visible in your Binance trade history — nothing hidden.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-orange-500 text-xl flex-shrink-0 mt-0.5">⚡</span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">Revoke access anytime in seconds</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Delete your API key on the exchange and the bot stops instantly. You are always in control.</p>
                </div>
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
                We only earn when you earn. Pay nothing when you lose, {fee} when you win.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {/* Card 1 - Performance Fee */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
                <div className="mb-6">
                  <div className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-2">
                    {fee}
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Performance Fee</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">+ {flatFee ?? '…'}/mo platform fee</p>
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                  {flatFee ?? '…'} flat fee keeps the platform running. {fee} performance fee only when your bot profits. Monthly billing on the 1st.
                </p>
                <ul className="space-y-3">
                  {[
                    `${fee} on profits — $0 performance fee when bot loses`,
                    `${flatFee ?? '…'} flat fee billed every month`,
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
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{trial} Free Trial</h3>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mb-8 leading-relaxed font-semibold">
                    no capital limits to test live trading. No credit card required.
                  </p>
                  <ul className="space-y-3">
                    {[
                      'Real live trading - not paper trading',
                      'Connect your Binance account',
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
                <strong>Everyone starts with the same {trial} free crypto trading trial</strong> with no capital limits.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                After trial ends: {flatFee ?? '…'} flat/mo + {fee} performance fee on profits — $0 performance fee on losses.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 bg-white dark:bg-slate-950">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
                Frequently Asked <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Questions</span>
              </h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: 'Does the bot go short (bet on prices falling)?',
                  a: 'No. NexusMeme only takes long positions — it buys BTC or ETH and sells when a profit target is reached. It never short-sells or uses leverage. This keeps the strategy simple, transparent, and aligned with how most retail investors think about crypto: buy low, sell higher.',
                },
                {
                  q: 'What markets does the bot trade?',
                  a: 'BTC/USDT and ETH/USDT only — the two most liquid crypto markets in the world. Focusing on high-liquidity pairs means tighter spreads, faster fills, and lower slippage on every trade.',
                },
                {
                  q: 'What happens in a bear market or when prices are falling?',
                  a: 'The bot sits out. Our AI regime filter blocks entries when the market is in a confirmed downtrend (price below EMA200) or when market conditions are too choppy. Preserving capital during bad conditions is as important as making money in good ones.',
                },
                {
                  q: 'Does the bot use leverage or margin?',
                  a: 'Never. All trades are spot only — the bot only spends what is already in your account. No borrowing, no leverage, no risk of liquidation.',
                },
                {
                  q: 'How does the bot decide when to buy and sell?',
                  a: 'It uses technical analysis (ADX trend strength, momentum, volume) to identify high-probability long setups. Profit targets adjust dynamically based on trend strength: 0.5–0.8% in choppy markets, up to 8% in strong trends. Losses are cut early to keep the average loss small.',
                },
                {
                  q: 'Do I need to do anything once it\'s running?',
                  a: 'No. Once your exchange API key is connected and the bot is started, it runs 24/7 automatically. You can log in to Binance anytime to see every trade in your own account history.',
                },
                {
                  q: 'When do I pay the performance fee?',
                  a: `${flatFee ?? '…'}/mo flat fee + ${fee} of profits, both billed on the 1st of each month. If your bot had a losing month, the performance fee is $0 — you only pay the flat fee. No credit card required — fees are invoiced and payable in USDC on Base network.`,
                },
              ].map((item, i) => (
                <details key={i} className="group bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    {item.q}
                    <span className="flex-shrink-0 text-slate-400 group-open:rotate-180 transition-transform duration-200">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </summary>
                  <p className="px-6 pb-5 text-slate-600 dark:text-slate-400 leading-relaxed text-sm sm:text-base">
                    {item.a}
                  </p>
                </details>
              ))}
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
              Join traders earning passive income with AI-powered crypto bots.
            </p>
            <p className="text-base text-blue-200 mb-10">
              Your {trial} free crypto trading trial starts today. No capital limits. No credit card needed.
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
              {/* <p className="text-sm text-blue-200 mb-4">Trusted by traders worldwide</p> */}
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
