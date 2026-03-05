-- Billing settings key/value store
CREATE TABLE IF NOT EXISTS billing_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO billing_settings (key, value) VALUES ('performance_fee_rate', '0.05') ON CONFLICT DO NOTHING;

-- Per-user fee rate overrides
CREATE TABLE IF NOT EXISTS user_billing_overrides (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fee_rate DECIMAL(5,4) NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Lemon Squeezy orders
CREATE TABLE IF NOT EXISTS ls_orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ls_checkout_id VARCHAR(100),
  ls_order_id VARCHAR(100),
  amount_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  checkout_url TEXT,
  receipt_url TEXT,
  fee_ids TEXT, -- comma-separated performance_fee IDs
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add ls_order_id to performance_fees if not exists
ALTER TABLE performance_fees ADD COLUMN IF NOT EXISTS ls_order_id VARCHAR(100);
ALTER TABLE performance_fees ADD COLUMN IF NOT EXISTS fee_rate_applied DECIMAL(5,4);

-- Fee adjustments audit log (idempotent - may already exist from coinbase migration)
CREATE TABLE IF NOT EXISTS fee_adjustments_audit (
  id SERIAL PRIMARY KEY,
  admin_user_id UUID REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  change_type VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
