'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { BackButton } from '@/components/navigation/BackButton';
import { BetaBadge } from '@/components/common/BetaBadge';
import { usePathname } from 'next/navigation';

/**
 * Header Component
 * Mobile-first responsive header with logo, navigation, and user menu
 * Dashboard/admin pages have their own headers - this only renders on public pages
 */

export function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Dashboard and admin pages have their own headers - don't render global header
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    return null;
  }

  // Show back button on detail/sub pages (not on main landing pages)
  const showBackButton = pathname !== '/' &&
                         pathname !== '/pricing' &&
                         pathname !== '/auth/signin' &&
                         pathname !== '/auth/signup';

  return (
    <>
      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: Logo */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {showBackButton && <BackButton />}
              <Link
                href={session?.user ? '/dashboard' : '/'}
                className="flex items-center gap-2 hover:opacity-80 transition flex-shrink-0"
              >
                <Image
                  src="/logo.png"
                  alt="NexusMeme Logo"
                  width={32}
                  height={32}
                  className="w-7 h-7 sm:w-8 sm:h-8"
                  priority
                />
                <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base md:text-lg">
                  NexusMeme
                </div>
              </Link>
              <BetaBadge size="sm" />
            </div>

            {/* Desktop Navigation */}
            {!session?.user && (
              <nav className="hidden md:flex items-center gap-6 md:flex-1 md:ml-8">
                <Link
                  href="/#features"
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Features
                </Link>
                <Link
                  href="/pricing"
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Pricing
                </Link>
              </nav>
            )}

            {/* Right: Theme toggle + Auth */}
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
              {/* Theme Toggle */}
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition touch-manipulation flex-shrink-0"
                  aria-label="Toggle dark mode"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l-2.12-2.12a4 4 0 00-5.656 0l-.707.707a1 1 0 001.414 1.414l.707-.707a2 2 0 112.828 2.828l-.707.707a1 1 0 001.414 1.414l2.121-2.12a4 4 0 000-5.657zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM9 4a1 1 0 011 1v1a1 1 0 11-2 0V5a1 1 0 011-1zm6 0a1 1 0 011 1v1a1 1 0 11-2 0V5a1 1 0 011-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )}

              {session?.user ? (
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
                  <Link
                    href="/dashboard"
                    className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-3 py-1.5 rounded transition font-medium whitespace-nowrap"
                  >
                    Dashboard
                  </Link>
                  {(session.user as any).role === 'admin' && (
                    <Link
                      href="/admin/dashboard"
                      className="hidden sm:inline-block text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 transition text-sm font-medium"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => signOut({ redirect: true, callbackUrl: '/' })}
                    className="hidden sm:inline-block text-sm bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Link
                    href="/auth/signin"
                    className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition font-medium whitespace-nowrap"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-3 py-1.5 rounded transition font-medium whitespace-nowrap"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav - Public pages (non-authenticated) */}
      {!session?.user && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center justify-around h-14">
            <Link
              href="/"
              className={`flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-1 active:scale-95 transition-transform ${
                pathname === '/' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <span className="text-[10px] font-medium mt-0.5">Home</span>
            </Link>
            <Link
              href="/#features"
              className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-1 active:scale-95 transition-transform text-slate-400 dark:text-slate-500"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <span className="text-[10px] font-medium mt-0.5">Features</span>
            </Link>
            <Link
              href="/pricing"
              className={`flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-1 active:scale-95 transition-transform ${
                pathname === '/pricing' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] font-medium mt-0.5">Pricing</span>
            </Link>
            <Link
              href="/auth/signup"
              className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-1 active:scale-95 transition-transform text-blue-600 dark:text-blue-400"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
              <span className="text-[10px] font-medium mt-0.5">Start</span>
            </Link>
          </div>
        </nav>
      )}
    </>
  );
}
