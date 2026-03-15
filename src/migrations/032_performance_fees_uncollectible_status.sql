-- Migration 032: Add 'uncollectible' status to performance_fees
--
-- status is a VARCHAR with a CHECK constraint (not a PostgreSQL enum).
-- Drop and recreate the constraint to include the new value.
--
-- When a USDC invoice expires without payment, fees move 'billed' → 'uncollectible'.
-- This keeps revenue reporting accurate: billed_fees only shows genuinely collectable amounts.
-- Fees are preserved for audit history — never deleted.

ALTER TABLE performance_fees
  DROP CONSTRAINT IF EXISTS performance_fees_status_check;

ALTER TABLE performance_fees
  ADD CONSTRAINT performance_fees_status_check
  CHECK (status = ANY (ARRAY[
    'pending_billing',
    'billed',
    'paid',
    'refunded',
    'waived',
    'disputed',
    'uncollectible'
  ]));

-- Partial index for efficient write-off reporting queries
CREATE INDEX IF NOT EXISTS idx_performance_fees_uncollectible
  ON performance_fees (user_id, status)
  WHERE status = 'uncollectible';
