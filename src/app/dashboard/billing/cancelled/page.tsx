'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import Link from 'next/link';

export default function CheckoutCancelledPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to billing page after a delay
    const timer = setTimeout(() => {
      router.push('/dashboard/billing');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <DashboardLayout title="Checkout Cancelled">
      <div className="max-w-md mx-auto mt-8 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="text-5xl mb-4">⏸️</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Checkout Cancelled
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Your payment was cancelled. Your current subscription remains unchanged. Feel free to try again whenever you're ready!
        </p>

        <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
          Redirecting to billing page in 5 seconds...
        </p>

        <Link
          href="/dashboard/billing"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition"
        >
          Back to Billing
        </Link>
      </div>
    </DashboardLayout>
  );
}
