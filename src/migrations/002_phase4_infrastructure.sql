-- Phase 4: Backend Infrastructure
-- Adds authentication, rate limiting, and job queue tables

-- OAuth Account Links
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR NOT NULL,
  provider_account_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider);

-- Email Verification Tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Rate Limiting
-- Stores sliding window counter for rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_key_created_at ON rate_limits(key, created_at);

-- Job Queue Enhancement (table exists from initial schema)
-- Add missing columns for enhanced job queue functionality
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS priority INT DEFAULT 5;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP;
ALTER TABLE job_queue RENAME COLUMN payload TO data;
ALTER TABLE job_queue RENAME COLUMN error_message TO error;

-- Update id column to VARCHAR instead of UUID
-- Note: This is handled by application logic, column remains VARCHAR compatible

-- Add enhanced indexes
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority_created
  ON job_queue(status, priority DESC, created_at ASC);

-- Add email_verified column to users table if not exists
-- (It exists as email_verified_at, but we'll add a boolean for easier checking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Update trigger for users.updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- Cleanup function for expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM email_verification_tokens WHERE expires_at < NOW();
  DELETE FROM password_reset_tokens WHERE expires_at < NOW() AND used_at IS NULL;
  DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (manually via cron or job queue)
-- Call cleanup_expired_tokens() periodically to remove expired entries
