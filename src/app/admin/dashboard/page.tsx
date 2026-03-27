'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

/**
 * Admin Dashboard
 * Central hub for admin operations with metrics and quick access
 */

interface CronJob {
  id: string;
  name: string;
  url: string;
  schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'success' | 'error' | 'disabled';
  lastRun: string | null;
  lastRunResult: string | null;
  nextRun: string;
}

interface SchedulePreset {
  label: string;
  value: string;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: 'Every minute',            value: '* * * * *' },
  { label: 'Every 5 minutes',         value: '*/5 * * * *' },
  { label: 'Every 15 minutes',        value: '*/15 * * * *' },
  { label: 'Every 30 minutes',        value: '*/30 * * * *' },
  { label: 'Hourly',                  value: '0 * * * *' },
  { label: 'Every 6 hours',           value: '0 */6 * * *' },
  { label: 'Every 12 hours',          value: '0 */12 * * *' },
  { label: 'Daily @ midnight',        value: '0 0 * * *' },
  { label: 'Daily @ 09:00',           value: '0 9 * * *' },
  { label: 'Daily @ 02:00',           value: '0 2 * * *' },
  { label: 'Weekdays @ 09:00',        value: '0 9 * * 1-5' },
  { label: 'Weekly (Mon @ 09:00)',     value: '0 9 * * 1' },
  { label: 'Monthly (1st @ 02:00)',   value: '0 2 1 * *' },
  { label: 'Monthly (15th @ 09:00)',  value: '0 9 15 * *' },
  { label: 'Monthly (28th @ 09:00)',  value: '0 9 28 * *' },
  { label: 'Quarterly (1st Jan/Apr/Jul/Oct)', value: '0 0 1 1,4,7,10 *' },
  { label: 'Custom…',                 value: '__custom__' },
];


function computeNextRun(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return 'Unknown';
  const [minPart, hourPart, domPart] = parts;
  const now = new Date();

  // Handle */N patterns
  const resolveField = (part: string): number => {
    if (part === '*') return -1;
    if (part.startsWith('*/')) return parseInt(part.slice(2));
    return parseInt(part);
  };

  const minVal = resolveField(minPart);
  const hourVal = resolveField(hourPart);

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);

  try {
    if (minPart.startsWith('*/')) {
      const step = parseInt(minPart.slice(2));
      const nextMin = Math.ceil((now.getMinutes() + 1) / step) * step;
      candidate.setMinutes(nextMin >= 60 ? 0 : nextMin);
      if (nextMin >= 60) candidate.setHours(candidate.getHours() + 1);
    } else if (minPart !== '*') {
      candidate.setMinutes(minVal);
    }

    if (hourPart.startsWith('*/')) {
      const step = parseInt(hourPart.slice(2));
      const nextHour = Math.ceil((now.getHours() + 1) / step) * step;
      candidate.setHours(nextHour >= 24 ? 0 : nextHour);
      if (nextHour >= 24) candidate.setDate(candidate.getDate() + 1);
    } else if (hourPart !== '*') {
      candidate.setHours(hourVal);
    }

    if (domPart !== '*' && !domPart.startsWith('*/')) {
      candidate.setDate(parseInt(domPart));
      if (candidate <= now) {
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(parseInt(domPart));
      }
    } else if (candidate <= now) {
      const stepMin = minPart.startsWith('*/') ? parseInt(minPart.slice(2)) : 0;
      if (stepMin > 0) {
        // already handled above
      } else if (hourPart === '*' || hourPart.startsWith('*/')) {
        candidate.setHours(candidate.getHours() + 1);
      } else {
        candidate.setDate(candidate.getDate() + 1);
      }
    }
    return candidate.toLocaleString();
  } catch {
    return 'Unknown';
  }
}

const CRON_JOBS_DEFAULTS = [
  { id: 'system-health-check',   name: 'System Health Check',   url: '/api/admin/health-check',         schedule: '*/30 * * * *', enabled: true },
  { id: 'billing-monthly',       name: 'Billing Monthly',       url: '/api/cron/billing-monthly',       schedule: '0 2 1 * *',   enabled: true },
  { id: 'billing-upcoming',      name: 'Billing Upcoming',      url: '/api/cron/billing-upcoming',      schedule: '0 9 28 * *',  enabled: true },
  { id: 'billing-dunning',       name: 'Billing Dunning',       url: '/api/cron/billing-dunning',       schedule: '0 9 * * *',   enabled: true },
  { id: 'email-processor',       name: 'Email Processor',       url: '/api/cron/email-processor',       schedule: '*/5 * * * *', enabled: true },
  { id: 'billing-retry',         name: 'Billing Retry',         url: '/api/cron/billing-retry',         schedule: '0 10 * * 3',  enabled: true },
  { id: 'trial-notifications',   name: 'Trial Notifications',   url: '/api/cron/trial-notifications',   schedule: '0 */6 * * *', enabled: true },
  { id: 'webhook-recovery',      name: 'Webhook Recovery',      url: '/api/cron/webhook-recovery',      schedule: '0 */4 * * *', enabled: true },
  { id: 'weekly-digest',         name: 'Weekly Bot Digest',     url: '/api/cron/weekly-digest',         schedule: '0 8 * * 1',   enabled: true },
];

