-- Add peak profit tracking to trades table for erosion cap and underwater timeout
-- This persists peak profit data to survive process restarts
-- Essential for exit logic (erosion cap exceeded, underwater timeout)

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS peak_profit_percent DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS peak_profit_recorded_at TIMESTAMP DEFAULT NULL;

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_trades_peak_profit ON trades(peak_profit_percent);

-- Add comment explaining the columns
COMMENT ON COLUMN trades.peak_profit_percent IS 'Peak profit % reached by this trade - used for erosion cap exit checks';
COMMENT ON COLUMN trades.peak_profit_recorded_at IS 'When peak profit was first recorded - used for exit logic';
