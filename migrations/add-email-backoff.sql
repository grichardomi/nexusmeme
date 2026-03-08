-- Exponential backoff for email retries
-- next_retry_at: NULL = ready to process immediately, non-null = hold until this time
ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_queue_next_retry ON email_queue(next_retry_at)
  WHERE status = 'pending';

COMMENT ON COLUMN email_queue.next_retry_at IS
  'Earliest time this email may be retried. NULL = process immediately.';
