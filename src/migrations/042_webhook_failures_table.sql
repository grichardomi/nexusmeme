-- Recovery log for failed USDC webhook processing.
-- Alchemy returns 200 on all webhook deliveries (prevents retries on app errors).
-- Any DB transaction failure in processIncomingUSDCTransfer is recorded here for
-- manual recovery — admin can re-run the payment confirmation for these tx hashes.

CREATE TABLE IF NOT EXISTS webhook_failures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash       TEXT NOT NULL UNIQUE,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  raw_value     TEXT NOT NULL,
  block_num     TEXT,
  error_message TEXT,
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_unresolved ON webhook_failures (created_at)
  WHERE resolved = FALSE;
