-- Add trading_mode column to trades table
-- Tracks whether each trade was paper (simulated) or live (real exchange)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS trading_mode VARCHAR DEFAULT 'live';

COMMENT ON COLUMN trades.trading_mode IS 'Trading mode: paper (simulated) or live (real exchange execution)';

-- Create index for filtering trades by mode
CREATE INDEX IF NOT EXISTS idx_trades_trading_mode ON trades(trading_mode)
WHERE status = 'open' OR status = 'closed';

-- Update existing trades to 'live' (backward compatibility - assume all were live)
UPDATE trades SET trading_mode = 'live' WHERE trading_mode IS NULL OR trading_mode = '';
