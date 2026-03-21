-- Admin error deduplication log
-- Tracks sent admin alert emails to prevent spam (15-min rate limit per error type)

CREATE TABLE IF NOT EXISTS admin_error_log (
  dedup_key   TEXT PRIMARY KEY,
  status_code TEXT NOT NULL,
  path        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_error_log_sent_at ON admin_error_log (sent_at);
