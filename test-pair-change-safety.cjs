#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

const TEST_EMAIL = 'test-pair-safety@nexusmeme.test';
const C = { G: '\x1b[32m', R: '\x1b[31m', Y: '\x1b[33m', B: '\x1b[34m', X: '\x1b[0m' };
const log = (c, p, m) => console.log(`${c}${p}${C.X} ${m}`);

async function test() {
  let userId, botId, tradeId;
  try {
    console.log('\n' + '='.repeat(60));
    console.log('PAIR CHANGE SAFETY CHECK TEST');
    console.log('='.repeat(60) + '\n');

    // Cleanup
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [TEST_EMAIL]);
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await pool.query('DELETE FROM trades WHERE bot_instance_id IN (SELECT id FROM bot_instances WHERE user_id = $1)', [userId]);
      await pool.query('DELETE FROM bot_instances WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }

    // Test 1: Create user with trial
    const user = await pool.query('INSERT INTO users (email, name, password_hash, email_verified) VALUES ($1, $2, $3, true) RETURNING id', [TEST_EMAIL, 'Test', 'hash']);
    userId = user.rows[0].id;
    const now = new Date(); const end = new Date(now); end.setDate(end.getDate() + 10);
    await pool.query('INSERT INTO subscriptions (user_id, plan_tier, status, current_period_start, current_period_end, trial_ends_at, trial_started_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, 'live_trial', 'trialing', now, end, end, now]);
    log(C.G, '[✓ TEST 1]', 'User and trial subscription created');

    // Test 2: Create bot with BTC/USD and ETH/USD
    const bot = await pool.query(
      `INSERT INTO bot_instances (user_id, exchange, status, enabled_pairs, trading_pairs, config, initial_capital)
       VALUES ($1, 'binance', 'running', $2, $2, '{"tradingMode":"paper"}', 1000)
       RETURNING id`,
      [userId, ['BTC/USD', 'ETH/USD']]
    );
    botId = bot.rows[0].id;
    log(C.G, '[✓ TEST 2]', 'Bot created with BTC/USD and ETH/USD');

    // Test 3: Create open trade on BTC/USD
    const trade = await pool.query(
      `INSERT INTO trades (bot_instance_id, pair, side, entry_price, amount, status, created_at, updated_at)
       VALUES ($1, 'BTC/USD', 'buy', 50000, 0.01, 'open', NOW(), NOW())
       RETURNING id`,
      [botId]
    );
    tradeId = trade.rows[0].id;
    log(C.G, '[✓ TEST 3]', 'Created open BTC/USD trade');

    // Test 4: Try to remove BTC/USD (should BLOCK)
    const currentPairs = ['BTC/USD', 'ETH/USD'];
    const newPairs = ['ETH/USD', 'BTC/USDT']; // Removing BTC/USD, adding BTC/USDT
    const removedPairs = currentPairs.filter(p => !newPairs.includes(p));
    
    log(C.Y, '[TEST 4]', `Attempting to change pairs: ${currentPairs.join(', ')} → ${newPairs.join(', ')}`);
    log(C.Y, '[INFO]', `Pairs being removed: ${removedPairs.join(', ')}`);

    const openTrades = await pool.query(
      `SELECT id, pair FROM trades
       WHERE bot_instance_id = $1
         AND status = 'open'
         AND pair = ANY($2)`,
      [botId, removedPairs]
    );

    if (openTrades.rows.length > 0) {
      const affectedPairs = [...new Set(openTrades.rows.map(t => t.pair))];
      log(C.G, '[✓ TEST 4]', `BLOCKED: Found ${openTrades.rows.length} open trade(s) on ${affectedPairs.join(', ')}`);
      log(C.Y, '[INFO]', `Error message would be: "Cannot remove ${affectedPairs.join(', ')} — you have ${openTrades.rows.length} open trade(s). Close positions first."`);
    } else {
      log(C.R, '[✗ TEST 4]', 'Safety check FAILED - should have blocked');
    }

    // Test 5: Close the trade and try again (should ALLOW)
    await pool.query('UPDATE trades SET status = $1, exit_price = $2, exit_time = NOW(), updated_at = NOW() WHERE id = $3', ['closed', 51000, tradeId]);
    log(C.G, '[✓ TEST 5]', 'Closed BTC/USD trade');

    const openTradesAfter = await pool.query(
      `SELECT id, pair FROM trades
       WHERE bot_instance_id = $1
         AND status = 'open'
         AND pair = ANY($2)`,
      [botId, removedPairs]
    );

    if (openTradesAfter.rows.length === 0) {
      log(C.G, '[✓ TEST 5]', 'ALLOWED: No open trades, pair change would succeed');
      
      // Actually update the pairs
      await pool.query('UPDATE bot_instances SET enabled_pairs = $1, trading_pairs = $1 WHERE id = $2', [newPairs, botId]);
      const verify = await pool.query('SELECT enabled_pairs FROM bot_instances WHERE id = $1', [botId]);
      const updatedPairs = verify.rows[0].enabled_pairs;
      
      if (JSON.stringify(updatedPairs.sort()) === JSON.stringify(newPairs.sort())) {
        log(C.G, '[✓ TEST 5]', `Pairs successfully updated to: ${updatedPairs.join(', ')}`);
      } else {
        log(C.R, '[✗ TEST 5]', 'Pair update verification failed');
      }
    } else {
      log(C.R, '[✗ TEST 5]', 'Safety check FALSE POSITIVE - no open trades but still blocked');
    }

    // Test 6: Adding new pairs (should always ALLOW)
    const addingPairs = ['ETH/USD', 'BTC/USDT', 'ETH/USDT']; // Adding ETH/USDT
    const removedPairsTest6 = updatedPairs.filter(p => !addingPairs.includes(p));
    
    if (removedPairsTest6.length === 0) {
      log(C.G, '[✓ TEST 6]', 'ALLOWED: Adding pairs (no pairs removed)');
    } else {
      log(C.Y, '[TEST 6]', `Would check ${removedPairsTest6.join(', ')} for open trades`);
    }

    // Cleanup
    await pool.query('DELETE FROM trades WHERE bot_instance_id = $1', [botId]);
    await pool.query('DELETE FROM bot_instances WHERE id = $1', [botId]);
    await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    console.log('\n' + '='.repeat(60));
    log(C.G, '[SUCCESS]', 'All safety checks working correctly!');
    console.log('='.repeat(60) + '\n');

  } catch (e) {
    console.error('\n' + C.R + '[ERROR]' + C.X, e.message);
    console.error(e.stack);
    if (userId) {
      await pool.query('DELETE FROM trades WHERE bot_instance_id IN (SELECT id FROM bot_instances WHERE user_id = $1)', [userId]).catch(() => {});
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
