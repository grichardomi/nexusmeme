'use client';

import React, { useState, useEffect } from 'react';

/**
 * Admin Users Management Page
 * View and manage user accounts, roles, and trial extensions
 */

interface Subscription {
  id: string;
  status: string;
  planTier: string;
  trialEndsAt: Date | null;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  emailVerified: boolean;
  subscription: Subscription | null;
  billingTier: 'starter' | 'live' | 'elite' | null;
  totalAccountValue: number | null;
  accountValueUpdatedAt: string | null;
}

interface ExtendModalState {
  userId: string;
  email: string;
  currentExpiry: Date | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [extendModal, setExtendModal] = useState<ExtendModalState | null>(null);
  const [extendDays, setExtendDays] = useState('7');
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [page, searchQuery]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      setUsers(
        (data.users || []).map((u: any) => ({
          ...u,
          createdAt: new Date(u.createdAt),
          subscription: u.subscription
            ? {
                ...u.subscription,
                trialEndsAt: u.subscription.trialEndsAt ? new Date(u.subscription.trialEndsAt) : null,
              }
            : null,
        })),
      );
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!extendModal) return;
    const days = parseInt(extendDays, 10);
    if (!days || days < 1 || days > 90) {
      setExtendError('Enter a value between 1 and 90 days');
      return;
    }

    setExtendLoading(true);
    setExtendError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: extendModal.userId, action: 'extend_trial', days }),
      });

      const data = await res.json();
      if (!res.ok) {
        setExtendError(data.error || 'Failed to extend trial');
        return;
      }

      const botMsg = data.resumedBots > 0 ? ` ${data.resumedBots} bot${data.resumedBots !== 1 ? 's' : ''} resumed.` : '';
      setSuccessMsg(
        `Extended trial for ${extendModal.email} by ${days} day${days !== 1 ? 's' : ''}. New expiry: ${new Date(data.newTrialEnd).toLocaleDateString()}.${botMsg}`,
      );
      setExtendModal(null);
      fetchUsers();
    } catch {
      setExtendError('Network error — please try again');
    } finally {
      setExtendLoading(false);
    }
  };

  const getTrialBadge = (sub: Subscription | null) => {
    if (!sub) return <span className="text-slate-400 text-xs">No trial</span>;

    const now = new Date();
    const expiry = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const expired = !expiry || expiry <= now;
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : 0;

    if (sub.status === 'payment_required' || (sub.planTier === 'live_trial' && expired)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          Expired {expiry ? expiry.toLocaleDateString() : ''}
        </span>
      );
    }

    if (sub.planTier === 'live_trial' && sub.status === 'trialing') {
      const color = daysLeft <= 2 ? 'yellow' : 'blue';
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-300`}>
          {daysLeft}d left · {expiry?.toLocaleDateString()}
        </span>
      );
    }

    if (sub.planTier === 'performance_fees') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
          Live
        </span>
      );
    }

    return <span className="text-slate-400 text-xs">{sub.status}</span>;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Users</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage user accounts and permissions</p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 text-green-700 dark:text-green-200 px-4 py-3 rounded flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-4 text-green-500 hover:text-green-700 font-bold">×</button>
        </div>
      )}

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="w-full px-4 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Verified</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Trial</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Account Value</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Tier</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Joined</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                  >
                    <td className="px-6 py-3 text-sm font-medium text-slate-900 dark:text-white">{user.email}</td>
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">{user.name || '-'}</td>
                    <td className="px-6 py-3 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {user.emailVerified ? (
                        <span className="text-green-600 dark:text-green-400">✓ Verified</span>
                      ) : (
                        <span className="text-orange-600 dark:text-orange-400">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm">{getTrialBadge(user.subscription)}</td>
                    <td className="px-6 py-3 text-sm">
                      {user.totalAccountValue !== null ? (
                        <div>
                          <span className="font-medium text-slate-900 dark:text-white">
                            ${user.totalAccountValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                          {user.accountValueUpdatedAt && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(user.accountValueUpdatedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">No data</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {user.billingTier ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.billingTier === 'elite'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : user.billingTier === 'live'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {user.billingTier === 'elite' ? '★ Elite' : user.billingTier === 'live' ? '◆ Live' : '● Starter'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {user.subscription && (
                        <button
                          onClick={() =>
                            setExtendModal({
                              userId: user.id,
                              email: user.email,
                              currentExpiry: user.subscription?.trialEndsAt ?? null,
                            })
                          }
                          className="px-3 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                        >
                          {user.subscription.planTier === 'live_trial' ? 'Extend Trial' : 'Grant Trial'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Page {page} of {totalPages} ({total} total users)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium transition"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Extend Trial Modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Extend Free Trial</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{extendModal.email}</p>

            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 mb-4 text-sm text-slate-600 dark:text-slate-400">
              <div>Current expiry: <span className="font-medium text-slate-900 dark:text-white">
                {extendModal.currentExpiry
                  ? new Date(extendModal.currentExpiry).toLocaleDateString()
                  : 'None'}
              </span></div>
              {extendDays && parseInt(extendDays) > 0 && (
                <div className="mt-1">New expiry: <span className="font-medium text-blue-600 dark:text-blue-400">
                  {(() => {
                    const base = extendModal.currentExpiry && new Date(extendModal.currentExpiry) > new Date()
                      ? new Date(extendModal.currentExpiry)
                      : new Date();
                    base.setDate(base.getDate() + parseInt(extendDays));
                    return base.toLocaleDateString();
                  })()}
                </span></div>
              )}
            </div>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Days to extend
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={extendDays}
              onChange={e => setExtendDays(e.target.value)}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1"
              placeholder="e.g. 7"
            />
            <p className="text-xs text-slate-400 mb-4">Max 90 days per extension. Extends from current expiry (or today if already expired).</p>

            {extendError && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{extendError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setExtendModal(null); setExtendError(null); setExtendDays('7'); }}
                disabled={extendLoading}
                className="px-4 py-2 text-sm font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendTrial}
                disabled={extendLoading}
                className="px-4 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
              >
                {extendLoading ? 'Extending...' : 'Extend Trial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
