-- Add exit_price column to trades table to track actual exit prices
-- This enables accurate P&L display and prevents showing entry price as exit price

ALTER TABLE trades
ADD COLUMN exit_price DECIMAL(20, 8) NULL DEFAULT NULL;

-- Add index for queries filtering by exit_price
CREATE INDEX idx_trades_exit_price ON trades(exit_price) WHERE exit_price IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN trades.exit_price IS 'Actual price at which the trade was exited. Used for P&L calculations and display.';
