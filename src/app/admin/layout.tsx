'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

/**
 * Admin Layout
 * Layout for admin dashboard pages with admin-specific navigation
 * Enforces admin role access
 */

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin');
    }

    // Check if user is admin
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') {
      redirect('/dashboard');
    }
  }, [status, session]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    { href: '/admin/tickets', label: 'Support Tickets', icon: '🎫' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: '📊', disabled: true },
    { href: '/admin/settings', label: 'Settings', icon: '⚙️', disabled: true },
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
        className={`fixed md:static inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-transform duration-300 flex flex-col z-40 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <Link
            href="/admin/tickets"
            className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl hover:opacity-80 transition"
          >
            <Image
              src="/logo.png"
              alt="NexusMeme Logo"
              width={24}
              height={24}
              className="w-6 h-6"
            />
            <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Admin</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3 px-4 py-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
          >
            <span className="text-xl">📊</span>
            <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline text-sm`}>Dashboard</span>
          </Link>

          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-4 py-2 rounded text-slate-600 dark:text-slate-300 transition ${
                item.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
              }`}
              onClick={e => item.disabled && e.preventDefault()}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline text-sm`}>
                {item.label}
                {item.disabled && ' (soon)'}
              </span>
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
              {session?.user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>
              <p className="text-xs text-slate-600 dark:text-slate-400">Admin</p>
              <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 md:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <span className="text-2xl">☰</span>
          </button>

          <div className="text-slate-900 dark:text-white font-semibold">Admin Dashboard</div>

          <div className="w-6" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
