'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import type { SupportTicketWithReplies } from '@/types/support';

/**
 * User Support Ticket Detail Page
 * Allows users to view their support ticket and add replies
 */

export default function SupportTicketDetailPage() {
  const { status } = useSession();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<SupportTicketWithReplies | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply form state
  const [newReply, setNewReply] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Close ticket state
  const [isClosingTicket, setIsClosingTicket] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin');
    }

    if (status === 'authenticated') {
      fetchTicket();
    }
  }, [status]);

  const fetchTicket = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/support/tickets/${ticketId}`);
      if (!response.ok) throw new Error('Failed to fetch ticket');

      const data = await response.json();
      setTicket(data);

      // Mark replies as read when ticket is viewed
      try {
        await fetch(`/api/support/tickets/${ticketId}/mark-read`, {
          method: 'POST',
        });
      } catch (markReadError) {
        // Log but don't fail if marking as read fails
        console.error('Failed to mark replies as read:', markReadError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddReply = async () => {
    if (!newReply.trim()) return;

    try {
      setIsSubmittingReply(true);
      const response = await fetch(`/api/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newReply }),
      });

      if (!response.ok) throw new Error('Failed to add reply');

      setNewReply('');
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add reply');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleCloseTicket = async () => {
    try {
      setIsClosingTicket(true);
      const response = await fetch(`/api/support/tickets/${ticketId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to close ticket');
      }

      setShowCloseConfirm(false);
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close ticket');
    } finally {
      setIsClosingTicket(false);
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200';
      case 'normal':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200';
      case 'low':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200';
      default:
        return 'bg-slate-100 dark:bg-slate-700';
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout title="Support Ticket">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-900 dark:text-white text-lg">Loading ticket...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !ticket) {
    return (
      <DashboardLayout title="Support Ticket">
        <div className="space-y-4">
          <Link
            href="/dashboard/support"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
          >
            ← Back to Support
          </Link>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) return null;

  return (
    <DashboardLayout title="Support Ticket">
      <div className="space-y-6 max-w-4xl">
        {/* Back Link */}
        <Link
          href="/dashboard/support"
          className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
        >
          ← Back to Support
        </Link>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {/* Ticket Header */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{getStatusIcon(ticket.status)}</span>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {ticket.subject}
                </h1>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Ticket ID: <span className="font-mono">{ticket.id.slice(0, 8)}...</span>
              </div>
            </div>

            <span
              className={`inline-block px-3 py-1 rounded text-xs font-medium ${getPriorityColor(
                ticket.priority
              )}`}
            >
              {ticket.priority.toUpperCase()}
            </span>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-600 dark:text-slate-400">Status</p>
              <p className="font-medium text-slate-900 dark:text-white capitalize">
                {ticket.status.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Category</p>
              <p className="font-medium text-slate-900 dark:text-white capitalize">
                {ticket.category.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-slate-600 dark:text-slate-400">Created</p>
              <p className="font-medium text-slate-900 dark:text-white">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Close Ticket Button */}
          {(ticket.status === 'resolved' || ticket.status === 'open') && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              {showCloseConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    Are you sure you want to close this ticket?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCloseTicket}
                      disabled={isClosingTicket}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isClosingTicket ? 'Closing...' : 'Confirm Close'}
                    </button>
                    <button
                      onClick={() => setShowCloseConfirm(false)}
                      disabled={isClosingTicket}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded text-sm font-medium disabled:opacity-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-sm font-medium transition"
                >
                  Close Ticket
                </button>
              )}
            </div>
          )}

          {/* Original Message */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3 uppercase">
              Your Message
            </p>
            <div className="bg-slate-50 dark:bg-slate-700 rounded p-4 text-slate-900 dark:text-white whitespace-pre-wrap text-sm">
              {ticket.message}
            </div>
          </div>
        </div>

        {/* Conversation Thread */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Conversation</h2>

          {ticket.replies.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-600 dark:text-slate-400">
              No replies yet. We'll get back to you soon.
            </div>
          ) : (
            <div className="space-y-4">
              {ticket.replies.map(reply => (
                <div
                  key={reply.id}
                  className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                    <span className="font-medium text-slate-900 dark:text-white">Support Team</span>
                    {' • '}
                    {new Date(reply.createdAt).toLocaleString()}
                  </div>
                  <div className="text-slate-900 dark:text-white whitespace-pre-wrap text-sm">
                    {reply.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply Form */}
        {ticket.status !== 'closed' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add Reply</h2>

            <textarea
              value={newReply}
              onChange={e => setNewReply(e.target.value)}
              placeholder="Type your reply here..."
              className="w-full px-4 py-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              disabled={isSubmittingReply}
            />

            <div className="flex justify-end">
              <button
                onClick={handleAddReply}
                disabled={!newReply.trim() || isSubmittingReply}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isSubmittingReply ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
