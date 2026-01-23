'use client';

import React from 'react';

/**
 * Authentication Layout
 * Minimal layout for sign in, sign up, and password reset pages
 * Supports light/dark mode with Tailwind CSS
 */

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
          {subtitle && <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-200 dark:border-slate-700">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
          <p>© 2026 NexusMeme Trading. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
