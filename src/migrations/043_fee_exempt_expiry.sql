-- Add expiry date to fee exemptions so they don't last forever.
-- Null = permanent exemption (admin must explicitly expire it).

ALTER TABLE user_billing
  ADD COLUMN IF NOT EXISTS fee_exempt_expires_at TIMESTAMPTZ;

-- Index for fast expiry lookups in recordPerformanceFee
CREATE INDEX IF NOT EXISTS idx_user_billing_fee_exempt_expires
  ON user_billing (user_id)
  WHERE fee_exempt = TRUE AND fee_exempt_expires_at IS NOT NULL;
