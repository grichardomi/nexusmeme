'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { MinimalFooter } from './MinimalFooter';
import { BackButton } from '@/components/navigation/BackButton';
import { BetaBadge } from '@/components/common/BetaBadge';

/**
 * Dashboard Layout
 * Main layout for authenticated dashboard pages
 * Supports light/dark mode with Tailwind CSS
 */

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
}

interface Subscription {
  id: string;
  plan: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'payment_required';
  trial_ends_at?: string;
  tradingMode?: 'paper' | 'live';
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<(Subscription & { daysRemaining?: number | null }) | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const subResponse = await fetch('/api/billing/subscriptions');

        if (subResponse.ok) {
          const data = await subResponse.json();
          // Get trading mode from planUsage
          const tradingMode = data.planUsage?.limits?.tradingMode as 'paper' | 'live' | undefined;

          if (data.subscription) {
            const sub = data.subscription;
            let daysRemaining: number | null = null;

            // Calculate days remaining for trial
            if (sub.trial_ends_at) {
              const trialEndDate = new Date(sub.trial_ends_at);
              const today = new Date();
              const diffTime = trialEndDate.getTime() - today.getTime();
              daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            setSubscription({ ...sub, daysRemaining, tradingMode });
          } else {
            // No subscription found - treat as needing setup
            // Paper trading can continue without payment
            setSubscription({
              id: '',
              plan: tradingMode === 'paper' ? 'live_trial' : 'performance_fees',
              status: tradingMode === 'paper' ? 'active' : 'payment_required',
              daysRemaining: tradingMode === 'paper' ? null : 0,
              tradingMode,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch subscription:', err);
        // On error, show payment required to be safe
        setSubscription({
          id: '',
          plan: 'performance_fees',
          status: 'payment_required',
          daysRemaining: 0,
        });
      } finally {
        setIsLoadingSubscription(false);
      }
    }

    if (session?.user?.id) {
      fetchSubscription();
    }
  }, [session?.user?.id]);

  const handleSignOut = async () => {
    await signOut({ redirect: true, callbackUrl: '/auth/signin' });
  };

  // Base navigation items
  const baseNavItems = [
    { href: '/dashboard', label: 'Overview', icon: '📊' },
    { href: '/dashboard/bots', label: 'Trading Bot', icon: '🤖' },
    { href: '/dashboard/trading', label: 'Live Trading', icon: '💹' },
    { href: '/dashboard/portfolio', label: 'Portfolio', icon: '💼' },
    { href: '/dashboard/billing', label: 'Billing & Plans', icon: '💳' },
  ];

  // Support is available to all users for private/account-specific issues
  const supportItem = { href: '/dashboard/support', label: 'Support', icon: '🎫' };
  const settingsItem = { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' };

  // Include Support for all authenticated users
  const navItems = [
    ...baseNavItems,
    supportItem,
    settingsItem,
  ];

  return (
    <div className="flex h-screen flex-col md:flex-row bg-slate-50 dark:bg-slate-900">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:static inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-transform duration-300 flex flex-col z-40 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
      >
        {/* Logo - Mobile Only */}
        <div className="md:hidden p-4 border-b border-slate-200 dark:border-slate-700">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl hover:opacity-80 transition"
          >
            <Image
              src="/logo.png"
              alt="NexusMeme Logo"
              width={24}
              height={24}
              className="w-6 h-6"
            />
            <span>NexusMeme</span>
          </Link>
          <div className="mt-2">
            <BetaBadge size="sm" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline text-sm`}>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          {session?.user && (
            <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block px-4 py-2 text-sm text-slate-600 dark:text-slate-400`}>
              <p className="font-medium text-slate-900 dark:text-white truncate">{session.user.name}</p>
              <p className="truncate text-xs">{session.user.email}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition text-sm"
          >
            <span>🚪</span>
            <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Sign Out</span>
          </button>
        </div>

      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Back Button, Menu & Title */}
            <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
              <BackButton className="mr-0 sm:mr-1" />
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex-shrink-0"
                aria-label="Toggle sidebar"
              >
                ☰
              </button>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white truncate">{title}</h1>
            </div>

            {/* Center: Plan Badge - Prominent display */}
            {!isLoadingSubscription && subscription && (
              <>

                {/* Trial Expired Badge - Desktop (for ALL users) */}
                {(subscription.status === 'payment_required' ||
                  ((subscription.status === 'trialing' || subscription.plan === 'live_trial') &&
                    subscription.daysRemaining != null && subscription.daysRemaining <= 0)) && (
                  <Link
                    href="/dashboard/billing"
                    className="hidden sm:flex items-center bg-red-100 rounded-full border border-red-200 hover:bg-red-200 transition-colors overflow-hidden flex-shrink-0 animate-pulse"
                  >
                    <span className="px-3 py-1.5 text-red-800 text-sm font-semibold">
                      Trial Ended
                    </span>
                    <span className="px-3 py-1.5 bg-red-700 text-white text-sm font-bold">
                      Upgrade Now
                    </span>
                  </Link>
                )}

                {/* Trial Expired Badge - Mobile (for ALL users) */}
                {(subscription.status === 'payment_required' ||
                  ((subscription.status === 'trialing' || subscription.plan === 'live_trial') &&
                    subscription.daysRemaining != null && subscription.daysRemaining <= 0)) && (
                  <Link
                    href="/dashboard/billing"
                    className="sm:hidden px-2 py-1 bg-red-700 text-white rounded-full text-xs font-bold flex-shrink-0 animate-pulse"
                  >
                    Trial Ended
                  </Link>
                )}

                {/* Active Trial Badge - Desktop (10-day free trial, paper trading mode) */}
                {(subscription.status === 'trialing' || subscription.plan === 'live_trial') &&
                  subscription.daysRemaining != null && subscription.daysRemaining > 0 && (
                  <Link
                    href="/dashboard/billing"
                    className="hidden sm:flex items-center bg-blue-100 rounded-full border border-blue-200 hover:bg-blue-200 transition-colors overflow-hidden flex-shrink-0"
                  >
                    <span className="px-3 py-1.5 text-blue-800 text-sm font-semibold">
                      📄 Free Trial
                    </span>
                    <span className="px-3 py-1.5 bg-blue-700 text-white text-sm font-bold flex items-center justify-center min-w-[60px]">
                      {subscription.daysRemaining}d left
                    </span>
                  </Link>
                )}

                {/* Active Trial Badge - Mobile (10-day free trial) */}
                {(subscription.status === 'trialing' || subscription.plan === 'live_trial') &&
                  subscription.daysRemaining != null && subscription.daysRemaining > 0 && (
                  <Link
                    href="/dashboard/billing"
                    className="sm:hidden px-2 py-1 bg-blue-700 text-white rounded-full text-xs font-bold flex-shrink-0"
                  >
                    Trial: {subscription.daysRemaining}d
                  </Link>
                )}

                {/* Active Live Trading badge (after trial) */}
                {subscription.tradingMode !== 'paper' &&
                  subscription.status === 'active' && subscription.plan !== 'free' && subscription.plan !== 'live_trial' && (
                  <Link
                    href="/dashboard/billing"
                    className="px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-xs sm:text-sm font-semibold border border-green-200 hover:bg-green-200 transition-colors flex-shrink-0"
                  >
                    💰 Live Trading
                  </Link>
                )}

                {subscription.status === 'past_due' && (
                  <Link
                    href="/dashboard/billing"
                    className="px-3 py-1.5 bg-red-100 text-red-800 rounded-full text-xs sm:text-sm font-semibold border border-red-200 hover:bg-red-200 transition-colors animate-pulse flex-shrink-0"
                  >
                    ⚠️ Past Due
                  </Link>
                )}

                {(subscription.status === 'active' || subscription.status === 'cancelled') &&
                  subscription.plan === 'free' && (
                    <Link
                      href="/dashboard/billing"
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
                    >
                      Free Plan
                    </Link>
                  )}
              </>
            )}

            {/* Right: User Info (Hidden on small mobile) */}
            <div className="text-right hidden sm:block flex-shrink-0">
              <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-none">
                {session?.user?.name || session?.user?.email}
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 bg-slate-50 dark:bg-slate-900">
          {children}
        </main>

        {/* Minimal Footer */}
        <MinimalFooter />
      </div>
    </div>
  );
}
