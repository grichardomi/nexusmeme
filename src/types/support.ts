/**
 * Support Ticket Types
 * Type definitions for support ticket system
 */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'technical' | 'billing' | 'general' | 'bug_report';
export type UserRole = 'user' | 'admin';

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assignedTo?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  firstViewedByAdminAt?: Date; // Null = NEW badge shows
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportTicketReply {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternalNote: boolean;
  createdAt: Date;
}

export interface SupportTicketWithReplies extends SupportTicket {
  replies: SupportTicketReply[];
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  category: TicketCategory;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
}

export interface ReplyToTicketInput {
  message: string;
  isInternalNote?: boolean;
}

export interface TicketListFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  category?: TicketCategory;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface TicketListResponse {
  tickets: SupportTicket[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get default priority based on user plan
 */
export function getPriorityByPlan(plan: string): TicketPriority {
  switch (plan) {
    case 'pro':
      return 'urgent';
    case 'standard':
      return 'high';
    case 'free':
    default:
      return 'normal';
  }
}
