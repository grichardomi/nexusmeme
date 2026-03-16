'use client';

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { ExchangeKeyForm } from '@/components/settings/ExchangeKeyForm';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import React, { useState } from 'react';

/**
 * Settings Page
 * User account and app settings
 */

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    notificationsEnabled: boolean;
    dailyReports: boolean;
    lossAlerts: boolean;
  } | null>(null);

  const [originalData, setOriginalData] = useState<typeof formData>(null);

  // Check if form has changed
  const hasChanges = formData !== null && JSON.stringify(formData) !== JSON.stringify(originalData);

  // Load initial settings when session is available
  React.useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          const settings = {
            name: data.name || '',
            notificationsEnabled: data.notificationsEnabled,
            dailyReports: data.dailyReports ?? true,
            lossAlerts: data.lossAlerts ?? false,
          };
          setFormData(settings);
          setOriginalData(settings);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    }

    if (session?.user?.id) {
      fetchSettings();
    }
  }, [session?.user?.id]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = e.target;
    setFormData(prev => prev ? ({ ...prev, [name]: type === 'checkbox' ? checked : value }) : prev);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return; // Don't save if nothing changed

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Only send fields that changed
      const changedFields: Record<string, any> = {};
      (Object.keys(formData) as Array<keyof typeof formData>).forEach(key => {
        if (formData[key] !== originalData[key]) {
          changedFields[key] = formData[key];
        }
      });

      console.log('Sending changed fields:', changedFields);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changedFields),
      });

      const responseData = await response.json();
      console.log('API response:', responseData, 'Status:', response.status);

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to save settings');
      }

      setOriginalData(formData); // Update original data after successful save
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Settings error:', error);
      setSaveMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!formData) {
    return (
      <DashboardLayout title="Settings">
        <div className="max-w-2xl space-y-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700 animate-pulse">
            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-48 mb-6" />
            <div className="space-y-4">
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded" />
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Settings">
      <div className="max-w-2xl space-y-8">
        {/* Save Message */}
        {saveMessage && (
          <div
            className={`px-4 py-3 rounded ${
              saveMessage.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 text-green-700 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200'
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Account Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">Account Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={isSaving}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Email</label>
                <input
                  type="email"
                  value={session?.user?.email || ''}
                  disabled
                  className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-600 dark:text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Email cannot be changed</p>
              </div>
            </div>
          </div>

          {/* Trading Preferences */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">Trading Preferences</h2>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="notificationsEnabled"
                    checked={formData.notificationsEnabled}
                    onChange={handleChange}
                    disabled={isSaving}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-900 dark:text-white">Enable email notifications for trades</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="dailyReports"
                    checked={formData.dailyReports}
                    onChange={handleChange}
                    disabled={isSaving}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-900 dark:text-white">Send daily performance reports</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="lossAlerts"
                    checked={formData.lossAlerts}
                    onChange={handleChange}
                    disabled={isSaving}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-slate-900 dark:text-white">Alert me on significant losses</span>
                </label>
              </div>
            </div>
          </div>

          {/* Exchange Connections */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Exchange Connections</h2>
              <a
                href="/help#getting-started"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap mt-1"
                title="Step-by-step guide to get your API keys"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                How to get your API key
              </a>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Connect your exchange API keys to enable live trading. API keys are encrypted and stored securely.
            </p>

            {/* Security notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 text-blue-700 dark:text-blue-200 px-4 py-3 rounded mb-6">
              <p className="text-sm font-medium">🔐 Security & Best Practices</p>
              <ul className="text-xs mt-2 space-y-1 ml-4">
                <li>• Only enable <strong>Reading</strong> and <strong>Spot & Margin Trading</strong> permissions</li>
                <li>• Never enable <strong>Withdrawals</strong> — NexusMeme never needs withdrawal access</li>
                <li>• Set IP access restrictions if possible for extra security</li>
                <li>• Your API secret is encrypted on our servers — we cannot read it</li>
              </ul>
            </div>

            <div className="space-y-4">
              {/* Binance International */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">🔗 Binance International</h3>
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Global</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Available in 180+ countries. Not available to US residents.{' '}
                  <a href="https://www.binance.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">binance.com</a>
                </p>
                <ExchangeKeyForm exchange="binance" />
              </div>

              {/* Kraken */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">🔗 Kraken</h3>
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Global + US</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Available globally including US residents.{' '}
                  <a href="https://www.kraken.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">kraken.com</a>
                </p>
                <ExchangeKeyForm exchange="kraken" />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={isSaving || !hasChanges}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded transition"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
