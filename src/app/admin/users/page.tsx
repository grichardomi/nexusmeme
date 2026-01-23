'use client';

import React, { useState, useEffect } from 'react';

/**
 * Admin Users Management Page
 * View and manage user accounts and roles
 */

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  emailVerified: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

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
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Users
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Manage user accounts and permissions
        </p>
      </div>

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
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">
                    Email
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">
                    Name
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">
                    Role
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">
                    Verified
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                  >
                    <td className="px-6 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {user.email}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {user.name || '-'}
                    </td>
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
                    <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
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

      {/* Help Text */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <p className="text-sm text-blue-900 dark:text-blue-200">
          <strong>Tip:</strong> To promote a user to admin, run:
          <br />
          <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono mt-2 inline-block">
            UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
          </code>
        </p>
      </div>
    </div>
  );
}
