'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLoadMore } from '@/hooks/useLoadMore';
import type { SupportTicket } from '@/types/support';

/**
 * Admin Support Tickets List Page
 * Shows all support tickets with filtering and infinite scroll "Load More" pagination
 */

export default function AdminTicketsPage() {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [fetchedCountsOnce, setFetchedCountsOnce] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // Memoize fetch function to prevent infinite re-renders
  const fetchAdminTicketsData = useCallback(async (offset: number, limit: number) => {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });

    if (statusFilter) params.append('status', statusFilter);
    if (priorityFilter) params.append('priority', priorityFilter);

    const response = await fetch(`/api/admin/tickets?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch tickets');

    const data = await response.json();
    return {
      items: data.tickets || [],
      total: data.total || 0,
    };
  }, [statusFilter, priorityFilter]);

  // Load more pagination
  const { items: tickets, isLoading, error, hasMore, total, load, loadMore, reset } = useLoadMore<SupportTicket>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchAdminTicketsData,
  });

  // Load initial tickets
  useEffect(() => {
    load();
  }, [load]);

  // Reset pagination when filters change
  useEffect(() => {
    reset();
    setFetchedCountsOnce(false);
    load();
  }, [statusFilter, priorityFilter, load, reset]);

  // Refetch unread counts when page comes back to focus (admin returns from detail page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tickets.length > 0) {
        refreshUnreadCounts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tickets.length]);

  // Fetch unread counts once when tickets first load
  useEffect(() => {
    if (tickets.length > 0 && !fetchedCountsOnce) {
      refreshUnreadCounts();
      setFetchedCountsOnce(true);
    }
  }, [tickets.length, fetchedCountsOnce]);

  // Poll for unread count updates every 30 seconds while page is visible (admins need more frequent updates)
  useEffect(() => {
    if (tickets.length === 0) return;

    const pollInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        await refreshUnreadCounts();
      }
    }, 30000); // Poll every 30 seconds (low-overhead internal API calls)

    return () => clearInterval(pollInterval);
  }, [tickets.length]);

  /**
   * Refresh only unread counts (lightweight operation after viewing ticket)
   */
  const refreshUnreadCounts = async () => {
    try {
      const countsResponse = await fetch('/api/admin/tickets/unread-counts');
      if (countsResponse.ok) {
        const counts = await countsResponse.json();
        setUnreadCounts(counts);
      }
    } catch (err) {
      console.error('Failed to refresh unread counts:', err);
    }
  };

  /**
   * Handle filter changes
   */
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
  };

  const handlePriorityFilterChange = (value: string) => {
    setPriorityFilter(value);
  };

  const handleClearFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-600';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-600';
      case 'normal':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-600';
      case 'low':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-600';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return '🔵';
      case 'in_progress':
        return '🟡';
      case 'resolved':
        return '✅';
      case 'closed':
        return '⭕';
      default:
        return '❓';
    }
  };

  /**
   * Check if ticket is NEW (not yet viewed by any admin)
   * Replaces time-based check with actual view tracking
   */
  const isNewTicket = (ticket: SupportTicket) => {
    // NEW badge only shows if admin hasn't viewed it yet
    return !ticket.firstViewedByAdminAt;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Support Tickets</h1>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Total: <span className="font-bold text-slate-900 dark:text-white">{total}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Status</label>
          <select
            value={statusFilter}
            onChange={e => handleStatusFilterChange(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Priority</label>
          <select
            value={priorityFilter}
            onChange={e => handlePriorityFilterChange(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium transition"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">
            Loading tickets...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 dark:text-red-400">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">No tickets found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">ID</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Subject</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Priority</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Category</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Created</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => {
                  const hasUnread = unreadCounts[ticket.id] > 0;
                  const isNew = isNewTicket(ticket);
                  const rowBgClass = hasUnread
                    ? 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50';

                  return (
                    <tr
                      key={ticket.id}
                      className={`border-b border-slate-200 dark:border-slate-700 transition ${rowBgClass}`}
                    >
                      <td className="px-6 py-3 text-sm font-mono text-slate-600 dark:text-slate-300">
                        {ticket.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-900 dark:text-white font-medium">
                        <div className="flex items-center gap-2">
                          {ticket.subject}
                          {hasUnread && (
                            <span className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold whitespace-nowrap">
                              {unreadCounts[ticket.id]} new
                            </span>
                          )}
                          {isNew && (
                            <span className="px-2 py-1 bg-green-600 text-white rounded text-xs font-semibold whitespace-nowrap">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                    <td className="px-6 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getStatusIcon(ticket.status)}</span>
                        <span className="text-slate-900 dark:text-white capitalize">{ticket.status.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(
                          ticket.priority
                        )}`}
                      >
                        {ticket.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400 capitalize">
                      {ticket.category.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/admin/tickets/${ticket.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load More Section */}
      {tickets.length > 0 && (
        <div className="space-y-4">
          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => loadMore()}
                disabled={isLoading}
                className={`px-6 py-2 rounded font-medium transition ${
                  isLoading
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && tickets.length > 0 && (
            <div className="flex justify-center py-4">
              <div className="text-slate-600 dark:text-slate-400 text-sm">Loading more tickets...</div>
            </div>
          )}

          {/* Error on load more */}
          {error && hasMore && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          {/* Items loaded count */}
          {!hasMore && tickets.length > 0 && (
            <div className="text-center text-sm text-slate-600 dark:text-slate-400">
              All {tickets.length} tickets loaded
            </div>
          )}
        </div>
      )}
    </div>
  );
}
