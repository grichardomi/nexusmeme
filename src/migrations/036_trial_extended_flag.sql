-- Track whether a user's trial was extended by an admin
-- Used to show "+ Extended" badge on billing page

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_extended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_extended_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS trial_extended_days INTEGER; -- total days added (cumulative)
