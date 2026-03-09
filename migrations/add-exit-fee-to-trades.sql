-- Add exit_fee column to trades table
-- Records the actual exit (sell) fee paid to the exchange
-- Enables per-trade entry vs exit fee breakdown in the UI
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_fee NUMERIC(20, 8);
