'use client';

import React, { useState, useEffect } from 'react';
import { DiscordAnnouncement } from '@/components/admin/DiscordAnnouncement';

/**
 * Discord Analytics Admin Page
 * Detailed Discord community statistics and engagement metrics
 */

interface DiscordStats {
  totalMembers: number;
  onlineMembers: number;
  channels: Array<{ id: string; name: string }>;
  serverName: string;
  inviteUrl: string;
}

export default function DiscordAnalyticsPage() {
  const [stats, setStats] = useState<DiscordStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    fetchDiscordStats();
    // Refresh every 60 seconds
    const interval = setInterval(fetchDiscordStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchDiscordStats = async () => {
    try {
      const response = await fetch('/api/admin/discord-stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch Discord stats');
      }
    } catch (err) {
      console.error('Failed to fetch Discord stats:', err);
      setError('Failed to connect to Discord API');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            Discord Analytics
          </h1>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-600 dark:text-slate-400">Loading Discord stats...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            Discord Analytics
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-2">
            Community engagement and support metrics
          </p>
        </div>
        {stats && (
          <a
            href={stats.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Open Discord
          </a>
        )}
      </div>

      {/* Post Announcement Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-100 mb-1">
              Post Announcement
            </h2>
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Send updates directly to your Discord community
            </p>
          </div>
          <button
            onClick={() => setShowAnnouncement(!showAnnouncement)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition flex items-center gap-2"
          >
            {showAnnouncement ? (
              <>
                <span>✕</span> Close
              </>
            ) : (
              <>
                <span>📣</span> New Announcement
              </>
            )}
          </button>
        </div>

        {showAnnouncement && (
          <div className="mt-4">
            <DiscordAnnouncement
              onSuccess={() => {
                setShowAnnouncement(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-2">
                Discord Widget Not Available
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                {error}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                To enable Discord analytics:
              </p>
              <ol className="text-xs text-amber-600 dark:text-amber-400 mt-2 ml-4 space-y-1 list-decimal">
                <li>Go to Discord Server Settings → Widget</li>
                <li>Enable "Enable Server Widget"</li>
                <li>Verify the Guild ID matches: <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">{process.env.NEXT_PUBLIC_DISCORD_GUILD_ID}</code></li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatCard
              icon="👥"
              label="Total Members"
              value={stats.totalMembers.toLocaleString()}
              color="indigo"
            />
            <StatCard
              icon="🟢"
              label="Online Now"
              value={stats.onlineMembers.toLocaleString()}
              subtitle={`${Math.round((stats.onlineMembers / stats.totalMembers) * 100)}% online`}
              color="green"
            />
            <StatCard
              icon="📡"
              label="Active Channels"
              value={stats.channels.length}
              color="blue"
            />
          </div>

          {/* Channel List */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Server Channels
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.channels.map((channel) => (
                <div
                  key={channel.id}
                  className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600"
                >
                  <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                    # {channel.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Support Effectiveness */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800 p-6">
            <h2 className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mb-4">
              Community Support Impact
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-indigo-800 dark:text-indigo-200 mb-3">
                  Why Discord Works:
                </h3>
                <ul className="space-y-2 text-sm text-indigo-700 dark:text-indigo-300">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span><strong>Instant answers:</strong> {stats.onlineMembers} members ready to help</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span><strong>Peer support:</strong> Users help each other, reducing admin load</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span><strong>Community building:</strong> {stats.totalMembers} engaged traders</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span><strong>24/7 availability:</strong> Global community = always online</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-indigo-800 dark:text-indigo-200 mb-3">
                  Expected Support Distribution:
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-indigo-700 dark:text-indigo-300">Discord (Community)</span>
                      <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100">~80%</span>
                    </div>
                    <div className="h-3 bg-white/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-4/5" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-indigo-700 dark:text-indigo-300">Support Tickets (Admin)</span>
                      <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100">~20%</span>
                    </div>
                    <div className="h-3 bg-white/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 w-1/5" />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-3">
                  💡 Discord handles general questions, tickets handle private/account issues
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Stat Card Component
 */
interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: 'indigo' | 'green' | 'blue' | 'purple';
}

function StatCard({ icon, label, value, subtitle, color = 'indigo' }: StatCardProps) {
  const colorClasses = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  };

  return (
    <div className={`rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="text-4xl mb-4">{icon}</div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-500 dark:text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}
