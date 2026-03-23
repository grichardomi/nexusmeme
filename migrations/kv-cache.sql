-- PG-backed key-value cache (replaces Upstash Redis)
-- Supports TTL-based expiry, atomic increments, and multi-get

CREATE TABLE IF NOT EXISTS kv_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS kv_cache_expires_at_idx ON kv_cache (expires_at);
