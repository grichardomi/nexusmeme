#!/usr/bin/env node

/**
 * Legacy User Migration Script
 * Batch assigns starter plans to users who don't have active subscriptions
 *
 * Usage:
 *   npx ts-node scripts/migrate-legacy-users.ts [--before-date YYYY-MM-DD] [--batch-size 10]
 *
 * Examples:
 *   # Assign to all users without subscriptions
 *   npx ts-node scripts/migrate-legacy-users.ts
 *
 *   # Assign only to users created before April 1, 2024
 *   npx ts-node scripts/migrate-legacy-users.ts --before-date 2024-04-01
 *
 *   # Assign in batches of 5
 *   npx ts-node scripts/migrate-legacy-users.ts --batch-size 5
 */

import dotenv from 'dotenv';
import {
  batchAssignStarterPlansToLegacyUsers,
  findUsersWithoutSubscriptions,
} from '@/services/billing/legacy-user-onboarding';
import logger from '@/lib/logger';

// Load environment variables
dotenv.config();

// Parse CLI arguments
interface CliArgs {
  beforeDate?: Date;
  batchSize: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    batchSize: 10,
    dryRun: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--before-date' && process.argv[i + 1]) {
      const dateStr = process.argv[i + 1];
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        args.beforeDate = date;
      } else {
        console.error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD`);
        process.exit(1);
      }
      i++;
    }

    if (arg === '--batch-size' && process.argv[i + 1]) {
      const size = parseInt(process.argv[i + 1], 10);
      if (!isNaN(size) && size > 0) {
        args.batchSize = size;
      } else {
        console.error(`Invalid batch size: ${process.argv[i + 1]}`);
        process.exit(1);
      }
      i++;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Legacy User Starter Plan Migration Script              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Show configuration
  console.log('Configuration:');
  console.log(`  • Batch Size: ${args.batchSize}`);
  if (args.beforeDate) {
    console.log(`  • Users Created Before: ${args.beforeDate.toISOString().split('T')[0]}`);
  } else {
    console.log('  • Users Created Before: No filter (all users)');
  }
  console.log(`  • Dry Run: ${args.dryRun ? 'YES (no changes will be made)' : 'NO'}`);
  console.log('');

  if (args.dryRun) {
    console.log('🔍 Running in DRY RUN mode - fetching users without subscriptions...');
    console.log('');

    // Dry run: just show what would be migrated
    const users = await findUsersWithoutSubscriptions(args.beforeDate, 100);

    if (users.length === 0) {
      console.log('✅ All users already have subscriptions!');
      process.exit(0);
    }

    console.log(`Found ${users.length} users without active subscriptions:\n`);
    users.forEach((user, index) => {
      console.log(
        `  ${index + 1}. ${user.email} (ID: ${user.id}) - Created: ${user.created_at.toISOString().split('T')[0]}`
      );
    });

    console.log(`\n✅ Dry run complete. Would migrate ${users.length} users.`);
    console.log('   Run without --dry-run to execute the migration.');
    process.exit(0);
  }

  // Real migration
  console.log('🚀 Starting migration...\n');

  const startTime = Date.now();

  const summary = await batchAssignStarterPlansToLegacyUsers(args.beforeDate, args.batchSize);

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Migration Complete                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Results:');
  console.log(`  • Total Users: ${summary.total}`);
  console.log(`  • Newly Assigned: ${summary.successful}`);
  console.log(`  • Already Had Subscription: ${summary.alreadyHad}`);
  console.log(`  • Failed: ${summary.failed}`);
  console.log(`  • Time Elapsed: ${elapsedSeconds}s`);
  console.log('');

  if (summary.failed > 0) {
    console.log('Failed assignments:');
    summary.results
      .filter(r => !r.success)
      .forEach(result => {
        console.log(`  • ${result.email}: ${result.message}`);
      });
    console.log('');
  }

  console.log('✅ Migration complete!');

  process.exit(summary.failed > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  logger.error('Migration script failed', error);
  console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
