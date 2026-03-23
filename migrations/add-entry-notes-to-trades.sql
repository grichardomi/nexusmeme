-- Add entry_notes JSONB column to trades for audit trail
-- Stores: adx, momentum1h, momentum4h, confidence, regime, entryPath, volumeRatio
-- Purpose: permanent record of why a trade was entered (survives server restarts)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_notes jsonb;
