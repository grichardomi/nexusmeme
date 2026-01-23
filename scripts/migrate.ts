import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, query, closePool } from '../src/lib/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../src/migrations');

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  try {
    console.log('🔄 Starting migrations...\n');

    // Create migrations_applied table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS migrations_applied (
        id INT PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get all migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('✓ No migrations to run');
      return;
    }

    // Get already applied migrations
    const appliedMigrations = await query<{ name: string }>(
      'SELECT name FROM migrations_applied ORDER BY id'
    );
    const appliedNames = new Set(appliedMigrations.map(m => m.name));

    let migrationsRun = 0;

    // Run each migration
    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`✓ Already applied: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`▶ Running migration: ${file}`);

      try {
        // Execute the migration SQL
        await query(sql);

        // Record it as applied
        const migrationId = appliedNames.size + migrationsRun + 1;
        await query(
          'INSERT INTO migrations_applied (id, name) VALUES ($1, $2)',
          [migrationId, file]
        );

        console.log(`✓ Completed: ${file}\n`);
        migrationsRun++;
      } catch (error) {
        console.error(`✗ Failed to run migration: ${file}`);
        throw error;
      }
    }

    if (migrationsRun === 0) {
      console.log('\n✓ All migrations already applied');
    } else {
      console.log(`\n✓ Successfully ran ${migrationsRun} migration(s)`);
    }
  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error(error);
  process.exit(1);
});
