'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Admin Root Page
 * Redirects to admin dashboard
 */

export default function AdminRootPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard on mount
    router.push('/admin/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="text-slate-900 dark:text-white text-lg">Redirecting...</div>
    </div>
  );
}
