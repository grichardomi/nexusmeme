# Admin Panel - Complete Guide

## Overview

The Admin Panel is a comprehensive control center for managing all aspects of the NexusMeme platform. It provides admins with centralized access to support tickets, users, analytics, and system settings.

## Access & Navigation

### For Admin Users

**Getting to Admin Panel:**
1. Login to your account
2. Look for the purple **"Admin"** link in the top navigation (desktop) or **"Admin Panel"** in mobile menu
3. Click to access the admin dashboard

**Header Integration:**
- Desktop: "Admin" link appears next to "Dashboard" in top navigation
- Mobile: "Admin Panel" appears in dropdown menu after "Dashboard"
- Link is only visible to users with `role = 'admin'`

### Admin URL Structure

```
/admin                      → Redirects to /admin/dashboard
/admin/dashboard            → Main admin control center
/admin/tickets              → Support ticket management
/admin/users                → User account management
/admin/analytics            → Platform analytics (coming soon)
/admin/settings             → System settings (coming soon)
```

## Admin Dashboard Features

### Dashboard Overview (`/admin/dashboard`)

**Quick Stats:**
- Open Tickets - Number of unresolved support tickets
- Total Tickets - All support tickets in system
- Total Users - Active user accounts
- Average Resolution Time - Average ticket resolution time

**Admin Tools Grid:**
Four main sections for quick access:
1. 🎫 **Support Tickets** - Manage customer support requests
2. 👥 **Users** - Manage user accounts and roles
3. 📊 **Analytics** - View platform statistics
4. ⚙️ **Settings** - Configure system settings

**Recent Activity:**
- Activity log showing recent platform events (coming soon)

## Support Tickets Management

### Main Features (`/admin/tickets`)

**List View:**
- View all support tickets from all users
- Filter by Status: Open, In Progress, Resolved, Closed
- Filter by Priority: Low, Normal, High, Urgent
- Search by ticket ID or subject
- Tickets auto-sorted by priority (urgent first)
- Pagination support

**Ticket Status:**
- 🔵 Open - New, unreviewed tickets
- 🟡 In Progress - Being worked on
- ✅ Resolved - Issue resolved, awaiting user confirmation
- ⭕ Closed - Issue closed, no further discussion

**Ticket Priority:**
- 🔴 **Urgent** - Pro plan users (same-day response target)
- 🟠 **High** - Standard plan users (24-hour response target)
- 🔵 **Normal** - Free plan users (standard response)
- 🟢 **Low** - Manually set low priority

### Ticket Detail Page (`/admin/tickets/[id]`)

**Ticket Information:**
- Subject and full message
- Status dropdown (change status in real-time)
- Priority dropdown (override auto-assigned priority)
- Category display (technical, billing, general, bug_report)
- Creation date and ticket metadata

**Conversation Thread:**
- Full history of user messages and admin replies
- Internal notes (admin-only, not visible to users)
- Timestamps for all replies

**Admin Actions:**
- Add public reply (visible to user)
- Add internal note (admin-only, for team communication)
- Change ticket status
- Change priority
- Assign ticket to admin (coming soon)

## User Management

### User List (`/admin/users`)

**Features:**
- View all user accounts
- Search by email or name
- Paginated list (20 users per page)
- See user role (User or Admin)
- Check email verification status
- View account creation date

**User Information Displayed:**
- Email address
- Name
- Role badge (User/Admin)
- Verification status (✓ Verified or Pending)
- Account creation date

**Admin Actions:**
- Search and filter users
- (Coming soon) Edit user details
- (Coming soon) View user activity
- (Coming soon) Suspend/deactivate accounts

### Promoting Users to Admin

To make a user an admin, use the provided SQL command in the help text:

```bash
psql "postgresql://postgres:nEzWKQIlbUtJhicQcRKcGVKBZkpepuIx@ballast.proxy.rlwy.net:31006/railway"

UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

Or via direct database:
```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

## Analytics (Coming Soon)

### Planned Features

- User growth trends
- Support ticket resolution metrics
- Trading bot performance tracking
- Revenue and subscription insights
- API usage statistics
- Real-time activity monitoring
- Custom date range reports

## Settings (Coming Soon)

### Planned Features

- Email notification templates
- API key management
- Webhook configuration
- User role and permission management
- System maintenance tools
- Audit logs and activity tracking
- Platform-wide settings

## Admin Layout

### Sidebar Navigation

The admin sidebar provides quick access to all admin sections:

```
Admin Panel
├── 📊 Dashboard
├── 🎫 Support Tickets
├── 👥 Users
├── 📊 Analytics
└── ⚙️ Settings
```

