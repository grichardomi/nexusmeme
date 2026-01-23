-- Add preferences JSONB column to users table for storing user settings
ALTER TABLE users
ADD COLUMN preferences JSONB DEFAULT '{}';

-- Create trigger for updated_at on users if not already present
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
