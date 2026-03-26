-- Add flat_fee_usdc to billing_settings
-- Default 0 = disabled. Admin sets the amount via /admin/fees.
INSERT INTO billing_settings (key, value, updated_at)
VALUES ('flat_fee_usdc', '0', NOW())
ON CONFLICT (key) DO NOTHING;
