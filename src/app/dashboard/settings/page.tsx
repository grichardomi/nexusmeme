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

  const [formData, setFormData] = useState({
    name: '',
    notificationsEnabled: true,
    dailyReports: true,
    lossAlerts: false,
  });

  const [originalData, setOriginalData] = useState({
    name: '',
    notificationsEnabled: true,
    dailyReports: true,
    lossAlerts: false,
  });

  // Check if form has changed
  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

  // Load initial settings when session is available
  React.useEffect(() => {
    // Fetch user settings from API
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          const settings = {
            name: data.name || '',
            notificationsEnabled: data.notificationsEnabled ?? true,
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
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
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
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">Exchange Connections</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Connect your exchange API keys to enable your trading bots. API keys are encrypted and required before you can create a trading bot. When creating a bot, you'll choose whether to run it in <strong>Paper Trading (safe)</strong> or <strong>Live Trading (real money)</strong> mode.
            </p>

            {/* API Key Management Notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500 text-blue-700 dark:text-blue-200 px-4 py-3 rounded mb-6">
              <p className="text-sm font-medium">🔐 Security & Best Practices</p>
              <ul className="text-xs mt-2 space-y-1 ml-4">
                <li>• Only grant API keys with <strong>trading</strong> and <strong>account read</strong> permissions</li>
                <li>• Set API key restrictions to your IP address if possible</li>
                <li>• Never grant <strong>withdrawal</strong> permissions to the API key</li>
                <li>• Store your API secret securely - we encrypt it on our servers</li>
              </ul>
            </div>

            <div className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🔗 Kraken</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">Connect your Kraken trading account</p>
                <ExchangeKeyForm exchange="kraken" />
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🔗 Binance</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">Connect your Binance trading account</p>
                <ExchangeKeyForm exchange="binance" />
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
