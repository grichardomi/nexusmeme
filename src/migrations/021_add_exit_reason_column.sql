-- Add exit_reason column to trades table to record why a position was closed
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS exit_reason VARCHAR;

COMMENT ON COLUMN trades.exit_reason IS 'Reason code for closing a trade (e.g., manual_close, momentum_failure, stop_loss)';

