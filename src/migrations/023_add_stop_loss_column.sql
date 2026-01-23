-- Add stop_loss column to trades table
-- Stores the stop loss price for each trade (from /nexus implementation)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS stop_loss DECIMAL;

COMMENT ON COLUMN trades.stop_loss IS 'Stop loss price for the trade (used for stop loss exit checks)';

-- Create index for efficient stop loss queries
CREATE INDEX IF NOT EXISTS idx_trades_stop_loss ON trades(stop_loss)
WHERE status = 'open' AND stop_loss IS NOT NULL;
