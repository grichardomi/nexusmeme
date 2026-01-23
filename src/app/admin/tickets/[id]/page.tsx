'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { SupportTicketWithReplies } from '@/types/support';

/**
 * Admin Support Ticket Detail Page
 * Allows admins to view, update, and manage individual support tickets
 */

export default function AdminTicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<SupportTicketWithReplies | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [newReply, setNewReply] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Update form states
  const [newStatus, setNewStatus] = useState<string>('');
  const [newPriority, setNewPriority] = useState<string>('');

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/tickets/${ticketId}`);
      if (!response.ok) throw new Error('Failed to fetch ticket');

      const data = await response.json();
      setTicket(data);
      setNewStatus(data.status);
      setNewPriority(data.priority);

      // Mark ticket as viewed by admin (removes NEW badge)
      await markTicketAsViewed();

      // Mark all replies as read when admin views the ticket
      await markTicketAsRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setIsLoading(false);
    }
  };

  const markTicketAsViewed = async () => {
    try {
      const response = await fetch(`/api/admin/tickets/${ticketId}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to mark ticket as viewed');
      }
    } catch (err) {
      // Log error but don't show to user - this is a non-critical operation
      console.error('Error marking ticket as viewed:', err);
    }
  };

  const markTicketAsRead = async () => {
    try {
      const response = await fetch(`/api/admin/tickets/${ticketId}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to mark ticket as read');
      }
    } catch (err) {
      // Log error but don't show to user - this is a non-critical operation
      console.error('Error marking ticket as read:', err);
    }
  };

  const handleUpdateTicket = async (status?: string, priority?: string) => {
    try {
      setIsSaving(true);
      const updateData: any = {};
      if (status && status !== ticket?.status) updateData.status = status;
      if (priority && priority !== ticket?.priority) updateData.priority = priority;

      if (Object.keys(updateData).length === 0) return;

      const response = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to update ticket');
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddReply = async () => {
    if (!newReply.trim()) return;

    try {
      setIsSubmittingReply(true);
      const response = await fetch(`/api/admin/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newReply,
          isInternalNote,
        }),
      });

      if (!response.ok) throw new Error('Failed to add reply');

      setNewReply('');
      setIsInternalNote(false);
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-900 dark:text-white text-lg">Loading ticket...</div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/tickets"
          className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
        >
          ← Back to Tickets
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/admin/tickets"
        className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
      >
        ← Back to Tickets
      </Link>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Ticket Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{ticket.subject}</h1>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Ticket ID: <span className="font-mono">{ticket.id}</span>
          </div>
        </div>

        {/* Ticket Meta */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Status</label>
            <select
              value={newStatus}
              onChange={e => {
                setNewStatus(e.target.value);
                handleUpdateTicket(e.target.value, newPriority);
              }}
              disabled={isSaving}
              className={`w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Priority</label>
            <select
              value={newPriority}
              onChange={e => {
                setNewPriority(e.target.value);
                handleUpdateTicket(newStatus, e.target.value);
              }}
              disabled={isSaving}
              className={`w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <div className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm capitalize">
              {ticket.category.replace('_', ' ')}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Created</label>
            <div className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm">
              {new Date(ticket.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Original Message */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 uppercase">
            Original Message
          </label>
          <div className="bg-slate-50 dark:bg-slate-700 rounded p-4 text-slate-900 dark:text-white whitespace-pre-wrap">
            {ticket.message}
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Conversation</h2>

        {ticket.replies.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-600 dark:text-slate-400">
            No replies yet
          </div>
        ) : (
          <div className="space-y-4">
            {ticket.replies.map(reply => (
              <div
                key={reply.id}
                className={`rounded-lg border p-4 ${
                  reply.isInternalNote
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {reply.isInternalNote && (
                      <span className="inline-block bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded text-xs font-medium mr-2">
                        Internal Note
                      </span>
                    )}
                    <span className="font-mono text-slate-900 dark:text-white">
                      Admin
                    </span>
                    {' • '}
                    {new Date(reply.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-slate-900 dark:text-white whitespace-pre-wrap">
                  {reply.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add Reply</h2>

        <textarea
          value={newReply}
          onChange={e => setNewReply(e.target.value)}
          placeholder="Type your reply here..."
          className="w-full px-4 py-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm resize-none"
          rows={4}
          disabled={isSubmittingReply}
        />

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isInternalNote}
              onChange={e => setIsInternalNote(e.target.checked)}
              disabled={isSubmittingReply}
              className="rounded border border-slate-300 dark:border-slate-600"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">Internal Note (not visible to user)</span>
          </label>

          <button
            onClick={handleAddReply}
            disabled={!newReply.trim() || isSubmittingReply}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmittingReply ? 'Sending...' : 'Send Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
