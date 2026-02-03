'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';

/**
 * Header Component
 * Mobile-first responsive header with logo, navigation, and user menu
 */

export function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo - Left Justified */}
          <Link
            href={session?.user ? '/dashboard' : '/'}
            className="flex items-center gap-2 hover:opacity-80 transition flex-shrink-0 md:mr-8"
          >
            <Image
              src="/logo.png"
              alt="NexusMeme Logo"
              width={32}
              height={32}
              className="w-8 h-8"
              priority
            />
            <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base md:text-lg">
              NexusMeme
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 md:flex-1">
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

          {/* Auth Buttons / User Menu */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Theme Toggle Button - Only render when mounted to avoid hydration mismatch */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                aria-label="Toggle dark mode"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  // Sun icon (for dark mode)
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  // Moon icon (for light mode)
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
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
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition text-sm"
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
                <Link
                  href="/help"
                  className="hidden sm:inline-block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition text-sm"
                >
                  Help
                </Link>
                <button
                  onClick={() => signOut({ redirect: true, callbackUrl: '/' })}
                  className="text-sm bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/signin"
                  className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition font-medium"
                >
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden border-t border-slate-200 dark:border-slate-800 py-4 space-y-3">
            <Link
              href="/#features"
              className="block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-2"
              onClick={() => setIsMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="/#pricing"
              className="block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-2"
              onClick={() => setIsMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/pricing"
              className="block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-2"
              onClick={() => setIsMenuOpen(false)}
            >
              Plans
            </Link>
            {session?.user && (
              <>
                <Link
                  href="/dashboard"
                  className="block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                {(session.user as any).role === 'admin' && (
                  <Link
                    href="/admin/dashboard"
                    className="block text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 transition py-2 font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/help"
                  className="block text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Help
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
