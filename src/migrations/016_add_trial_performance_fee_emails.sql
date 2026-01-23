/**
 * Migration: Add Trial Performance Fee Email Types
 * Adds new email template types for performance fees trial notifications
 *
 * Changes:
 * - Add trial_ending_performance_fees email type
 * - Add trial_ending_soon_performance_fees email type
 * - Add trial_ending_soon_add_payment email type
 */

-- Update email_queue and email_log type constraints to include new trial email types
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_type_check;

ALTER TABLE email_queue ADD CONSTRAINT email_queue_type_check
  CHECK (type IN (
    'welcome',
    'email_verification',
    'password_reset',
    'subscription_created',
    'subscription_upgraded',
    'subscription_cancelled',
    'trial_ending',
    'trial_ending_performance_fees',
    'trial_ending_soon_performance_fees',
    'trial_ending_soon_add_payment',
    'invoice_created',
    'bot_created',
    'trade_alert',
    'account_settings_changed',
    'ticket_created',
    'ticket_replied',
    'ticket_resolved',
    'new_ticket_admin',
    'performance_fee_charged',
    'performance_fee_failed',
    'performance_fee_dunning',
    'performance_fee_adjustment',
    'performance_fee_refund',
    'bot_suspended_payment_failure',
    'bot_resumed'
  ));
