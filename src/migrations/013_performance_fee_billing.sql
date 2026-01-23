-- Performance Fee Billing System with Stripe Integration
-- Migration: 013_performance_fee_billing

-- Performance fees ledger: tracks all fees from profitable trades
CREATE TABLE IF NOT EXISTS performance_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id VARCHAR NOT NULL,
  bot_instance_id UUID NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,

  -- Profit & fee amounts
  profit_amount DECIMAL(18, 8) NOT NULL,
  fee_rate DECIMAL(3, 2) DEFAULT 0.05,
  fee_amount DECIMAL(18, 8) NOT NULL,

  -- Edge case: P&L correction
  original_fee_amount DECIMAL(18, 8),
  adjustment_reason VARCHAR,
  adjusted_by_admin UUID REFERENCES users(id) ON DELETE SET NULL,
  adjusted_at TIMESTAMP,

  -- Billing status
  status VARCHAR DEFAULT 'pending_billing' CHECK (
    status IN ('pending_billing', 'billed', 'paid', 'refunded', 'waived', 'disputed')
  ),

  -- Link to Stripe invoice
  stripe_invoice_id VARCHAR,
  stripe_line_item_id VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),
  billed_at TIMESTAMP,
  paid_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_fees_user_status
  ON performance_fees(user_id, status);
CREATE INDEX IF NOT EXISTS idx_performance_fees_stripe_invoice
  ON performance_fees(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_performance_fees_trade_id
  ON performance_fees(trade_id);

-- User Stripe billing config
CREATE TABLE IF NOT EXISTS user_stripe_billing (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR NOT NULL UNIQUE,
  stripe_payment_method_id VARCHAR,

  billing_status VARCHAR DEFAULT 'active' CHECK (
    billing_status IN ('active', 'past_due', 'suspended', 'cancelled')
  ),

  pause_trading_on_failed_charge BOOLEAN DEFAULT FALSE,
  dunning_email_count INT DEFAULT 0,
  last_dunning_email_sent_at TIMESTAMP,

  failed_charge_attempts INT DEFAULT 0,
  last_failed_charge_date TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stripe_billing_customer
  ON user_stripe_billing(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_stripe_billing_status
  ON user_stripe_billing(billing_status);

-- Monthly billing runs: audit trail of billing cycles
CREATE TABLE IF NOT EXISTS billing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  total_users_billed INT DEFAULT 0,
  total_fees_amount DECIMAL(18, 8) DEFAULT 0,
  total_fees_count INT DEFAULT 0,

  status VARCHAR DEFAULT 'processing' CHECK (
    status IN ('processing', 'completed', 'failed', 'rolled_back')
  ),

  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_runs_period
  ON billing_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_billing_runs_status
  ON billing_runs(status);

-- Charge history: detailed audit trail of each charge attempt
CREATE TABLE IF NOT EXISTS fee_charge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  billing_period_start DATE,
  billing_period_end DATE,

  total_fees_amount DECIMAL(18, 8) NOT NULL,
  total_fees_count INT NOT NULL,

  stripe_invoice_id VARCHAR,
  stripe_charge_id VARCHAR,

  status VARCHAR CHECK (
    status IN ('pending', 'succeeded', 'failed', 'refunded')
  ),
  failure_reason VARCHAR,

  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP,

  paid_at TIMESTAMP,
  refunded_at TIMESTAMP,
  refund_amount DECIMAL(18, 8),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_charge_history_user_status
  ON fee_charge_history(user_id, status);
CREATE INDEX IF NOT EXISTS idx_fee_charge_history_invoice
  ON fee_charge_history(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fee_charge_history_period
  ON fee_charge_history(billing_period_start, billing_period_end);

-- Admin audit trail: track all fee adjustments
CREATE TABLE IF NOT EXISTS fee_adjustments_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  affected_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  action VARCHAR NOT NULL CHECK (
    action IN ('adjusted', 'waived', 'refunded', 'disputed_resolved')
  ),
  affected_fee_ids UUID[] NOT NULL,

  reason TEXT NOT NULL,
  original_amount DECIMAL(18, 8),
  adjusted_amount DECIMAL(18, 8),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_adjustments_audit_admin
  ON fee_adjustments_audit(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_audit_user
  ON fee_adjustments_audit(affected_user_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_audit_action
  ON fee_adjustments_audit(action);

-- Bot suspension log: tracks when bots are suspended/resumed due to payment failures
CREATE TABLE IF NOT EXISTS bot_suspension_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_instance_id UUID NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR NOT NULL, -- 'payment_failure', 'manual_admin', 'user_request'
  suspended_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMP,
  UNIQUE(bot_instance_id, suspended_at)
);

CREATE INDEX IF NOT EXISTS idx_bot_suspension_log_user_suspended
  ON bot_suspension_log(user_id, suspended_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_suspension_log_bot_active
  ON bot_suspension_log(bot_instance_id, suspended_at DESC)
  WHERE resumed_at IS NULL;

-- Update email_queue type constraint to include billing-related emails
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_type_check;

ALTER TABLE email_queue ADD CONSTRAINT email_queue_type_check
  CHECK (type IN (
    'welcome',
    'email_verification',
    'password_reset',
    'subscription_created',
    'subscription_upgraded',
    'subscription_cancelled',
    'trial_ending',
    'invoice_created',
    'bot_created',
    'trade_alert',
    'account_settings_changed',
    'ticket_created',
    'ticket_replied',
    'ticket_resolved',
    'new_ticket_admin',
    'performance_fee_charged',
    'performance_fee_failed',
    'performance_fee_dunning',
    'performance_fee_adjustment',
    'performance_fee_refund',
    'bot_suspended_payment_failure',
    'bot_resumed'
  ));
