/**
 * Migration: Migrate Free Plan to Live Trial
 * Converts all existing free plans to live_trial plans
 *
 * Changes:
 * - Update all plan_tier='free' to plan_tier='live_trial'
 * - Set trial_started_at and trial_ends_at for migrated users (10-day trial)
 * - Set trial_capital_used to 0 for new trials
 */

-- Update existing free subscriptions to live_trial
-- These are users who were on the old free plan and need to be migrated to the new trial model
UPDATE subscriptions
SET
  plan_tier = 'live_trial',
  trial_started_at = COALESCE(trial_started_at, NOW()),
  trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '10 days'),
  trial_capital_used = COALESCE(trial_capital_used, 0),
  updated_at = NOW()
WHERE plan_tier = 'free' AND trial_started_at IS NULL;

-- Also update any existing performance_fees plans that don't have a trial history
-- (these are post-trial users)
UPDATE subscriptions
SET updated_at = NOW()
WHERE plan_tier = 'performance_fees' AND trial_started_at IS NULL;

-- Log the migration in comments
COMMENT ON TABLE subscriptions IS 'Migration applied: Free plan users converted to 10-day live trial starting 2026-01-20';
