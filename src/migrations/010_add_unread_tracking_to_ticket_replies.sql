-- Migration: Add unread tracking to support ticket replies
-- This allows users to see when they have new responses from support

-- Add unread_by_user column to track if user has read the admin reply
ALTER TABLE support_ticket_replies ADD COLUMN IF NOT EXISTS unread_by_user BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for efficient unread count queries
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_unread ON support_ticket_replies(ticket_id, unread_by_user) WHERE unread_by_user = TRUE;

-- Add function to mark replies as read
CREATE OR REPLACE FUNCTION mark_ticket_replies_read(p_ticket_id UUID) RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE support_ticket_replies
  SET unread_by_user = FALSE
  WHERE ticket_id = p_ticket_id AND unread_by_user = TRUE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Add function to get unread count for a ticket
CREATE OR REPLACE FUNCTION get_ticket_unread_count(p_ticket_id UUID) RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM support_ticket_replies
  WHERE ticket_id = p_ticket_id AND unread_by_user = TRUE AND is_internal_note = FALSE;

  RETURN unread_count;
END;
$$ LANGUAGE plpgsql;
