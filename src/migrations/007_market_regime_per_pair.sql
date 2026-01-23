-- Migration 007: Add Per-Pair Market Regime Tracking
-- Purpose: Enable regime detection per trading pair (not global)
-- Before: market_regime was global (one regime for all pairs)
-- After: market_regime tracks per pair + global fallback

-- Add pair column to market_regime
ALTER TABLE market_regime ADD COLUMN IF NOT EXISTS pair VARCHAR;

-- Create index for efficient per-pair regime lookup
CREATE INDEX IF NOT EXISTS idx_market_regime_pair_time ON market_regime(pair, created_at DESC);

-- Create index for global regime lookup (NULL pair = global regime)
CREATE INDEX IF NOT EXISTS idx_market_regime_global ON market_regime(created_at DESC) WHERE pair IS NULL;

-- Add unique constraint to prevent duplicate pair regimes at same time
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_regime_unique_pair ON market_regime(pair, timestamp)
WHERE pair IS NOT NULL;

-- Track migration
INSERT INTO migrations_applied (id, name) VALUES (7, '007_market_regime_per_pair')
ON CONFLICT DO NOTHING;
