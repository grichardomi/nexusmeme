-- Add pyramid level tracking to trades table
-- Allows safe multi-level position building without creating multiple trade records

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS pyramid_levels JSONB DEFAULT '[]';

-- Index for efficient pyramid level lookups
CREATE INDEX IF NOT EXISTS idx_trades_with_pyramids
ON trades(bot_instance_id, status)
WHERE pyramid_levels <> '[]'::jsonb;

-- Document the schema:
-- pyramid_levels: [
--   {
--     "level": 1,
--     "entryPrice": 45000.00,
--     "quantity": 0.01,
--     "entryTime": "2025-01-21T10:30:00Z",
--     "triggerProfitPct": 0.045,
--     "aiConfidence": 85
--   },
--   {
--     "level": 2,
--     "entryPrice": 47000.00,
--     "quantity": 0.005,
--     "entryTime": "2025-01-21T11:00:00Z",
--     "triggerProfitPct": 0.08,
--     "aiConfidence": 90
--   }
-- ]
