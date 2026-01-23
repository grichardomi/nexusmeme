-- Add take_profit column to trades table
-- Stores the dynamic profit target calculated by AI for each trade
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS take_profit DECIMAL(20, 8);

COMMENT ON COLUMN trades.take_profit IS 'Dynamic profit target calculated by AI based on market regime (2-12% depending on ADX strength)';

-- Create index for profit target queries
CREATE INDEX IF NOT EXISTS idx_trades_take_profit ON trades(take_profit)
WHERE status = 'open';

-- Update existing trades with estimated take_profit from exit_time or mark NULL for historical data
-- Don't backfill - let new trades use dynamic targets
UPDATE trades SET take_profit = NULL WHERE take_profit IS NULL AND status IN ('open', 'closed');
