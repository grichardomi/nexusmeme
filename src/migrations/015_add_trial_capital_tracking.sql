/**
 * Migration: Add Trial Capital Tracking
 * Adds columns to track live trial capital usage for performance fees model
 *
 * Changes:
 * - Add trial_started_at column to track when trial begins
 * - Add trial_capital_used column to track capital used during trial ($500 USD limit)
 * - Update plan_tier column constraint to support new plan types
 */

-- Add trial_started_at column to track when live trial begins
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;

-- Add trial_capital_used column to track capital used during live trial
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS trial_capital_used DECIMAL(18, 8) DEFAULT 0;

-- Update plan_tier column constraint to support new plan types
ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;

ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_plan_tier_check
CHECK (plan_tier IN ('free', 'live_trial', 'performance_fees'));

-- Create index for efficient trial queries (WHERE clause must use immutable conditions only)
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_active
  ON subscriptions(user_id, trial_ends_at, trial_capital_used)
  WHERE plan_tier = 'live_trial';

-- Update existing comments
COMMENT ON COLUMN subscriptions.trial_started_at IS 'Timestamp when live trading trial period started';
COMMENT ON COLUMN subscriptions.trial_capital_used IS 'Total USD capital used during live trading trial (limit: $500)';
COMMENT ON COLUMN subscriptions.trial_ends_at IS 'Date when trial period ends (30 days from trial_started_at or when $500 capital limit reached)';
COMMENT ON COLUMN subscriptions.plan_tier IS 'Subscription plan: free (paper trading), live_trial (limited real trading), or performance_fees (unlimited with 5% fee on profits)';
