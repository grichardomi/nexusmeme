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
      // Fetch open tickets count
      const ticketsRes = await fetch('/api/admin/tickets?pageSize=1');
      const ticketsData = await ticketsRes.json();

      // For now, set placeholder stats
      setStats({
        openTickets: ticketsData.tickets?.filter((t: any) => t.status === 'open').length || 0,
        totalTickets: ticketsData.total || 0,
        totalUsers: 0, // TODO: Implement user count API
        avgResolutionTime: 'N/A', // TODO: Calculate from tickets
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Open Tickets"
          value={stats?.openTickets || 0}
          change="+2 today"
          icon="🎫"
          isLoading={isLoading}
        />
        <StatCard
          label="Total Tickets"
          value={stats?.totalTickets || 0}
          change="All time"
          icon="📋"
          isLoading={isLoading}
        />
        <StatCard
          label="Total Users"
          value={stats?.totalUsers || 0}
          change="Active"
          icon="👥"
          isLoading={isLoading}
        />
        <StatCard
          label="Avg Resolution"
          value={stats?.avgResolutionTime || 'N/A'}
          change="Per ticket"
          icon="⏱️"
          isLoading={isLoading}
        />
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
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${section.color} opacity-10 group-hover:opacity-20 transition`} />
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
}

function StatCard({ label, value, change, icon, isLoading }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
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
