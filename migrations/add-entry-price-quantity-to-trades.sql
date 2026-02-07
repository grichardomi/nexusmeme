-- Migration: Add entry_price and quantity columns to trades table
-- Purpose: Fix "PEAK UPDATE FAILED - Missing position data" issue
-- Date: 2026-02-06

-- Add columns if they don't exist (safe for production)
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(20, 8);

-- Backfill existing trades with data from price/amount columns
-- This fixes open trades that are currently missing peak tracking data
UPDATE trades
SET
  entry_price = price,
  quantity = amount
WHERE
  entry_price IS NULL
  AND price IS NOT NULL;

-- Add NOT NULL constraint after backfill (optional - uncomment if desired)
-- ALTER TABLE trades
--   ALTER COLUMN entry_price SET NOT NULL,
--   ALTER COLUMN quantity SET NOT NULL;

-- Create index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_trades_entry_price ON trades(entry_price);
CREATE INDEX IF NOT EXISTS idx_trades_quantity ON trades(quantity);

-- Verify migration
SELECT
  COUNT(*) as total_trades,
  COUNT(entry_price) as trades_with_entry_price,
  COUNT(quantity) as trades_with_quantity,
  COUNT(*) FILTER (WHERE entry_price IS NULL) as missing_entry_price,
  COUNT(*) FILTER (WHERE quantity IS NULL) as missing_quantity
FROM trades;
