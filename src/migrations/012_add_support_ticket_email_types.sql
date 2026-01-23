-- Add support ticket email types to email_queue constraint
-- Migration: 012_add_support_ticket_email_types

-- Drop the old constraint
ALTER TABLE email_queue DROP CONSTRAINT email_queue_type_check;

-- Add new constraint with support ticket types included
ALTER TABLE email_queue ADD CONSTRAINT email_queue_type_check
  CHECK (type IN (
    'welcome',
    'email_verification',
    'password_reset',
    'subscription_created',
    'subscription_upgraded',
    'subscription_cancelled',
    'trial_ending',
    'invoice_created',
    'bot_created',
    'trade_alert',
    'account_settings_changed',
    'ticket_created',
    'ticket_replied',
    'ticket_resolved',
    'new_ticket_admin'
  ));
