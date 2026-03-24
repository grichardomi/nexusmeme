-- Fix: prevent duplicate fee recording if closeTrade() is called twice
-- (retry, race condition, or network error causing double execution)
--
-- Step 1: Remove duplicate rows, keeping the oldest (lowest created_at) per trade_id.
-- Duplicates occur when closeTrade() was retried — the first record is canonical.

DELETE FROM performance_fees
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY trade_id ORDER BY created_at ASC, id ASC) AS rn
    FROM performance_fees
    WHERE trade_id IS NOT NULL
  ) dupes
  WHERE rn > 1
);

-- Step 2: Add the UNIQUE constraint now that duplicates are gone.
ALTER TABLE performance_fees
  ADD CONSTRAINT performance_fees_trade_id_unique UNIQUE (trade_id);
