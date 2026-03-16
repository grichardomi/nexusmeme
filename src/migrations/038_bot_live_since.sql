-- Track when a bot first switched to live trading
-- Used to separate live P&L stats from paper trading history

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS live_since TIMESTAMPTZ;

-- Backfill: bots already in live mode get live_since = updated_at as best estimate
UPDATE bot_instances
SET live_since = updated_at
WHERE trading_mode = 'live' AND live_since IS NULL;

-- Also backfill from config.tradingMode for bots that store mode in config only
UPDATE bot_instances
SET live_since = updated_at
WHERE config->>'tradingMode' = 'live' AND live_since IS NULL;

CREATE INDEX IF NOT EXISTS idx_bot_instances_live_since ON bot_instances (live_since)
  WHERE live_since IS NOT NULL;
