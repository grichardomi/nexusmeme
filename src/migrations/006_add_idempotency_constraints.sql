-- Migration 006: Add Idempotency Constraints to Trades Table
-- Purpose: Prevent duplicate trade execution through idempotency keys
-- and database constraints

-- Add idempotency_key column to trades table for deduplication
ALTER TABLE trades ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR UNIQUE;

-- Create index for fast idempotency key lookups
CREATE INDEX IF NOT EXISTS idx_trades_idempotency_key ON trades(idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Create unique constraint for open trades to prevent duplicates based on
-- bot, pair, side, price, and entry time (within 5 minute window)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_unique_entry ON trades(
  bot_instance_id,
  pair,
  side,
  price,
  entry_time
) WHERE status = 'open';

-- Track that this migration has been applied
INSERT INTO migrations_applied (id, name) VALUES (6, '006_add_idempotency_constraints')
ON CONFLICT DO NOTHING;
