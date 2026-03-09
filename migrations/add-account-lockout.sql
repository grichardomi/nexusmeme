-- Account lockout tracking: prevent brute-force attacks on credentials login.
-- failed_login_attempts resets to 0 on successful login.
-- locked_until is set to NOW() + 15min after 10 consecutive failures.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
