-- Add pair column to performance_fees table
-- This stores the actual trading pair so we don't need to join with trades table

ALTER TABLE performance_fees
ADD COLUMN IF NOT EXISTS pair VARCHAR(20);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_performance_fees_pair ON performance_fees(pair);

-- Backfill existing fees with pair from trades table (if exists) or bot's first enabled_pair
UPDATE performance_fees pf
SET pair = COALESCE(
  (SELECT t.pair FROM trades t WHERE t.id::text = pf.trade_id LIMIT 1),
  (SELECT bi.enabled_pairs[1] FROM bot_instances bi WHERE bi.id = pf.bot_instance_id LIMIT 1)
)
WHERE pair IS NULL;

-- Display results
SELECT
  COUNT(*) as total_fees,
  COUNT(pair) as fees_with_pair,
  COUNT(*) - COUNT(pair) as fees_without_pair
FROM performance_fees;
