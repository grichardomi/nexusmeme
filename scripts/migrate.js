#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local if not already set
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  .env.local file not found at ${filePath}`);
    return;
  }

  const envFile = fs.readFileSync(filePath, 'utf-8');
  const lines = envFile.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '../.env.local'));

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

async function runMigrations() {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  try {
    console.log('🔄 Starting migrations...\n');

    // Create migrations table if doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations_applied (
        id INT PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Read migration files
    const migrationsDir = path.join(__dirname, '../src/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('✓ No migrations to run');
      return;
    }

    // Get applied migrations
    const result = await pool.query('SELECT name FROM migrations_applied');
    const applied = new Set(result.rows.map(r => r.name));

    let ran = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`✓ Already applied: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`▶ Running: ${file}`);

      try {
        await pool.query(sql);
        const migrationId = applied.size + ran + 1;
        await pool.query(
          'INSERT INTO migrations_applied (id, name) VALUES ($1, $2)',
          [migrationId, file]
        );
        console.log(`✓ Completed: ${file}\n`);
        ran++;
      } catch (err) {
        console.error(`✗ Failed: ${file}`);
        throw err;
      }
    }

    if (ran === 0) {
      console.log('\n✓ All migrations already applied');
    } else {
      console.log(`\n✓ Ran ${ran} migration(s)`);
    }
  } catch (err) {
    console.error('✗ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
