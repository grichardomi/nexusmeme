-- Add constraint to prevent multiple open positions on the same pair per bot
-- First, close any duplicate open positions, keeping only the most recent one

-- For each (bot_instance_id, pair), close all but the most recent open position
WITH duplicates AS (
  SELECT id, entry_time,
    ROW_NUMBER() OVER (PARTITION BY bot_instance_id, pair ORDER BY entry_time DESC) as rn
  FROM trades
  WHERE status = 'open'
)
UPDATE trades
SET status = 'closed', exit_time = NOW()
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Now create unique partial index: only one open position per (bot_instance_id, pair)
-- Partial index only includes rows where status = 'open'
-- This enforces the "one position per pair per bot" rule at the database level
CREATE UNIQUE INDEX uk_one_open_position_per_pair
  ON trades(bot_instance_id, pair)
  WHERE status = 'open';
