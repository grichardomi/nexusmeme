-- Track which dunning attempt has been sent for each invoice
-- Prevents re-sending the same dunning email every time the daily cron runs
-- 0 = no dunning sent, 1 = first reminder sent (Day 7), 2 = final warning sent (Day 10)
ALTER TABLE usdc_payment_references
  ADD COLUMN IF NOT EXISTS last_dunning_attempt INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN usdc_payment_references.last_dunning_attempt IS
  'Highest dunning attempt emailed: 0=none, 1=day7 reminder, 2=day10 final warning';
