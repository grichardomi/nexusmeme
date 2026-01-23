-- Add Trading Mode Support
-- Allows users to start with paper trading before going live

-- Add trading_mode column to bot_instances
-- Defaults to 'paper' for safety: users must explicitly switch to live trading
ALTER TABLE bot_instances
ADD COLUMN IF NOT EXISTS trading_mode VARCHAR DEFAULT 'paper';

-- Add index for quick filtering by mode
CREATE INDEX IF NOT EXISTS idx_bot_instances_trading_mode ON bot_instances(trading_mode);

-- Update existing bots to paper mode (safer default)
UPDATE bot_instances SET trading_mode = 'paper' WHERE trading_mode IS NULL;
