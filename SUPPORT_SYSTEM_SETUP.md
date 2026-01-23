# Support Ticket System - Setup and Verification Guide

## Overview

The Admin Support Ticket System has been fully implemented with the following components:

1. **Database Schema** - Support tickets and replies tables with role-based access
2. **Authentication** - User role system integrated with NextAuth
3. **API Routes** - Full CRUD operations for both users and admins
4. **User Interface** - Support dashboard for users, admin panel for admins
5. **Email Notifications** - Templates and integration for ticket notifications

## Database Setup

### 1. Run Migration

Execute the database migration to create the support ticket tables:

```bash
psql $DATABASE_URL -f src/migrations/008_add_user_roles_and_support_tickets.sql
```

This will:
- Add `role` column to `users` table (default: 'user')
- Create `support_tickets` table
- Create `support_ticket_replies` table
- Create necessary indexes for performance

### 2. Verify Migration

Connect to your database and verify the tables exist:

```bash
psql $DATABASE_URL

-- Check users table has role column
\d users

-- Check support_tickets table
\d support_tickets

-- Check support_ticket_replies table
\d support_ticket_replies
```

## Admin User Setup

### 1. Promote Existing User to Admin

To make an existing user an admin, run:

```bash
psql $DATABASE_URL

-- Replace 'user@example.com' with the actual email
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

-- Verify the change
SELECT id, email, role FROM users WHERE email = 'user@example.com';
```

### 2. Create Admin User (if needed)

If you need to create a new admin user directly, you can insert it:

```bash
psql $DATABASE_URL

-- Replace values with actual data
INSERT INTO users (email, name, role, created_at, updated_at, email_verified_at)
VALUES ('admin@nexusmeme.com', 'Admin User', 'admin', NOW(), NOW(), NOW())
RETURNING id, email, role;
```

## File Structure

### New Files Created

#### Database
- `src/migrations/008_add_user_roles_and_support_tickets.sql` - Database schema

#### Types
- `src/types/support.ts` - Support ticket TypeScript interfaces

#### API Routes
- `src/app/api/support/tickets/route.ts` - GET/POST user tickets
- `src/app/api/support/tickets/[id]/route.ts` - GET single ticket
- `src/app/api/support/tickets/[id]/reply/route.ts` - POST user replies
- `src/app/api/admin/tickets/route.ts` - GET all tickets (admin)
- `src/app/api/admin/tickets/[id]/route.ts` - GET/PATCH ticket (admin)
- `src/app/api/admin/tickets/[id]/reply/route.ts` - POST admin replies

#### Admin Dashboard
- `src/app/admin/layout.tsx` - Admin layout with navigation
- `src/app/admin/tickets/page.tsx` - Ticket list page with filters
- `src/app/admin/tickets/[id]/page.tsx` - Ticket detail page

#### User Interface
- `src/app/dashboard/support/page.tsx` - Support dashboard with ticket creation
- `src/app/dashboard/support/[id]/page.tsx` - User ticket detail page

#### Email Templates
- `src/email/templates/support-tickets.tsx` - Email templates for support notifications

#### Modified Files
- `src/lib/auth.ts` - Added role to JWT and session
- `src/types/email.ts` - Added support ticket email types
- `src/email/render.ts` - Added support ticket email rendering

## Feature Overview

### User Features

#### Create Support Ticket
- Navigate to `/dashboard/support`
- Click "Create Ticket" button
- Fill in: Subject, Category (technical/billing/general/bug_report), Message
- Priority auto-assigned based on subscription plan:
  - **Free**: Normal
  - **Standard**: High
  - **Pro**: Urgent

#### View Support Tickets
- All tickets appear on support dashboard with:
  - Status indicator (🔵 Open, 🟡 In Progress, ✅ Resolved, ⭕ Closed)
  - Priority badge (color-coded)
  - Creation date
  - Click to view full details

#### Reply to Ticket
- Open ticket detail page
- View full conversation thread
- Add replies at bottom (disabled when ticket is closed)
- Receive email notifications when admin replies

### Admin Features

#### Access Admin Dashboard
- Admins only - redirects non-admins to `/dashboard`
- Navigate to `/admin/tickets`
- Shows all tickets in the system

#### Filter and Search
- Filter by Status (Open, In Progress, Resolved, Closed)
- Filter by Priority (Low, Normal, High, Urgent)
- Tickets sorted by priority (urgent first), then creation date

#### Manage Individual Tickets
- Click ticket to view detail page
- Update status and priority directly
- View full conversation thread including internal notes
- Add replies (visible to user) or internal notes (admin only)

#### Priority-Based Workflow
- **Urgent**: Top of queue, highest priority
- **High**: Below urgent, still prioritized
- **Normal**: Standard priority
- **Low**: Less urgent, can batch responses

## API Endpoints

### User API

#### List User's Tickets
```
GET /api/support/tickets?page=1&pageSize=10&status=open
Returns: { tickets: [], total: number, page: number, pageSize: number }
```

#### Create Ticket
```
POST /api/support/tickets
Body: { subject: string, message: string, category: string }
Returns: SupportTicket
```

