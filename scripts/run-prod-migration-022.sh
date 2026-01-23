#!/bin/bash

# Migration 022: Add pyramid_levels tracking to trades
# Safely applies to production Railway database
# This adds support for multi-level pyramiding without breaking existing trades

set -e

MIGRATION_FILE="src/migrations/022_add_pyramid_levels_tracking.sql"

echo "=========================================="
echo "Database Migration 022: Pyramid Tracking"
echo "=========================================="
echo ""

# Verify migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "✓ Migration file found"
echo ""

# Apply to PRODUCTION database (Railway)
if [ ! -z "$DATABASE_PUBLIC_URL" ]; then
  echo "📍 Applying to PRODUCTION (Railway public URL)..."
  echo ""
  psql "$DATABASE_PUBLIC_URL" -f "$MIGRATION_FILE"

  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ PRODUCTION migration successful!"
    echo ""
    echo "Changes applied:"
    echo "  • Added pyramid_levels JSONB column to trades table"
    echo "  • Existing trades: pyramid_levels defaults to []"
    echo "  • New trades: ready to receive pyramid level tracking"
    echo "  • Added index for efficient pyramid queries"
    echo ""
    exit 0
  else
    echo "❌ PRODUCTION migration failed"
    exit 1
  fi
elif [ ! -z "$DATABASE_URL" ]; then
  echo "📍 Applying to PRODUCTION (Railway internal URL)..."
  echo ""
  psql "$DATABASE_URL" -f "$MIGRATION_FILE"

  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ PRODUCTION migration successful!"
    echo ""
    echo "Changes applied:"
    echo "  • Added pyramid_levels JSONB column to trades table"
    echo "  • Existing trades: pyramid_levels defaults to []"
    echo "  • New trades: ready to receive pyramid level tracking"
    echo "  • Added index for efficient pyramid queries"
    echo ""
    exit 0
  else
    echo "❌ PRODUCTION migration failed"
    exit 1
  fi
else
  echo "❌ Neither DATABASE_PUBLIC_URL nor DATABASE_URL is set"
  echo ""
  echo "Please set your production database URL:"
  echo "  export DATABASE_PUBLIC_URL='postgresql://...'"
  echo ""
  exit 1
fi
