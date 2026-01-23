/**
 * Migration 014: Scope Billing Run Metrics
 * 
 * Adds explicit association between performance_fees and billing_runs
 * Ensures billing metrics only count fees processed in the current run
 * Prevents metrics from accumulating fees from previous failed runs
 */

-- Add billing_run_id column to track which run processed each fee
ALTER TABLE performance_fees
ADD COLUMN IF NOT EXISTS billing_run_id UUID REFERENCES billing_runs(id) ON DELETE SET NULL;

-- Create index for fast lookup of fees by billing run
CREATE INDEX IF NOT EXISTS idx_performance_fees_billing_run_id 
ON performance_fees(billing_run_id) 
WHERE billing_run_id IS NOT NULL;

-- Add comment explaining the association
COMMENT ON COLUMN performance_fees.billing_run_id IS 'Associates this fee with the billing_run that processed it, ensuring metrics are scoped correctly';

-- Backfill billing_run_id for existing billed fees (associate with nearest billing run)
-- This ensures old data is properly attributed
UPDATE performance_fees pf
SET billing_run_id = br.id
FROM billing_runs br
WHERE pf.status = 'billed' 
  AND pf.billing_run_id IS NULL
  AND br.status = 'completed'
  AND pf.billed_at >= br.period_start
  AND pf.billed_at <= br.period_end;

-- Log migration completion
SELECT 'Migration 014 completed: Added billing_run_id column to performance_fees' AS message;
