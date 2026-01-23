/**
 * Migration: Add Trial Notification Tracking
 * Adds support for tracking trial expiration notifications
 *
 * Changes:
 * - Add trial_ends_at column to subscriptions table
 * - Add trial_notification_sent_at column to track when notifications are sent
 */

-- Add trial_ends_at column to subscriptions (for Stripe trial tracking)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;

-- Add trial_notification_sent_at column to track when expiration notification was sent
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS trial_notification_sent_at TIMESTAMP;

-- Create index for efficient trial notification queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_notification
  ON subscriptions(status, trial_ends_at, trial_notification_sent_at)
  WHERE status = 'trialing' AND trial_ends_at IS NOT NULL;

-- Add comment to clarify trial fields
COMMENT ON COLUMN subscriptions.trial_ends_at IS 'Date when trial period ends (from Stripe)';
COMMENT ON COLUMN subscriptions.trial_notification_sent_at IS 'Timestamp of last trial expiration notification sent';
