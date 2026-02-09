'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useLoadMore } from '@/hooks/useLoadMore';
import { DiscordInvite } from '@/components/community/DiscordInvite';
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
  const [canAccessSupport, setCanAccessSupport] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [showTicketSection, setShowTicketSection] = useState(false);

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

  // Check support access (all authenticated users can access support)
  useEffect(() => {
    if (status === 'authenticated') {
      // Support is now available to all users for private/account-specific issues
      setCanAccessSupport(true);
      setIsCheckingAccess(false);
    }
  }, [status]);

  // Initialize on mount
  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin');
    }

    if (status === 'authenticated' && canAccessSupport) {
      // Ensure job processor is running
      fetch('/api/init').catch(err => console.warn('Failed to initialize processor:', err));
      load();
    }
  }, [status, canAccessSupport, load]);

  // Auto-expand ticket section if user has existing tickets
  useEffect(() => {
    if (tickets.length > 0) {
      setShowTicketSection(true);
    }
  }, [tickets.length]);

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

  if (status === 'loading' || isCheckingAccess) {
    return (
      <DashboardLayout title="Support">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-900 dark:text-white text-lg">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  // All users now have access to support for private/account-specific issues

  return (
    <DashboardLayout title="Community">
      <div className="space-y-4 md:space-y-6 max-w-full overflow-x-hidden">
        {/* Page Header */}
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Community & Support
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Get help from the community or reach our team
          </p>
        </div>

        {/* Discord Community - Primary Hero */}
        <DiscordInvite variant="banner" />

        {/* Why Discord Section */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">
            Most questions get answered faster on Discord
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Real-time answers from community & team</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Trading chat and market discussion</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Bot setup & configuration help</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Feature announcements & beta access</span>
            </div>
          </div>
        </div>

        {/* Ticket Section - Collapsed by default */}
        {!showTicketSection ? (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 sm:p-5 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Need to share private account details, report a security issue, or have a billing question?
            </p>
            <button
              onClick={() => setShowTicketSection(true)}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition touch-manipulation"
            >
              Open a private support ticket instead
            </button>
          </div>
        ) : (
          <>
            {/* Ticket Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Your Tickets
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  For private or account-specific issues &bull; 24-48h response
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2 transition touch-manipulation"
              >
                Create new ticket
              </button>
            </div>
            {/* Error Alert */}
            {error && tickets.length === 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Tickets List */}
            <div className="space-y-3 md:space-y-4 max-w-full">
              {tickets.length === 0 && !isLoading ? (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8 text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    No tickets yet. Click &quot;Create Ticket&quot; above if you have a private issue.
                  </p>
                </div>
              ) : (
                <>
                  {tickets.map(ticket => (
                    <Link
                      key={ticket.id}
                      href={`/dashboard/support/${ticket.id}`}
                      className="block bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-5 md:p-6 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition active:scale-[0.99] touch-manipulation overflow-hidden"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3 md:mb-4 min-w-0">
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-start gap-2 sm:gap-3 mb-2">
                            <span className="text-base sm:text-lg flex-shrink-0">{getStatusIcon(ticket.status)}</span>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white break-words line-clamp-2">
                                {ticket.subject}
                              </h3>
                              {(unreadCounts[ticket.id] || 0) > 0 && (
                                <span className="inline-block mt-1 px-2 py-0.5 sm:py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-semibold">
                                  {unreadCounts[ticket.id]} new
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 truncate">
                            Created {new Date(ticket.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        <span
                          className={`inline-block px-2.5 sm:px-3 py-1 rounded text-xs font-medium self-start flex-shrink-0 ${getPriorityColor(
                            ticket.priority
                          )}`}
                        >
                          {ticket.priority.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-4 flex-wrap min-w-0">
                        <span className="text-xs text-slate-500 dark:text-slate-500 capitalize truncate">
                          {ticket.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-500 capitalize truncate">
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </div>
                    </Link>
                  ))}

                  {hasMore && (
                    <div className="flex justify-center pt-3 md:pt-4">
                      <button
                        onClick={() => loadMore()}
                        disabled={isLoading}
                        className={`w-full sm:w-auto px-6 py-2.5 rounded font-medium text-sm sm:text-base transition touch-manipulation ${
                          isLoading
                            ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-[0.98]'
                        }`}
                      >
                        {isLoading ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}

                  {isLoading && tickets.length > 0 && (
                    <div className="flex justify-center py-4">
                      <div className="text-slate-600 dark:text-slate-400 text-sm">Loading more tickets...</div>
                    </div>
                  )}

                  {error && hasMore && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
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
  const [step, setStep] = useState<'discord-prompt' | 'form'>('discord-prompt');
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    category: 'general' as const,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState({ subject: false, message: false });
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/psad3vBVmv';

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-5 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            {step === 'discord-prompt' ? 'Need Help?' : 'Create Support Ticket'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-2xl sm:text-xl p-1 -m-1 touch-manipulation"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Step 1: Discord-first prompt */}
        {step === 'discord-prompt' && (
          <div className="space-y-5">
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-lg p-5 text-white">
              <h3 className="text-lg font-bold mb-2">Try Discord first — get answers in minutes</h3>
              <p className="text-sm text-indigo-100 mb-4">
                Our community and team are active on Discord. Most questions about trading and bot setup get answered much faster there.
              </p>
              <a
                href={discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 transition text-sm shadow-lg touch-manipulation"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Open Discord
              </a>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Only use tickets for private matters that can&apos;t be discussed publicly (account issues, billing, security concerns).
              </p>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2 transition touch-manipulation"
              >
                I need to submit a private ticket instead
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Actual ticket form */}
        {step === 'form' && (
        <>
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-700 dark:text-red-200 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          {/* Subject - Mobile First */}
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
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
              className={`w-full px-3 sm:px-4 py-2.5 sm:py-2 rounded border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:ring-2 transition touch-manipulation ${
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

          {/* Category - Mobile First */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition touch-manipulation"
              disabled={isSubmitting}
            >
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="billing">Billing</option>
              <option value="bug_report">Bug Report</option>
            </select>
          </div>

          {/* Message - Mobile First */}
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
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
              className={`w-full px-3 sm:px-4 py-2.5 sm:py-2 rounded border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:ring-2 transition resize-none touch-manipulation ${
                fieldErrors.message && touched.message
                  ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
              }`}
              rows={5}
              disabled={isSubmitting}
            />
            {fieldErrors.message && touched.message && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.message}</p>
            )}
            {!fieldErrors.message && touched.message && formData.message.trim() && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ Valid</p>
            )}
          </div>

          {/* Actions - Mobile First: Stack on mobile, row on desktop */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium text-sm transition touch-manipulation active:scale-[0.98]"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded font-medium text-sm transition touch-manipulation ${
                isFormValid() && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer active:scale-[0.98]'
                  : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              }`}
              disabled={!isFormValid() || isSubmitting}
              title={!isFormValid() ? 'Please fill in all required fields correctly' : ''}
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
