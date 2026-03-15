-- Migration 034: Add trial_duration_days to billing_settings
-- Allows admin to configure free trial length from /admin/fees
-- without a code deploy. Falls back to TRIAL_DURATION_DAYS env var if missing.

INSERT INTO billing_settings (key, value, updated_at)
VALUES (
  'trial_duration_days',
  '10',
  NOW()
)
ON CONFLICT (key) DO NOTHING;
