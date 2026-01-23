'use client';

import React from 'react';

/**
 * Admin Analytics Page
 * Platform statistics and insights (coming soon)
 */

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Analytics
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Platform statistics and insights
        </p>
      </div>

      {/* Coming Soon */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Coming Soon
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
            Advanced analytics dashboard with platform statistics, user growth, ticket metrics, and performance insights.
          </p>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Planned Features
            </h3>
            <ul className="text-left max-w-md mx-auto space-y-2 text-slate-600 dark:text-slate-400">
              <li>✓ User growth and retention metrics</li>
              <li>✓ Support ticket resolution analytics</li>
              <li>✓ Trading bot performance tracking</li>
              <li>✓ Revenue and subscription insights</li>
              <li>✓ API usage and performance metrics</li>
              <li>✓ Real-time activity monitoring</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
