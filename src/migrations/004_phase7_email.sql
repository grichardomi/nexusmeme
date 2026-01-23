-- Phase 7: Email System Schema
-- Creates tables for email queue and delivery tracking

-- Function to create email preferences when user is created
CREATE OR REPLACE FUNCTION create_user_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Email Queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (
    type IN (
      'welcome',
      'email_verification',
      'password_reset',
      'subscription_created',
      'subscription_upgraded',
      'subscription_cancelled',
      'invoice_created',
      'bot_created',
      'trade_alert',
      'account_settings_changed'
    )
  ),
  to_email VARCHAR(255) NOT NULL,
  context JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  retries INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error TEXT
);

-- Email Preferences table
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  marketing_emails BOOLEAN NOT NULL DEFAULT TRUE,
  transaction_emails BOOLEAN NOT NULL DEFAULT TRUE,
  trade_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_summary BOOLEAN NOT NULL DEFAULT TRUE,
  bot_status_updates BOOLEAN NOT NULL DEFAULT TRUE,
  billing_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Email Log table (for analytics and audit)
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_queue_id UUID REFERENCES email_queue(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  resend_message_id VARCHAR(255),
  opened BOOLEAN DEFAULT FALSE,
  clicked BOOLEAN DEFAULT FALSE,
  bounced BOOLEAN DEFAULT FALSE,
  complained BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Email Unsubscribe table
CREATE TABLE IF NOT EXISTS email_unsubscribe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_to_email ON email_queue(to_email);
CREATE INDEX IF NOT EXISTS idx_email_queue_type ON email_queue(type);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);

CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id ON email_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_email ON email_unsubscribe(email);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_user_id ON email_unsubscribe(user_id);

-- Update email_preferences when users table is updated
DROP TRIGGER IF EXISTS create_email_preferences ON users;
CREATE TRIGGER create_email_preferences
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_email_preferences();
