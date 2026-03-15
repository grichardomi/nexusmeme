-- Migration 033: Add fee_exempt flag to user_billing
-- Allows admin to waive performance fee obligations for specific users.
-- When fee_exempt = true: bots keep running regardless of unpaid invoices;
-- new performance fees are recorded as 'waived' automatically.

-- Support both table names (migration 030 renamed the table; apply to whichever exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='user_billing') THEN
    ALTER TABLE user_stripe_billing RENAME TO user_billing;
  END IF;
END $$;

-- Drop NOT NULL on stripe_customer_id — Stripe has been removed; column is vestigial.
-- Dropping NOT NULL allows admin-granted billing rows to be inserted without a Stripe ID.
ALTER TABLE user_billing
  ALTER COLUMN stripe_customer_id DROP NOT NULL;

-- Add fee exemption columns
ALTER TABLE user_billing
  ADD COLUMN IF NOT EXISTS fee_exempt BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_exempt_reason TEXT,
  ADD COLUMN IF NOT EXISTS fee_exempt_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_exempt_set_by TEXT;  -- admin user id

-- Update billing_status check to include 'exempt'
ALTER TABLE user_billing
  DROP CONSTRAINT IF EXISTS user_billing_billing_status_check,
  DROP CONSTRAINT IF EXISTS user_stripe_billing_billing_status_check;

ALTER TABLE user_billing
  ADD CONSTRAINT user_billing_billing_status_check
  CHECK (billing_status IN ('active', 'past_due', 'suspended', 'cancelled', 'exempt'));

CREATE INDEX IF NOT EXISTS idx_user_billing_fee_exempt
  ON user_billing(user_id) WHERE fee_exempt = true;