interface DashboardStats {
  openTickets: number;
  totalTickets: number;
  totalUsers: number;
  avgResolutionTime: string;
  discordMembers: number;
  discordOnline: number;
  discordChannels: number;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'loading' | 'error';
  checks: Record<string, string>;
  recentErrors?: number;
  activeBots?: number;
  timestamp?: string;
}

function CronStatusBadge({ status }: { status: CronJob['status'] }) {
  const map: Record<CronJob['status'], string> = {
    idle:     'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    running:  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 animate-pulse',
    success:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    error:    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    disabled: 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 line-through',
  };
  const label: Record<CronJob['status'], string> = {
    idle: 'Idle', running: 'Running', success: 'Success', error: 'Error', disabled: 'Disabled',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function CronToggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      title={enabled ? 'Disable job' : 'Enable job'}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
        enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [health, setHealth] = useState<SystemHealth>({ status: 'loading', checks: {} });

  const fetchHealth = useCallback(async () => {
    setHealth(prev => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/admin/health-check');
      if (res.status === 401) {
        setHealth({ status: 'error', checks: { auth: 'Missing CRON_SECRET' } });
        return;
      }
      const data = await res.json();
      setHealth({ ...data, status: data.status ?? (res.ok ? 'healthy' : 'unhealthy') });
    } catch (e: any) {
      setHealth({ status: 'error', checks: { fetch: e.message } });
    }
  }, []);

  const [cronJobs, setCronJobs] = useState<CronJob[]>(() => {
    let savedEnabled: Record<string, boolean> = {};
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('cron_enabled') : null;
      if (raw) savedEnabled = JSON.parse(raw);
    } catch {}
    return CRON_JOBS_DEFAULTS.map(c => {
      const enabled = savedEnabled[c.id] ?? c.enabled;
      return {
        ...c,
        enabled,
        status: enabled ? 'idle' : 'disabled',
        lastRun: null,
        lastRunResult: null,
        nextRun: computeNextRun(c.schedule),
      };
    });
  });

  const toggleCronEnabled = useCallback((id: string) => {
    setCronJobs(prev => {
      const next = prev.map(j =>
        j.id === id
          ? {
              ...j,
              enabled: !j.enabled,
              status: (j.enabled ? 'disabled' : (j.status === 'disabled' ? 'idle' : j.status)) as CronJob['status'],
            }
          : j
      );
      try {
        const enabledMap = Object.fromEntries(next.map(j => [j.id, j.enabled]));
        localStorage.setItem('cron_enabled', JSON.stringify(enabledMap));
      } catch {}
      return next;
    });
  }, []);

  // Track whether each job is showing the custom cron input
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const updateSchedule = useCallback((id: string, schedule: string) => {
    setCronJobs(prev =>
      prev.map(j =>
        j.id === id ? { ...j, schedule, nextRun: computeNextRun(schedule) } : j
      )
    );
  }, []);

  const triggerCron = useCallback(async (id: string) => {
    const job = cronJobs.find(j => j.id === id);
    if (!job || !job.enabled) return;

    setCronJobs(prev =>
      prev.map(j => (j.id === id ? { ...j, status: 'running' } : j))
    );

    const startedAt = new Date().toLocaleString();
    try {
      const res = await fetch('/api/admin/cron/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
      const data = await res.json();
      setCronJobs(prev =>
        prev.map(j =>
          j.id === id
            ? {
                ...j,
                status: res.ok ? 'success' : 'error',
                lastRun: startedAt,
                lastRunResult: res.ok ? `OK (${data.status})` : `Error ${data.status}: ${String(data.body ?? '').slice(0, 120)}`,
                nextRun: computeNextRun(j.schedule),
              }
            : j
        )
      );
    } catch (err: any) {
      setCronJobs(prev =>
        prev.map(j =>
          j.id === id
            ? {
                ...j,
                status: 'error',
                lastRun: startedAt,
                lastRunResult: String(err?.message ?? err),
                nextRun: computeNextRun(j.schedule),
              }
            : j
        )
      );
    }
  }, [cronJobs]);

  useEffect(() => {
    fetchStats();
    fetchHealth();
  }, [fetchHealth]);

  const fetchStats = async () => {
    try {
      setIsLoading(true);

      // Fetch tickets and Discord stats in parallel
      const [ticketsRes, discordRes] = await Promise.all([
        fetch('/api/admin/tickets?pageSize=100'),
        fetch('/api/admin/discord-stats'),
      ]);

      const ticketsData = await ticketsRes.json();
      const discordData = await discordRes.json();

      setStats({
        openTickets: ticketsData.tickets?.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length || 0,
        totalTickets: ticketsData.total || 0,
        totalUsers: 0, // TODO: Implement user count API
        avgResolutionTime: 'N/A', // TODO: Calculate from tickets
        discordMembers: discordData.stats?.totalMembers || 0,
        discordOnline: discordData.stats?.onlineMembers || 0,
        discordChannels: discordData.stats?.channels?.length || 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const adminSections = [
    {
      title: 'Support Tickets',
      description: 'Manage and respond to customer support tickets',
      icon: '🎫',
      href: '/admin/tickets',
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Discord Analytics',
      description: 'Community engagement, activity, and support metrics',
      icon: '💬',
      href: '/admin/discord',
      color: 'from-indigo-500 to-purple-600',
      badge: 'New',
    },
    {
      title: 'Performance Fees',
      description: 'Set global fee rate, per-user overrides, adjust, waive, and refund fees',
      icon: '💰',
      href: '/admin/fees',
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'Users',
      description: 'Manage user accounts and permissions',
      icon: '👥',
      href: '/admin/users',
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Analytics',
      description: 'View platform statistics and insights',
      icon: '📊',
      href: '/admin/analytics',
      color: 'from-orange-500 to-orange-600',
    },
    {
      title: 'Settings',
      description: 'Configure admin panel and system settings',
      icon: '⚙️',
      href: '/admin/settings',
      color: 'from-red-500 to-red-600',
    },
  ];

  const resolvedStats: DashboardStats = stats ?? {
    openTickets: 0,
    totalTickets: 0,
    totalUsers: 0,
    avgResolutionTime: 'N/A',
    discordMembers: 0,
    discordOnline: 0,
    discordChannels: 0,
  };

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Admin Dashboard
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Welcome back, {session?.user?.name || 'Admin'}
        </p>
      </div>

      {/* Quick Stats - Support Overview */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          Support Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Discord Members"
            value={resolvedStats.discordMembers}
            change={`🟢 ${resolvedStats.discordOnline} online`}
            icon="💬"
            isLoading={isLoading}
            color="indigo"
          />
          <StatCard
            label="Open Tickets"
            value={resolvedStats.openTickets}
            change="Needs response"
            icon="🎫"
            isLoading={isLoading}
            color="blue"
          />
          <StatCard
            label="Support Ratio"
            value={resolvedStats.discordMembers > 0 && resolvedStats.totalTickets > 0
              ? `${Math.round((resolvedStats.discordMembers / (resolvedStats.discordMembers + resolvedStats.totalTickets)) * 100)}%`
              : 'N/A'}
            change="Discord vs Tickets"
            icon="📊"
            isLoading={isLoading}
            color="green"
          />
          <StatCard
            label="Avg Response"
            value={resolvedStats.avgResolutionTime || 'N/A'}
            change="Ticket resolution"
            icon="⚡"
            isLoading={isLoading}
            color="orange"
          />
        </div>
      </div>

      {/* Community Stats */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          Community Engagement
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Tickets"
            value={resolvedStats.totalTickets}
            change="All time"
            icon="📋"
            isLoading={isLoading}
          />
          <StatCard
            label="Discord Channels"
            value={resolvedStats.discordChannels}
            change="Active channels"
            icon="📡"
            isLoading={isLoading}
          />
          <StatCard
            label="Total Users"
            value={resolvedStats.totalUsers}
            change="Platform users"
            icon="👥"
            isLoading={isLoading}
          />
          <StatCard
            label="Community Health"
            value={resolvedStats.discordOnline > 0 ? '🟢 Good' : '⚪ N/A'}
            change={`${resolvedStats.discordOnline} active`}
            icon="❤️"
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Admin Sections */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Admin Tools
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminSections.map(section => (
            <Link
              key={section.href}
              href={section.href}
              className="group"
            >
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{section.icon}</div>
                  <div className="flex flex-col items-end gap-2">
                    {(section as any).badge && (
                      <span className="px-2 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold rounded-full">
                        {(section as any).badge}
                      </span>
                    )}
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${section.color} opacity-10 group-hover:opacity-20 transition`} />
                  </div>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {section.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {section.description}
                </p>

                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium text-sm">
                  Access →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* System Health */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">System Health</h2>
          <button
            onClick={fetchHealth}
            disabled={health.status === 'loading'}
            className="px-3 py-1.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-300 transition"
          >
            {health.status === 'loading' ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        <div className={`rounded-lg border p-5 ${
          health.status === 'healthy'   ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' :
          health.status === 'degraded'  ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20' :
          health.status === 'loading'   ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800' :
          'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">
              {health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : health.status === 'loading' ? '⏳' : '🔴'}
            </span>
            <div>
              <p className="font-bold text-slate-900 dark:text-white capitalize">
                {health.status === 'loading' ? 'Checking…' : health.status}
              </p>
              {health.timestamp && (
                <p className="text-xs text-slate-500">{new Date(health.timestamp).toLocaleString()}</p>
              )}
            </div>
            {health.recentErrors !== undefined && (
              <span className={`ml-auto text-sm font-semibold px-2 py-1 rounded ${
                health.recentErrors > 10 ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                health.recentErrors > 0  ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
              }`}>
                {health.recentErrors} errors (1h)
              </span>
            )}
            {health.activeBots !== undefined && (
              <span className="text-sm font-semibold px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {health.activeBots} bots running
              </span>
            )}
          </div>

          {Object.keys(health.checks).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(health.checks).map(([key, val]) => (
                <div key={key} className="bg-white/60 dark:bg-slate-800/60 rounded px-3 py-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{key.replace(/_/g, ' ')}</p>
                  <p className={`text-sm font-semibold mt-0.5 ${
                    val === 'ok' || val === 'accessible' ? 'text-green-700 dark:text-green-400' :
                    val.startsWith('fail') || val.startsWith('error') ? 'text-red-600 dark:text-red-400' :
                    'text-slate-700 dark:text-slate-300'
                  }`}>
                    {val}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cron Jobs */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Cron Jobs
        </h2>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Job</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Interval</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Last Run</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Next Run</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cronJobs.map(job => {
                const isCustom = !SCHEDULE_PRESETS.some(p => p.value === job.schedule && p.value !== '__custom__');
                const selectValue = isCustom ? '__custom__' : job.schedule;
                return (
                  <tr
                    key={job.id}
                    className={`border-b last:border-0 border-slate-100 dark:border-slate-700 transition ${
                      job.enabled
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                        : 'opacity-50 bg-slate-50 dark:bg-slate-900/30'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {job.name}
                      <div className="text-xs text-slate-400 font-mono">{job.url}</div>
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">
                      <select
                        value={selectValue}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            setCustomInputs(prev => ({ ...prev, [job.id]: job.schedule }));
                            updateSchedule(job.id, job.schedule);
                          } else {
                            setCustomInputs(prev => { const n = { ...prev }; delete n[job.id]; return n; });
                            updateSchedule(job.id, val);
                          }
                        }}
                        className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {SCHEDULE_PRESETS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      {(isCustom || customInputs[job.id] !== undefined) && (
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="* * * * *"
                            value={customInputs[job.id] ?? job.schedule}
                            onChange={e => {
                              const val = e.target.value;
                              setCustomInputs(prev => ({ ...prev, [job.id]: val }));
                              if (val.trim().split(/\s+/).length === 5) updateSchedule(job.id, val.trim());
                            }}
                            className="w-full text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{job.schedule}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {job.lastRun ?? <span className="text-slate-400">Never</span>}
                      {job.lastRunResult && (
                        <div className="text-xs text-slate-400 truncate max-w-[180px]" title={job.lastRunResult}>
                          {job.lastRunResult}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <CronStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap text-xs">
                      {job.nextRun}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CronToggle enabled={job.enabled} onChange={() => toggleCronEnabled(job.id)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => triggerCron(job.id)}
                        disabled={!job.enabled || job.status === 'running'}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition whitespace-nowrap"
                      >
                        {job.status === 'running' ? 'Running...' : 'Run Now'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Recent Activity
        </h2>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="text-center text-slate-600 dark:text-slate-400 py-12">
            <p className="text-lg mb-2">No recent activity yet</p>
            <p className="text-sm">Activity log coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 */
interface StatCardProps {
  label: string;
  value: number | string;
  change: string;
  icon: string;
  isLoading: boolean;
  color?: 'indigo' | 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

function StatCard({ label, value, change, icon, isLoading, color }: StatCardProps) {
  const colorClasses = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };

  const bgClass = color ? colorClasses[color] : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';

  return (
    <div className={`rounded-lg border p-6 ${bgClass}`}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-3xl">{icon}</span>
      </div>

      <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">{label}</p>

      {isLoading ? (
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      ) : (
        <p className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {value}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-500">{change}</p>
    </div>
  );
}
