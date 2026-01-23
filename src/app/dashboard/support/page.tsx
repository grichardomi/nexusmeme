'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useLoadMore } from '@/hooks/useLoadMore';
import type { SupportTicket } from '@/types/support';

/**
 * User Support Dashboard Page
 * Shows user's support tickets with infinite scroll "Load More" pagination
 * and provides ability to create new tickets
 */

export default function SupportPage() {
  const { status } = useSession();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [fetchedTicketIds, setFetchedTicketIds] = useState<Set<string>>(new Set());

  // Memoize fetch function to prevent infinite re-renders
  const fetchTicketsData = useCallback(async (offset: number, limit: number) => {
    const response = await fetch(`/api/support/tickets?offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch tickets');

    const data = await response.json();
    return {
      items: data.tickets || [],
      total: data.total || 0,
    };
  }, []);

  // Load more pagination
  const { items: tickets, isLoading, error, hasMore, load, loadMore } = useLoadMore<SupportTicket>({
    initialPageSize: 20,
    pageSize: 20,
    fetchFn: fetchTicketsData,
  });

  // Initialize on mount
  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin');
    }

    if (status === 'authenticated') {
      // Ensure job processor is running
      fetch('/api/init').catch(err => console.warn('Failed to initialize processor:', err));
      load();
    }
  }, [status, load]);

  // Refetch unread counts when page comes back to focus (user returns from detail page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tickets.length > 0) {
        refreshUnreadCounts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tickets.length]);

  // Poll for unread count updates every 60 seconds while page is visible
  useEffect(() => {
    if (tickets.length === 0) return;

    const pollInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        await refreshUnreadCounts();
      }
    }, 60000); // Poll every 60 seconds (low-overhead internal API calls)

    return () => clearInterval(pollInterval);
  }, [tickets.length]);

  /**
   * Refresh only unread counts (lightweight operation after viewing ticket)
   */
  const refreshUnreadCounts = async () => {
    try {
      const counts: Record<string, number> = {};
      for (const ticket of tickets) {
        try {
          const countResponse = await fetch(`/api/support/tickets/${ticket.id}/unread-count`);
          if (countResponse.ok) {
            const countData = await countResponse.json();
            counts[ticket.id] = countData.unreadCount || 0;
          }
        } catch (countError) {
          console.error(`Failed to refresh unread count for ticket ${ticket.id}:`, countError);
        }
      }
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Failed to refresh unread counts:', err);
    }
  };

  /**
   * Fetch unread counts for only newly loaded tickets (not already fetched)
   */
  const fetchUnreadCountsForNewTickets = async (ticketsToFetch: SupportTicket[]) => {
    try {
      // Find tickets we haven't fetched counts for yet
      const newTickets = ticketsToFetch.filter(ticket => !fetchedTicketIds.has(ticket.id));

      if (newTickets.length === 0) return;

      const counts: Record<string, number> = {};
      for (const ticket of newTickets) {
        try {
          const countResponse = await fetch(`/api/support/tickets/${ticket.id}/unread-count`);
          if (countResponse.ok) {
            const countData = await countResponse.json();
            counts[ticket.id] = countData.unreadCount || 0;
          }
        } catch (countError) {
          console.error(`Failed to fetch unread count for ticket ${ticket.id}:`, countError);
        }
      }

      // Update tracked IDs and counts
      setFetchedTicketIds(prev => {
        const updated = new Set(prev);
        newTickets.forEach(t => updated.add(t.id));
        return updated;
      });
      setUnreadCounts(prev => ({ ...prev, ...counts }));
    } catch (err) {
      console.error('Failed to fetch unread counts:', err);
    }
  };

  // Fetch unread counts only for newly loaded tickets
  useEffect(() => {
    if (tickets.length > 0) {
      fetchUnreadCountsForNewTickets(tickets);
    }
  }, [tickets.length, fetchedTicketIds]);

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

  if (status === 'loading') {
    return (
      <DashboardLayout title="Support">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Support">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Support Tickets</h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
          >
            Create Ticket
          </button>
        </div>

        {/* Error Alert */}
        {error && tickets.length === 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Create Ticket Modal */}
        {showCreateForm && (
          <CreateTicketForm
            onClose={() => setShowCreateForm(false)}
            onSuccess={() => {
              setShowCreateForm(false);
              load();
            }}
          />
        )}

        {/* Tickets List */}
        <div className="space-y-4">
          {tickets.length === 0 && !isLoading ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400 mb-4">No support tickets yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                If you need help, click "Create Ticket" above to get in touch with our support team.
              </p>
            </div>
          ) : (
            <>
              {tickets.map(ticket => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/support/${ticket.id}`}
                  className="block bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg">{getStatusIcon(ticket.status)}</span>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {ticket.subject}
                        </h3>
                        {(unreadCounts[ticket.id] || 0) > 0 && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-semibold">
                            {unreadCounts[ticket.id]} new
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Created {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <span
                      className={`inline-block px-3 py-1 rounded text-xs font-medium ${getPriorityColor(
                        ticket.priority
                      )}`}
                    >
                      {ticket.priority.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500 dark:text-slate-500 capitalize">
                      {ticket.category.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-500 capitalize">
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center pt-4">
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

              {/* Loading indicator at bottom */}
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
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

/**
 * Create Ticket Form Component
 */
interface CreateTicketFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FieldErrors {
  subject?: string;
  message?: string;
}

const VALIDATION_RULES = {
  subject: {
    minLength: 5,
    maxLength: 255,
  },
  message: {
    minLength: 10,
    maxLength: 5000,
  },
};

function CreateTicketForm({ onClose, onSuccess }: CreateTicketFormProps) {
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    category: 'general' as const,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState({ subject: false, message: false });

  /**
   * Validate individual field
   */
  const validateField = (name: string, value: string): string | undefined => {
    if (name === 'subject') {
      if (!value.trim()) {
        return 'Subject is required';
      }
      if (value.trim().length < VALIDATION_RULES.subject.minLength) {
        return `Subject must be at least ${VALIDATION_RULES.subject.minLength} characters`;
      }
      if (value.length > VALIDATION_RULES.subject.maxLength) {
        return `Subject must be no more than ${VALIDATION_RULES.subject.maxLength} characters`;
      }
    }

    if (name === 'message') {
      if (!value.trim()) {
        return 'Message is required';
      }
      if (value.trim().length < VALIDATION_RULES.message.minLength) {
        return `Message must be at least ${VALIDATION_RULES.message.minLength} characters`;
      }
      if (value.length > VALIDATION_RULES.message.maxLength) {
        return `Message must be no more than ${VALIDATION_RULES.message.maxLength} characters`;
      }
    }

    return undefined;
  };

  /**
   * Handle field change with real-time validation
   */
  const handleFieldChange = (field: 'subject' | 'message', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Only show errors if field has been touched
    if (touched[field]) {
      const fieldError = validateField(field, value);
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        if (fieldError) {
          newErrors[field] = fieldError;
        } else {
          delete newErrors[field];
        }
        return newErrors;
      });
    }
  };

  /**
   * Handle field blur to mark as touched
   */
  const handleFieldBlur = (field: 'subject' | 'message') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const fieldError = validateField(field, formData[field]);
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      if (fieldError) {
        newErrors[field] = fieldError;
      } else {
        delete newErrors[field];
      }
      return newErrors;
    });
  };

  /**
   * Validate entire form
   */
  const validateForm = (): boolean => {
    const newErrors: FieldErrors = {};

    const subjectError = validateField('subject', formData.subject);
    if (subjectError) newErrors.subject = subjectError;

    const messageError = validateField('message', formData.message);
    if (messageError) newErrors.message = messageError;

    setFieldErrors(newErrors);
    setTouched({ subject: true, message: true });

    return Object.keys(newErrors).length === 0;
  };

  /**
   * Check if form is valid
   */
  const isFormValid = (): boolean => {
    return (
      formData.subject.trim().length >= VALIDATION_RULES.subject.minLength &&
      formData.subject.trim().length <= VALIDATION_RULES.subject.maxLength &&
      formData.message.trim().length >= VALIDATION_RULES.message.minLength &&
      formData.message.trim().length <= VALIDATION_RULES.message.maxLength &&
      Object.keys(fieldErrors).length === 0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ticket');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Support Ticket</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xl"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Subject *
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formData.subject.length}/{VALIDATION_RULES.subject.maxLength}
              </span>
            </div>
            <input
              type="text"
              value={formData.subject}
              onChange={e => handleFieldChange('subject', e.target.value)}
              onBlur={() => handleFieldBlur('subject')}
              placeholder="Brief description of your issue"
              className={`w-full px-4 py-2 rounded border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition ${
                fieldErrors.subject && touched.subject
                  ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
              }`}
              disabled={isSubmitting}
            />
            {fieldErrors.subject && touched.subject && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.subject}</p>
            )}
            {!fieldErrors.subject && touched.subject && formData.subject.trim() && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ Valid</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
              className="w-full px-4 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              disabled={isSubmitting}
            >
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="billing">Billing</option>
              <option value="bug_report">Bug Report</option>
            </select>
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Message *
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formData.message.length}/{VALIDATION_RULES.message.maxLength}
              </span>
            </div>
            <textarea
              value={formData.message}
              onChange={e => handleFieldChange('message', e.target.value)}
              onBlur={() => handleFieldBlur('message')}
              placeholder="Please provide details about your issue..."
              className={`w-full px-4 py-2 rounded border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition resize-none ${
                fieldErrors.message && touched.message
                  ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
              }`}
              rows={6}
              disabled={isSubmitting}
            />
            {fieldErrors.message && touched.message && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.message}</p>
            )}
            {!fieldErrors.message && touched.message && formData.message.trim() && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ Valid</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium text-sm transition"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 rounded font-medium text-sm transition ${
                isFormValid() && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              }`}
              disabled={!isFormValid() || isSubmitting}
              title={!isFormValid() ? 'Please fill in all required fields correctly' : ''}
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
