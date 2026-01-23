'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useBotsData } from '@/hooks/useBotsData';

/**
 * Bots List Component
 * Display user's trading bots
 */

// Helper to format date
function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function BotsList() {
  const { data: session } = useSession();
  const { bots, isLoading, error } = useBotsData();

  // Check if user is admin (admins can create multiple bots for testing)
  const userRole = (session?.user as any)?.role ?? 'user';
  const isAdmin = userRole === 'admin';

  if (isLoading) {
    return <div className="text-white">Loading bots...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded">
        <p>Error loading bots: {error}</p>
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-6">No trading bots yet. Create your first bot to get started!</p>
        <Link
          href="/dashboard/bots/new"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium transition"
        >
          Create First Bot
        </Link>
      </div>
    );
  }

  // Show message when bot exists (one bot per user constraint, with admin override)
  if (bots.length >= 1) {
    return (
      <div className="space-y-6">
        {!isAdmin && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 text-blue-700 dark:text-blue-200 px-4 py-3 rounded">
            <p className="font-medium">ℹ️ One Bot Per User</p>
            <p className="text-sm mt-1">You can have only one active trading bot at a time. Delete your current bot to create a new one.</p>
          </div>
        )}

        {isAdmin && bots.length >= 1 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500 text-amber-700 dark:text-amber-200 px-4 py-3 rounded">
            <p className="font-medium">⚙️ Admin Mode - Multiple Bots Allowed</p>
            <p className="text-sm mt-1">You can create additional bots for testing (paper trading, dry runs, etc.)</p>
            <Link
              href="/dashboard/bots/new"
              className="inline-block mt-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded font-medium transition"
            >
              Create Another Bot
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {bots.map(bot => (
            <div
              key={bot.id}
              className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {bot.exchange} Trading Bot {bot.tradingMode === 'paper' && <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded ml-2">PAPER</span>}
                  </h3>
                  <div className="text-sm text-slate-400 space-y-1">
                    <p>Pairs: {bot.enabledPairs.join(', ') || 'None'}</p>
                    <p>Status: {bot.isActive ? '🟢 Active' : '🔴 Inactive'}</p>
                    <p>Trades: {bot.totalTrades} | P&L: ${bot.profitLoss.toFixed(2)}</p>
                    <p>Initial Capital: {bot.initialCapital === 0 ? 'Unlimited 🔓' : `$${(bot.initialCapital || 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}</p>
                    <p className="text-xs text-slate-500 pt-1">Created: {formatDate(bot.createdAt)}</p>
                  </div>
                </div>
                <Link
                  href={`/dashboard/bots/${bot.id}`}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bots.map(bot => (
        <div
          key={bot.id}
          className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {bot.exchange} Trading Bot
              </h3>
              <div className="text-sm text-slate-400 space-y-1">
                <p>Pairs: {bot.enabledPairs.join(', ') || 'None'}</p>
                <p>Status: {bot.isActive ? '🟢 Active' : '🔴 Inactive'}</p>
                <p>Trades: {bot.totalTrades} | P&L: ${bot.profitLoss.toFixed(2)}</p>
                <p>Initial Capital: {bot.initialCapital === 0 ? 'Unlimited 🔓' : `$${(bot.initialCapital || 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}</p>
                <p className="text-xs text-slate-500 pt-1">Created: {formatDate(bot.createdAt)}</p>
              </div>
            </div>
            <Link
              href={`/dashboard/bots/${bot.id}`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
            >
              Manage
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
