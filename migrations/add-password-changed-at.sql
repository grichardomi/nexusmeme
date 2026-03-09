-- Add password_changed_at to users for session invalidation after password reset.
-- Existing users get NULL (no restriction); future password resets will stamp this column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
