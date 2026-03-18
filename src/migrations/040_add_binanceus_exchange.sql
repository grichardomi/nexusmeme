-- Migration 040: Add Binance US as a supported exchange
-- Allows users to store separate API keys for binanceus (api.binance.us)
-- alongside existing binance (api.binance.com) keys.
--
-- No schema change needed — exchange column is VARCHAR with UNIQUE(user_id, exchange)
-- which already allows one 'binance' + one 'binanceus' key per user.
--
-- This migration adds a check constraint to enumerate valid exchange values
-- and documents the supported set.

ALTER TABLE exchange_api_keys
  ADD CONSTRAINT exchange_api_keys_exchange_valid
  CHECK (exchange IN ('binance', 'binanceus', 'kraken'));

-- Update existing bot_instances that may reference 'binance' to remain valid.
-- No data change needed — 'binance' is still a valid value.

COMMENT ON COLUMN exchange_api_keys.exchange IS
  'Exchange identifier: binance (global, api.binance.com), binanceus (US, api.binance.us), kraken';
