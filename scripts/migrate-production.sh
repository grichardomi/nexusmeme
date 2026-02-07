#!/bin/bash
# Run migration on production database
# Usage: ./scripts/migrate-production.sh

set -e  # Exit on error

echo "🚀 Running migration on PRODUCTION database..."
echo ""
echo "Database: switchback.proxy.rlwy.net:33688/railway"
echo ""

# Use external proxy URL for local access
export PGPASSWORD="bdgrRCOsVCMQVpUEZUXyPUrXpSJLtbHc"

psql "postgresql://postgres:bdgrRCOsVCMQVpUEZUXyPUrXpSJLtbHc@switchback.proxy.rlwy.net:33688/railway" \
  -f migrations/add-entry-price-quantity-to-trades.sql

echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "Next steps:"
echo "1. Restart your production server: pnpm dev"
echo "2. New trades will have entry_price and quantity"
echo "3. Open trades will now track peaks correctly"
echo ""
