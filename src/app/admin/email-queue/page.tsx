'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface EmailRow {
  id: string;
  type: string;
  to_email: string;
  status: string;
  retries: number;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  next_retry_at: string | null;
  updated_at: string;
}

interface QueueData {
  emails: EmailRow[];
  counts: Record<string, number>;
  limit: number;
  offset: number;
}

const STATUS_TABS = ['failed', 'pending', 'sent'];

export default function EmailQueuePage() {
  const { data: session } = useSession();
  const [data, setData] = useState<QueueData | null>(null);
  const [activeTab, setActiveTab] = useState('failed');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email-queue?status=${activeTab}&limit=${limit}&offset=${offset}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [activeTab, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setOffset(0);
  }, [activeTab]);

  async function doAction(payload: object, label: string) {
    setActionLoading(label);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/email-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ text: json.retried != null ? `Retried ${json.retried} emails` : json.deleted != null ? `Deleted ${json.deleted} emails` : 'Done', ok: true });
        fetchData();
      } else {
        setMessage({ text: json.error || 'Error', ok: false });
      }
    } finally {
      setActionLoading(null);
    }
  }

  if ((session?.user as any)?.role !== 'admin') {
    return <div className="p-8 text-red-600">Access denied.</div>;
  }

  const counts = data?.counts ?? {};

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Email Queue</h1>
        <div className="flex gap-2">
          {activeTab === 'failed' && (
            <>
              <button
                onClick={() => doAction({ action: 'retry-all' }, 'retry-all')}
                disabled={!!actionLoading || !data?.emails.length}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
              >
                {actionLoading === 'retry-all' ? 'Retrying…' : 'Retry All'}
              </button>
              <button
                onClick={() => { if (confirm('Delete all failed emails?')) doAction({ action: 'delete-all' }, 'delete-all'); }}
                disabled={!!actionLoading || !data?.emails.length}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium disabled:opacity-50"
              >
                {actionLoading === 'delete-all' ? 'Deleting…' : 'Purge All'}
              </button>
            </>
          )}
          <button onClick={fetchData} disabled={loading} className="px-3 py-1.5 border rounded text-sm disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded text-sm ${message.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {counts[tab] != null && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Retries</th>
              <th className="px-4 py-3 font-medium">Last Updated</th>
              {activeTab === 'failed' && <th className="px-4 py-3 font-medium">Error</th>}
              {activeTab === 'pending' && <th className="px-4 py-3 font-medium">Next Retry</th>}
              {activeTab === 'failed' && <th className="px-4 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!data || loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : data.emails.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No {activeTab} emails</td></tr>
            ) : data.emails.map(email => (
              <tr key={email.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{email.type}</td>
                <td className="px-4 py-3 text-gray-700">{email.to_email}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${email.retries >= 3 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {email.retries}/3
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(email.updated_at).toLocaleString()}
                </td>
                {activeTab === 'failed' && (
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate" title={email.error ?? ''}>
                    {email.error ?? '—'}
                  </td>
                )}
                {activeTab === 'pending' && (
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {email.next_retry_at ? new Date(email.next_retry_at).toLocaleString() : 'Now'}
                  </td>
                )}
                {activeTab === 'failed' && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => doAction({ action: 'retry', id: email.id }, `retry-${email.id}`)}
                        disabled={!!actionLoading}
                        className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs hover:bg-blue-100 disabled:opacity-50"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => doAction({ action: 'delete', id: email.id }, `delete-${email.id}`)}
                        disabled={!!actionLoading}
                        className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (data.emails.length === limit || offset > 0) && (
        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Previous
          </button>
          <span>Showing {offset + 1}–{offset + data.emails.length}</span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={data.emails.length < limit}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