#### Get Ticket Details
```
GET /api/support/tickets/{id}
Returns: SupportTicketWithReplies
```

#### Reply to Ticket
```
POST /api/support/tickets/{id}/reply
Body: { message: string }
Returns: SupportTicketReply
```

### Admin API

#### List All Tickets
```
GET /api/admin/tickets?page=1&pageSize=20&status=open&priority=urgent
Returns: { tickets: [], total: number, page: number, pageSize: number }
```

#### Get Ticket Details (includes internal notes)
```
GET /api/admin/tickets/{id}
Returns: SupportTicketWithReplies (includes is_internal_note=true replies)
```

#### Update Ticket
```
PATCH /api/admin/tickets/{id}
Body: { status?: string, priority?: string, assignedTo?: string }
Returns: SupportTicket
```

#### Reply/Add Note
```
POST /api/admin/tickets/{id}/reply
Body: { message: string, isInternalNote?: boolean }
Returns: SupportTicketReply
```

## Testing Checklist

### Phase 1: User Functionality
- [ ] Login as regular user (not admin)
- [ ] Navigate to `/dashboard/support`
- [ ] Create a test ticket with subject and message
- [ ] Verify ticket appears in list
- [ ] Verify correct priority based on subscription plan
- [ ] Click ticket to view details
- [ ] Add a reply to the ticket
- [ ] Verify reply appears in conversation thread

### Phase 2: Admin Functionality
- [ ] Logout and login as admin user
- [ ] Navigate to `/admin/tickets`
- [ ] Verify all tickets appear in list
- [ ] Test status filter
- [ ] Test priority filter
- [ ] Click a ticket to view admin detail page
- [ ] Verify can see all replies including internal notes
- [ ] Change ticket status and verify update
- [ ] Change ticket priority and verify update
- [ ] Add a reply (visible to user)
- [ ] Add an internal note (not visible to user)

### Phase 3: User Receives Updates
- [ ] Login as original user
- [ ] View ticket detail page
- [ ] Verify admin reply is visible
- [ ] Verify internal notes are NOT visible
- [ ] Check email inbox for admin reply notification

### Phase 4: Role-Based Access Control
- [ ] Logout as admin
- [ ] Login as regular user
- [ ] Try to access `/admin/tickets` directly
- [ ] Verify you're redirected to `/dashboard`
- [ ] Verify 403 error on `/api/admin/tickets` calls

## Email Notification Templates

### User Receives:
1. **Ticket Created** - Confirmation that ticket was received
2. **Ticket Replied** - Notification when admin responds
3. **Ticket Resolved** - Notification when ticket is marked resolved

### Admin Receives:
1. **New Ticket Alert** - Notification when new ticket is created with priority badge

## Priority Mapping

Tickets are automatically assigned priority based on user's subscription plan:

```typescript
- Free Plan → Normal Priority
- Standard Plan → High Priority
- Pro Plan → Urgent Priority
```

Admin can override priority manually.

## TODO: Email Integration

The email templates have been created and integrated into the system. To enable email notifications:

1. **Uncomment email sending in API routes:**
   - `src/app/api/support/tickets/route.ts` (line ~133 - ticket created)
   - `src/app/api/support/tickets/[id]/reply/route.ts` (line ~72 - ticket replied)
   - `src/app/api/admin/tickets/[id]/route.ts` (line ~125 - admin reply)

2. **Implement email trigger service** (if not already exists):
   ```typescript
   await sendEmail({
     to: userEmail,
     type: 'ticket_created',
     context: {
       name: user.name,
       ticketId: ticket.id,
       subject: ticket.subject,
       ticketUrl: `${baseUrl}/dashboard/support/${ticket.id}`,
     }
   });
   ```

## Troubleshooting

### User Role Not Set
If `role` column is missing errors:
```bash
psql $DATABASE_URL
ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
```

### Admin Can't Access `/admin/tickets`
1. Verify user's role is set to 'admin' in database
2. Logout/login to refresh session
3. Check browser console for auth errors

### Tickets Not Appearing
- Verify migration ran successfully
- Check database connection string
- Verify tables exist: `\d support_tickets`

### API Returns 403 Forbidden
- Verify you're logged in
- Verify user role is 'admin' (for admin endpoints)
- Check session cookie is set

## Future Enhancements

1. **Assignment System**
   - Assign tickets to specific admins
   - Filter by assigned-to in admin dashboard

2. **SLA Tracking**
   - Track response time based on priority
   - Alert on SLA breaches

3. **Analytics**
   - Admin dashboard with ticket metrics
   - Resolution time, satisfaction ratings

4. **Automation**
   - Auto-close resolved tickets after 7 days
   - Auto-escalate stale tickets

5. **Feedback System**
   - User satisfaction survey after resolution
   - Ticket rating system

6. **Integration**
   - Slack notifications for new tickets
   - Email threading with full ticket history

## Support

For questions about the support system implementation, refer to:
- Plan: `/home/omi/nexusmeme/IMPLEMENTATION_PLAN.md`
- Types: `src/types/support.ts`
- API Code: `src/app/api/support/` and `src/app/api/admin/`
