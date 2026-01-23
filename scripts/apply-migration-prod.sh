#!/bin/bash

# Migration Script: Remove bot_instances unique constraint
# Allows admins to create multiple bots for testing
# Apply to: Local + Production (Railway) databases

set -e

MIGRATION_NAME="018_remove_bot_unique_per_user_constraint"
MIGRATION_SQL="src/migrations/$MIGRATION_NAME.sql"

# Migration SQL
MIGRATION_CONTENT="
-- Drop the unique constraint on user_id
ALTER TABLE bot_instances DROP CONSTRAINT IF EXISTS bot_instances_user_id_key;

-- Add compound index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_bot_instances_user_id_compound ON bot_instances(user_id, status);
"

echo "=========================================="
echo "Database Migration: $MIGRATION_NAME"
echo "=========================================="

# Check if migration SQL file exists
if [ ! -f "$MIGRATION_SQL" ]; then
  echo "❌ Migration file not found: $MIGRATION_SQL"
  exit 1
fi

echo "✓ Migration file found"

# Apply to LOCAL database
if [ ! -z "$DATABASE_URL" ]; then
  echo ""
  echo "📍 Applying to LOCAL database..."
  psql "$DATABASE_URL" -f "$MIGRATION_SQL" 2>&1 | tee /tmp/local_migration.log

  if [ $? -eq 0 ]; then
    echo "✅ LOCAL database migration successful"
  else
    echo "❌ LOCAL database migration failed"
    exit 1
  fi
fi

# Apply to PRODUCTION database (Railway)
if [ ! -z "$DATABASE_PUBLIC_URL" ]; then
  echo ""
  echo "📍 Applying to PRODUCTION database (Railway)..."
  psql "$DATABASE_PUBLIC_URL" -f "$MIGRATION_SQL" 2>&1 | tee /tmp/prod_migration.log

  if [ $? -eq 0 ]; then
    echo "✅ PRODUCTION database migration successful"
  else
    echo "❌ PRODUCTION database migration failed"
    exit 1
  fi
elif [ ! -z "$DATABASE_URL_RAILWAY" ]; then
  # Fallback to internal Railway connection
  echo ""
  echo "📍 Applying to PRODUCTION database (Railway - internal)..."
  psql "$DATABASE_URL_RAILWAY" -f "$MIGRATION_SQL" 2>&1 | tee /tmp/prod_migration.log

  if [ $? -eq 0 ]; then
    echo "✅ PRODUCTION database migration successful"
  else
    echo "❌ PRODUCTION database migration failed"
    exit 1
  fi
fi

echo ""
echo "=========================================="
echo "✅ All migrations applied successfully!"
echo "=========================================="
echo ""
echo "Changes made:"
echo "  • Removed UNIQUE constraint on bot_instances.user_id"
echo "  • Added compound index on (user_id, status)"
echo "  • Admins can now create multiple bots for testing"
echo ""
echo "Regular users: Still limited to 1 bot (enforced in application)"
echo "Admins: Can create multiple bots (for paper trading, dry runs, etc.)"
