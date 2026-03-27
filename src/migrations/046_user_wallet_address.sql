-- Add USDC wallet address to users table
-- Used for billing: user's payment wallet shown on billing page and onboarding checklist.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS usdc_wallet_address VARCHAR(42);

COMMENT ON COLUMN users.usdc_wallet_address IS 'User''s USDC wallet address on Base chain for payment identification';
