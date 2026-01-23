-- Migration: Remove unique constraint on user_id in bot_instances
-- Purpose: Allow admins to create multiple bots for testing (paper trading, dry runs)
-- Note: Application logic still enforces one-bot-per-user for regular users

-- Drop the unique constraint
ALTER TABLE bot_instances DROP CONSTRAINT IF EXISTS bot_instances_user_id_key;

-- Add an index on user_id for lookups (but not unique)
-- If the index already exists from the initial schema, this will be a no-op
CREATE INDEX IF NOT EXISTS idx_bot_instances_user_id_compound ON bot_instances(user_id, status);
