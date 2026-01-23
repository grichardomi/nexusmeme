'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { BotsList } from '@/components/bots/BotsList';
import { useBotsData } from '@/hooks/useBotsData';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

/**
 * Trading Bot Page
 * Manage user's trading bots
 */

export default function BotsPage() {
  const { status } = useSession();
  const { bots, isLoading } = useBotsData();

  if (status === 'unauthenticated') {
    redirect('/auth/signin');
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
      </div>
    );
  }

  const hasBot = !isLoading && bots.length > 0;

  return (
    <DashboardLayout title="Trading Bot">
      {!hasBot && (
        <div className="mb-8">
          <Link
            href="/dashboard/bots/new"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium transition"
          >
            + Create New Bot
          </Link>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <BotsList />
      </div>
    </DashboardLayout>
  );
}
