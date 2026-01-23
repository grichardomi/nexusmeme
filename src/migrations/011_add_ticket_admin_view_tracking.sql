-- Add admin view tracking to support tickets
-- Allows "NEW" badge to be removed once admin has viewed the ticket

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS first_viewed_by_admin_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient NEW badge queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_first_viewed_by_admin_at
ON support_tickets(first_viewed_by_admin_at)
WHERE first_viewed_by_admin_at IS NULL;
