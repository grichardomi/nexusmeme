'use client';

import Link from 'next/link';

/**
 * Minimal Dashboard Footer
 * Sticky footer bar for authenticated dashboard pages
 * Shows copyright and critical legal links without taking up space
 */
export function MinimalFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="hidden md:block bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 md:px-8 py-3 text-xs text-slate-600 dark:text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        {/* Copyright */}
        <p>© {currentYear} NexusMeme Trading Platform. All rights reserved.</p>

        {/* Legal Links */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/dashboard/support"
            className="hover:text-slate-900 dark:hover:text-white transition font-medium"
          >
            Support
          </Link>
          <Link
            href="/legal/privacy"
            className="hover:text-slate-900 dark:hover:text-white transition"
          >
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-slate-900 dark:hover:text-white transition">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
