-- Record platform flat fee snapshot on each invoice row.
--
-- Previously, flat_fee_usdc was folded into amount_usd with no separate column,
-- so the amount owed at invoice time was lost after expiry.
-- During reinstatement we need to know the exact platform fee that was unpaid —
-- not the current admin-configured fee, which may have changed.
--
-- fee_charge_history gets the same column for consistent record-keeping.

ALTER TABLE usdc_payment_references
  ADD COLUMN IF NOT EXISTS flat_fee_usdc NUMERIC(10, 6) NOT NULL DEFAULT 0;

ALTER TABLE fee_charge_history
  ADD COLUMN IF NOT EXISTS flat_fee_usdc NUMERIC(10, 6) NOT NULL DEFAULT 0;
