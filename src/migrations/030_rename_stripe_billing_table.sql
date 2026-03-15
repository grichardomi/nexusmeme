-- Rename user_stripe_billing to user_billing
-- This table was named during Stripe planning phase; NexusMeme uses USDC on Base
ALTER TABLE IF EXISTS user_stripe_billing RENAME TO user_billing;

-- Rename the indexes
ALTER INDEX IF EXISTS idx_user_stripe_billing_customer RENAME TO idx_user_billing_customer;
ALTER INDEX IF EXISTS idx_user_stripe_billing_status RENAME TO idx_user_billing_status;
