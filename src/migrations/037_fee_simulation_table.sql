-- Fee simulation table: records skipped (non-billable) performance fees
-- for visibility into whether fee logic is working correctly.
-- These are trial/paper/exempt trades — zero financial value.
-- Auto-purged after 30 days via the purge function below.

CREATE TABLE IF NOT EXISTS fee_simulation (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id      TEXT NOT NULL,
  bot_instance_id UUID,
  pair          TEXT NOT NULL,
  profit_amount NUMERIC(18,8) NOT NULL,
  fee_amount    NUMERIC(18,8) NOT NULL,  -- what would have been charged
  fee_rate      NUMERIC(10,6) NOT NULL,
  skip_reason   TEXT NOT NULL CHECK (skip_reason IN ('trial', 'paper', 'exempt')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fee_simulation_user_id_idx ON fee_simulation (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fee_simulation_created_at_idx ON fee_simulation (created_at);

-- Purge function: delete records older than 30 days
-- Call manually or via pg_cron: SELECT purge_fee_simulation();
CREATE OR REPLACE FUNCTION purge_fee_simulation()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM fee_simulation WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
