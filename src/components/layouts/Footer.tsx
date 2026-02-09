'use client';

import Link from 'next/link';
import Image from 'next/image';

/**
 * Footer Component
 * Mobile-first responsive footer with links and branding
 */

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-16 sm:mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Section */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/help"
              className="flex items-center gap-2 mb-4 hover:opacity-90 transition"
              aria-label="NexusMeme Help Center"
            >
              <Image
                src="/logo.png"
                alt="NexusMeme Logo"
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  NexusMeme
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Trading Platform
                </div>
              </div>
            </Link>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Scale profitable trading bots to 5000+ users
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">
              Product
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/pricing"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/#features"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">
              Support
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/help"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Help Center
                </Link>
              </li>
              <li>
                <a
                  href={process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Discord Community
                </a>
              </li>
              <li>
                <Link
                  href="/help#faq"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">
              Legal
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/terms"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/cookies"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Cookies
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-8">
          {/* Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
            <p>
              &copy; {currentYear} NexusMeme Trading Platform. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a
                href={process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 dark:hover:text-white transition"
                aria-label="Discord"
              >
                Discord
              </a>
             
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
