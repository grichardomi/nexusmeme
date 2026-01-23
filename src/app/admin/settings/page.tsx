'use client';

import React from 'react';

/**
 * Admin Settings Page
 * System configuration and settings (coming soon)
 */

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          System configuration and admin preferences
        </p>
      </div>

      {/* Coming Soon */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12">
        <div className="text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Coming Soon
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
            Administrative settings for system configuration, email templates, API keys, and platform preferences.
          </p>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Planned Features
            </h3>
            <ul className="text-left max-w-md mx-auto space-y-2 text-slate-600 dark:text-slate-400">
              <li>✓ Email notification templates</li>
              <li>✓ API key management</li>
              <li>✓ Webhook configuration</li>
              <li>✓ User role and permissions</li>
              <li>✓ System maintenance tools</li>
              <li>✓ Audit logs and activity tracking</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
