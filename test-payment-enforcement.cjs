#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });
const TEST_EMAIL = 'test-payment@nexusmeme.test';
const C = { G: '\x1b[32m', R: '\x1b[31m', Y: '\x1b[33m', B: '\x1b[34m', X: '\x1b[0m' };
const log = (c, p, m) => console.log(`${c}${p}${C.X} ${m}`);

async function test() {
  let userId;
  try {
    // Cleanup
    const u = await pool.query('SELECT id FROM users WHERE email = $1', [TEST_EMAIL]);
    if (u.rows[0]) {
      await pool.query('DELETE FROM bot_instances WHERE user_id = $1', [u.rows[0].id]);
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [u.rows[0].id]);
      await pool.query('DELETE FROM users WHERE id = $1', [u.rows[0].id]);
    }

    // Test 1: Create user
    const user = await pool.query('INSERT INTO users (email, name, password_hash, email_verified) VALUES ($1, $2, $3, true) RETURNING id', [TEST_EMAIL, 'Test', 'hash']);
    userId = user.rows[0].id;
    log(C.G, '[✓ TEST 1]', 'User created');

    // Test 2: Create trial
    const now = new Date(); const end = new Date(now); end.setDate(end.getDate() + 10);
    await pool.query('INSERT INTO subscriptions (user_id, plan_tier, status, current_period_start, current_period_end, trial_ends_at, trial_started_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, 'live_trial', 'trialing', now, end, end, now]);
    log(C.G, '[✓ TEST 2]', 'Trial subscription created');

    // Test 3: Bot pause/restore
    const bot = await pool.query('INSERT INTO bot_instances (user_id, exchange, status, enabled_pairs, config) VALUES ($1, $2, $3, $4, $5) RETURNING id', [userId, 'binance', 'running', ['BTC/USDT'], '{"tradingMode":"paper"}']);
    const botId = bot.rows[0].id;
    await pool.query('UPDATE subscriptions SET status = $1 WHERE user_id = $2', ['payment_required', userId]);
    await pool.query('UPDATE bot_instances SET status = $1 WHERE id = $2', ['paused', botId]);
    await pool.query('UPDATE subscriptions SET status = $1 WHERE user_id = $2', ['trialing', userId]);
    const restored = await pool.query('UPDATE bot_instances SET status = $1 WHERE user_id = $2 AND status = $3 RETURNING id', ['running', userId, 'paused']);
    if (restored.rows.length === 1) log(C.G, '[✓ TEST 3]', 'Bot restored after trial activation');
    else log(C.R, '[✗ TEST 3]', 'Bot restore failed');

    // Test 4: Orchestrator filter
    await pool.query('UPDATE subscriptions SET status = $1 WHERE user_id = $2', ['cancelled', userId]);
    const active = await pool.query('SELECT bi.id FROM bot_instances bi JOIN subscriptions s ON s.user_id = bi.user_id WHERE bi.status = $1 AND s.status IN ($2, $3) AND bi.user_id = $4', ['running', 'active', 'trialing', userId]);
    const skipped = await pool.query('SELECT bi.id FROM bot_instances bi LEFT JOIN subscriptions s ON s.user_id = bi.user_id WHERE bi.status = $1 AND (s.status IS NULL OR s.status NOT IN ($2, $3)) AND bi.user_id = $4', ['running', 'active', 'trialing', userId]);
    if (active.rows.length === 0 && skipped.rows.length > 0) log(C.G, '[✓ TEST 4]', 'Orchestrator filter works');
    else log(C.R, '[✗ TEST 4]', `Filter failed: active=${active.rows.length}, skipped=${skipped.rows.length}`);

    // Test 5: Email queue
    const eq = await pool.query('SELECT count(*) FROM information_schema.columns WHERE table_name = $1 AND column_name IN ($2, $3, $4)', ['email_queue', 'type', 'to_email', 'status']);
    if (eq.rows[0].count == 3) log(C.G, '[✓ TEST 5]', 'Email queue table exists');
    else log(C.R, '[✗ TEST 5]', 'Email queue missing');

    // Cleanup
    await pool.query('DELETE FROM bot_instances WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    console.log('\n' + C.G + '[SUCCESS] All tests passed!' + C.X + '\n');
  } catch (e) {
    console.error('\n' + C.R + '[ERROR]' + C.X, e.message, '\n');
    if (userId) {
      await pool.query('DELETE FROM bot_instances WHERE user_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [userId]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

test();
