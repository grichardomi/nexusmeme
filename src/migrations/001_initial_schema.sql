-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Core User Management
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR,
  password_hash VARCHAR,
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Authentication & Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Exchange API Keys (Encrypted)
CREATE TABLE IF NOT EXISTS exchange_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange VARCHAR NOT NULL,
  encrypted_public_key VARCHAR NOT NULL,
  encrypted_secret_key VARCHAR NOT NULL,
  validated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, exchange)
);

CREATE INDEX idx_exchange_api_keys_user_id ON exchange_api_keys(user_id);

-- Bot Instances (User's Trading Bot - One per user)
CREATE TABLE IF NOT EXISTS bot_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  exchange VARCHAR NOT NULL,
  trading_pairs TEXT[] NOT NULL DEFAULT '{}',
  enabled_pairs TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR DEFAULT 'stopped',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bot_instances_user_id ON bot_instances(user_id);
CREATE INDEX idx_bot_instances_status ON bot_instances(status);

-- Trade History (UNLOGGED for high volume)
CREATE UNLOGGED TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_instance_id UUID NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  pair VARCHAR NOT NULL,
  side VARCHAR NOT NULL,
  amount DECIMAL NOT NULL,
  price DECIMAL NOT NULL,
  fee DECIMAL,
  status VARCHAR DEFAULT 'open',
  entry_time TIMESTAMP NOT NULL,
  exit_time TIMESTAMP,
  profit_loss DECIMAL,
  profit_loss_percent DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trades_bot_id_created ON trades(bot_instance_id, created_at DESC);
CREATE INDEX idx_trades_pair ON trades(pair);
CREATE INDEX idx_trades_status ON trades(status);

-- Market Data Cache (UNLOGGED, ephemeral)
CREATE UNLOGGED TABLE IF NOT EXISTS market_data_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pair VARCHAR NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  price DECIMAL NOT NULL,
  volume DECIMAL,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pair, timestamp)
);

CREATE INDEX idx_market_data_pair_time ON market_data_cache(pair, timestamp DESC);

-- Market Regime (Current market state)
CREATE TABLE IF NOT EXISTS market_regime (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMP NOT NULL,
  regime VARCHAR,
  confidence DECIMAL,
  reason VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_market_regime_created ON market_regime(created_at DESC);

-- Billing & Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR UNIQUE,
  plan_tier VARCHAR DEFAULT 'free',
  status VARCHAR DEFAULT 'active',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- Email Log (UNLOGGED, high volume, low durability)
CREATE UNLOGGED TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type VARCHAR NOT NULL,
  recipient VARCHAR NOT NULL,
  subject VARCHAR,
  status VARCHAR DEFAULT 'sent',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_log_user_id ON email_log(user_id, created_at DESC);
CREATE INDEX idx_email_log_type ON email_log(email_type, created_at DESC);

-- Job Queue (mgpg)
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR DEFAULT 'pending',
  retries INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_type ON job_queue(type);
CREATE INDEX idx_job_queue_created ON job_queue(created_at DESC);

-- User Email Preferences
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  trade_alerts BOOLEAN DEFAULT true,
  trade_alerts_losses_only BOOLEAN DEFAULT false,
  billing_notifications BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_preferences_user_id ON email_preferences(user_id);

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_instances_updated_at BEFORE UPDATE ON bot_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exchange_api_keys_updated_at BEFORE UPDATE ON exchange_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_preferences_updated_at BEFORE UPDATE ON email_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Log table for tracking applied migrations
CREATE TABLE IF NOT EXISTS migrations_applied (
  id INT PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT NOW()
);
