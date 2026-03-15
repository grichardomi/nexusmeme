-- Migration 035: Add per-exchange trading fee rates to billing_settings
-- Allows admin to update negotiated exchange fees without a code deploy.
-- Falls back to env vars (BINANCE_TAKER_FEE_DEFAULT, KRAKEN_TAKER_FEE_DEFAULT) if missing.
-- Also adds per-exchange minimum profit targets to compensate for fee differences.

INSERT INTO billing_settings (key, value, updated_at) VALUES
  -- Binance International fee rates (0.10% standard, negotiable)
  ('binance_taker_fee',          '0.001',  NOW()),
  ('binance_maker_fee',          '0.001',  NOW()),

  -- Kraken fee rates (0.26% taker standard, negotiable)
  ('kraken_taker_fee',           '0.0026', NOW()),
  ('kraken_maker_fee',           '0.0016', NOW()),

  -- Minimum profit targets per exchange per regime (to ensure fees are covered)
  -- Binance: 0.20% round-trip cost → 2% weak target is comfortable
  ('binance_min_profit_weak',     '0.02',  NOW()),
  ('binance_min_profit_moderate', '0.05',  NOW()),
  ('binance_min_profit_strong',   '0.12',  NOW()),

  -- Kraken: 0.52% round-trip cost → needs higher weak target
  ('kraken_min_profit_weak',      '0.025', NOW()),
  ('kraken_min_profit_moderate',  '0.05',  NOW()),
  ('kraken_min_profit_strong',    '0.12',  NOW())

ON CONFLICT (key) DO NOTHING;
