/**
 * Seed E2E test users into the development (ballast) database.
 * Safe to run multiple times — uses INSERT ... ON CONFLICT DO UPDATE.
 *
 * Usage: node scripts/seed-e2e-users.js
 *
 * NEVER run against production (switchback). This script reads
 * DATABASE_PUBLIC_URL from .env.local which points to ballast.
 */
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

config({ path: '.env.local' });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC_URL,
});

const USERS = [
  {
    email: process.env.E2E_TEST_EMAIL || 'e2e-test@nexusmeme.com',
    password: process.env.E2E_TEST_PASSWORD || 'E2eTestPass123!',
    name: 'E2E Test User',
    role: 'user',
  },
  {
    email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@nexusmeme.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'E2eAdminPass123!',
    name: 'E2E Admin User',
    role: 'admin',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, 12);
      await client.query(
        `INSERT INTO users (email, name, password_hash, role, email_verified, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           email_verified = true,
           email_verified_at = COALESCE(users.email_verified_at, NOW()),
           updated_at = NOW()`,
        [user.email, user.name, hash, user.role]
      );
      console.log(`✓ Seeded: ${user.email} (role: ${user.role})`);
    }
    console.log('\nE2E users ready. Run: pnpm e2e');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
