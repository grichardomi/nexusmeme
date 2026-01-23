-- Migration: Add unread tracking for admin users
-- This allows admins to see when they have new replies from users

-- Add unread_by_admin column to track if admin has read the user reply
ALTER TABLE support_ticket_replies ADD COLUMN IF NOT EXISTS unread_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for efficient unread count queries
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_admin_unread ON support_ticket_replies(ticket_id, unread_by_admin) WHERE unread_by_admin = TRUE;

-- Add function to mark replies as read by admin
CREATE OR REPLACE FUNCTION mark_ticket_replies_read_by_admin(p_ticket_id UUID) RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE support_ticket_replies
  SET unread_by_admin = FALSE
  WHERE ticket_id = p_ticket_id AND unread_by_admin = TRUE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Add function to get unread count for a ticket (admin perspective)
CREATE OR REPLACE FUNCTION get_ticket_admin_unread_count(p_ticket_id UUID) RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM support_ticket_replies
  WHERE ticket_id = p_ticket_id AND unread_by_admin = TRUE AND is_internal_note = FALSE;

  RETURN unread_count;
END;
$$ LANGUAGE plpgsql;
