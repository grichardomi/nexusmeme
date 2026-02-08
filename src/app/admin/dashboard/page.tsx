'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

/**
 * Admin Dashboard
 * Central hub for admin operations with metrics and quick access
 */

interface DashboardStats {
  openTickets: number;
  totalTickets: number;
  totalUsers: number;
  avgResolutionTime: string;
  discordMembers: number;
  discordOnline: number;
  discordChannels: number;
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

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
      description: 'Adjust, waive, and refund performance fees',
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