**Features:**
- Mobile-responsive (collapsible on small screens)
- Current page highlighting
- Admin user info at bottom
- Logo/branding at top
- Hover effects for better UX

### Top Navigation Bar

- Displays current page title
- Mobile menu toggle
- Responsive layout

## API Endpoints

### Support Tickets API

```
GET /api/admin/tickets              - List all tickets with filters
GET /api/admin/tickets/[id]         - Get single ticket with replies
PATCH /api/admin/tickets/[id]       - Update ticket status/priority
POST /api/admin/tickets/[id]/reply  - Add reply or internal note
```

### Users API

```
GET /api/admin/users                - List all users with search
```

## Role-Based Access Control

### Permission Levels

**Regular User:**
- Cannot access `/admin/*` pages
- Automatically redirected to `/dashboard`
- API calls to admin endpoints return 403 Forbidden

**Admin User:**
- Full access to all admin pages
- Can view and manage all support tickets
- Can view all user accounts
- Can see internal notes
- Admin link visible in header navigation

### Authentication

All admin pages and endpoints require:
1. User must be logged in
2. User's role must be `'admin'` (in database)
3. Session must be valid (JWT token)

Unauthorized access attempts will be redirected to user dashboard or return 403 error.

## Best Practices

### Managing Support Tickets

1. **Prioritize by Status & Priority:**
   - Focus on Urgent and High priority tickets first
   - Address Open tickets before working on In Progress

2. **Update Status Regularly:**
   - Set to "In Progress" when you start working
   - Mark "Resolved" when issue is fixed
   - Mark "Closed" after user confirms

3. **Use Internal Notes:**
   - Add context for your team
   - Document investigation steps
   - Leave notes for ticket handoff

4. **Respond Promptly:**
   - Urgent: Same day response target
   - High: 24-hour response target
   - Normal: Standard response time

### User Management

1. **Verify New Admins:**
   - Only promote trusted users to admin
   - Document admin promotions

2. **Monitor Activity:**
   - Review recent tickets regularly
   - Check user growth trends

## Troubleshooting

### Can't Access Admin Panel

**Problem:** Getting "Forbidden" error or redirected to dashboard

**Solution:**
1. Verify you're logged in
2. Check your user role in database: `SELECT email, role FROM users WHERE email = 'your@email.com';`
3. If role is 'user', promote to admin using SQL command above
4. Logout and login again to refresh session

### Admin Link Not Showing

**Problem:** "Admin" link not visible in header

**Solution:**
1. Clear browser cache and cookies
2. Logout completely: `signOut()`
3. Login again
4. If still missing, verify role is 'admin' in database

### Ticket Not Updating

**Problem:** Status/priority changes not saving

**Solution:**
1. Check browser console for errors (F12 → Console)
2. Verify you have admin access
3. Try refreshing the page
4. Check database connection

## Future Enhancements

- [ ] Ticket assignment to specific admins
- [ ] SLA tracking and alerts
- [ ] Advanced analytics dashboard
- [ ] Webhook management
- [ ] Email template editor
- [ ] Audit logging
- [ ] Activity feed
- [ ] Bulk actions
- [ ] Export to CSV/PDF
- [ ] Automated responses
- [ ] Knowledge base integration

## Architecture

### Directory Structure

```
src/app/admin/
├── layout.tsx                   - Admin layout (sidebar, auth)
├── page.tsx                     - Root redirect to dashboard
├── dashboard/
│   └── page.tsx                 - Admin dashboard overview
├── tickets/
│   ├── page.tsx                 - Ticket list with filters
│   └── [id]/
│       └── page.tsx             - Ticket detail page
├── users/
│   └── page.tsx                 - User management
├── analytics/
│   └── page.tsx                 - Analytics (placeholder)
└── settings/
    └── page.tsx                 - Settings (placeholder)

src/app/api/admin/
├── tickets/
│   ├── route.ts                 - GET all, PATCH update
│   ├── [id]/
│   │   ├── route.ts             - GET single, PATCH update
│   │   └── reply/
│   │       └── route.ts         - POST replies/notes
└── users/
    └── route.ts                 - GET users list

src/components/layouts/
├── Header.tsx                   - Updated with admin link
└── AdminLayout.tsx              - Admin-specific layout

src/types/
└── support.ts                   - Support ticket types
```

### Key Files Modified

- `src/components/layouts/Header.tsx` - Added admin navigation link
- `src/app/admin/layout.tsx` - Admin section layout
- `src/types/email.ts` - Email notification types

## Support

For questions or issues with the admin panel:
1. Check this guide's troubleshooting section
2. Review error messages in browser console
3. Check database logs for issues
4. Contact development team if needed

---

**Admin Panel Version:** 1.0
**Last Updated:** January 2025
