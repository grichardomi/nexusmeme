-- Direct USDC Payment References
-- Tracks invoices for performance fee collection via direct Base USDC transfers

CREATE TABLE IF NOT EXISTS usdc_payment_references (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id),
  payment_reference  VARCHAR(20) NOT NULL UNIQUE,  -- e.g. NXM-A3F9B2C1
  amount_usd         DECIMAL(12, 6) NOT NULL,
  amount_usdc_raw    VARCHAR(30) NOT NULL UNIQUE,  -- exact raw USDC units (6 decimals) — unique per invoice for exact matching
  fee_ids            UUID[] NOT NULL,              -- performance_fees IDs covered
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'expired')),
  wallet_address     VARCHAR(42) NOT NULL,         -- our receiving wallet
  usdc_contract      VARCHAR(42) NOT NULL,         -- USDC contract on Base
  tx_hash            VARCHAR(66) UNIQUE,           -- on-chain tx hash when paid
  paid_at            TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usdc_refs_user_id  ON usdc_payment_references(user_id);
CREATE INDEX IF NOT EXISTS idx_usdc_refs_status   ON usdc_payment_references(status);
CREATE INDEX IF NOT EXISTS idx_usdc_refs_reference ON usdc_payment_references(payment_reference);
CREATE INDEX IF NOT EXISTS idx_usdc_refs_tx_hash  ON usdc_payment_references(tx_hash);
