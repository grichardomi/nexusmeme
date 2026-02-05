-- Migration: Fix Paper Trading Performance Fees
-- Issue: Performance fees were incorrectly charged for paper trading bots before 2026-01-28
-- Solution: Waive all paper trading fees and prevent future billing

-- Step 1: Mark all paper trading fees as 'waived'
UPDATE performance_fees pf
SET
  status = 'waived',
  adjustment_reason = 'Paper trading fees incorrectly charged - system error before trading mode check was implemented',
  adjusted_at = NOW(),
  updated_at = NOW()
FROM bot_instances bi
WHERE pf.bot_instance_id = bi.id
  AND bi.config->>'tradingMode' = 'paper'
  AND pf.status IN ('pending_billing', 'billed')
  AND pf.created_at < '2026-01-28';

-- Step 2: Log the correction
INSERT INTO fee_adjustments_audit (
  admin_user_id,
  affected_user_id,
  action,
  affected_fee_ids,
  reason,
  original_amount,
  adjusted_amount
)
SELECT
  'system'::uuid,  -- System automated correction
  pf.user_id,
  'waived',
  ARRAY_AGG(pf.id),
  'Paper trading fees incorrectly charged - trading mode check not implemented until 2026-01-28',
  SUM(pf.fee_amount),
  0
FROM performance_fees pf
JOIN bot_instances bi ON pf.bot_instance_id = bi.id
WHERE bi.config->>'tradingMode' = 'paper'
  AND pf.status = 'waived'
  AND pf.adjusted_at > NOW() - INTERVAL '5 minutes'
GROUP BY pf.user_id;

-- Step 3: Display summary of corrected fees
SELECT
  COUNT(*) as total_fees_waived,
  COUNT(DISTINCT pf.user_id) as affected_users,
  SUM(pf.fee_amount) as total_amount_waived,
  MIN(pf.created_at) as earliest_fee,
  MAX(pf.created_at) as latest_fee
FROM performance_fees pf
JOIN bot_instances bi ON pf.bot_instance_id = bi.id
WHERE bi.config->>'tradingMode' = 'paper'
  AND pf.status = 'waived';

-- Verification: Check that no paper trading fees remain in pending_billing or billed status
SELECT
  pf.status,
  COUNT(*) as count,
  SUM(pf.fee_amount) as total_amount
FROM performance_fees pf
JOIN bot_instances bi ON pf.bot_instance_id = bi.id
WHERE bi.config->>'tradingMode' = 'paper'
GROUP BY pf.status
ORDER BY pf.status;
