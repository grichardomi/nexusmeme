-- Rename coinbase_charge_id to payment_reference in performance_fees table
-- This column stores USDC payment references, not Coinbase Commerce charge IDs
ALTER TABLE performance_fees RENAME COLUMN coinbase_charge_id TO payment_reference;

-- Drop old index if exists, create new one
DROP INDEX IF EXISTS idx_performance_fees_coinbase_charge;
CREATE INDEX IF NOT EXISTS idx_performance_fees_payment_reference ON performance_fees(payment_reference);
