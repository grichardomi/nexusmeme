#!/usr/bin/env npx ts-node

/**
 * Check and transition expired trials
 *
 * Usage:
 *   npx ts-node scripts/check-expired-trials.ts           # Check only (dry run)
 *   npx ts-node scripts/check-expired-trials.ts --fix     # Apply fixes
 *   npx ts-node scripts/check-expired-trials.ts --email=grichardomi@gmail.com  # Check specific user
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

interface ExpiredTrial {
  id: string;
  user_id: string;
  email: string;
  name: string;
  plan_tier: string;
  status: string;
  trial_ends_at: Date;
  days_expired: number;
  has_payment_method: boolean;
  active_bots: number;
}

async function getExpiredTrials(email?: string): Promise<ExpiredTrial[]> {
  const client = await pool.connect();
  try {
    let query = `
      SELECT
        s.id,
        s.user_id,
        u.email,
        u.name,
        s.plan_tier,
        s.status,
        s.trial_ends_at,
        EXTRACT(DAY FROM NOW() - s.trial_ends_at)::int as days_expired,
        EXISTS(SELECT 1 FROM payment_methods pm WHERE pm.user_id = s.user_id AND pm.is_default = true) as has_payment_method,
        (SELECT COUNT(*) FROM bot_instances bi WHERE bi.user_id = s.user_id AND bi.status IN ('running', 'active'))::int as active_bots
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      WHERE
        s.plan_tier = 'live_trial'
        AND s.status = 'trialing'
        AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at < NOW()
    `;

    const params: string[] = [];
    if (email) {
      query += ` AND u.email = $1`;
      params.push(email);
    }

    query += ` ORDER BY s.trial_ends_at ASC`;

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getUserSubscriptionStatus(email: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        s.*,
        u.email,
        u.name,
        EXISTS(SELECT 1 FROM payment_methods pm WHERE pm.user_id = s.user_id AND pm.is_default = true) as has_payment_method,
        (SELECT COUNT(*) FROM bot_instances bi WHERE bi.user_id = s.user_id AND bi.status = 'running')::int as running_bots,
        (SELECT COUNT(*) FROM bot_instances bi WHERE bi.user_id = s.user_id AND bi.status = 'paused')::int as paused_bots
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      WHERE u.email = $1
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [email]);

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function transitionExpiredTrial(trial: ExpiredTrial, dryRun: boolean) {
  if (dryRun) {
    console.log(`  [DRY RUN] Would transition user ${trial.email}:`);
    console.log(`    - Plan: live_trial -> performance_fees`);
    console.log(`    - Status: trialing -> ${trial.has_payment_method ? 'active' : 'payment_required'}`);
    if (!trial.has_payment_method && trial.active_bots > 0) {
      console.log(`    - Would pause ${trial.active_bots} active bot(s)`);
    }
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const newStatus = trial.has_payment_method ? 'active' : 'payment_required';

    // Update subscription
    await client.query(`
      UPDATE subscriptions
      SET
        plan = 'performance_fees',
        plan_tier = 'performance_fees',
        status = $1,
        trial_ends_at = NULL,
        updated_at = NOW()
      WHERE id = $2
    `, [newStatus, trial.id]);

    // If no payment method, pause all running bots
    if (!trial.has_payment_method && trial.active_bots > 0) {
      const pauseResult = await client.query(`
        UPDATE bot_instances
        SET status = 'paused', updated_at = NOW()
        WHERE user_id = $1 AND status IN ('running', 'active')
        RETURNING id
      `, [trial.user_id]);

      // Log suspensions
      for (const bot of pauseResult.rows) {
        await client.query(`
          INSERT INTO bot_suspension_log (bot_instance_id, user_id, reason, suspended_at)
          VALUES ($1, $2, 'trial_expired_no_payment', NOW())
        `, [bot.id, trial.user_id]);
      }

      console.log(`  [FIXED] Paused ${pauseResult.rowCount} bot(s) for ${trial.email}`);
    }

    await client.query('COMMIT');
    console.log(`  [FIXED] Transitioned ${trial.email} to ${newStatus}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const emailArg = args.find(a => a.startsWith('--email='));
  const email = emailArg ? emailArg.split('=')[1] : undefined;

  console.log('\n=== Expired Trial Check ===\n');

  if (email) {
    // Check specific user
    console.log(`Checking subscription for: ${email}\n`);
    const sub = await getUserSubscriptionStatus(email);

    if (!sub) {
      console.log('User not found or has no subscription.');
      process.exit(0);
    }

    console.log('Subscription Details:');
    console.log(`  Plan: ${sub.plan_tier || sub.plan}`);
    console.log(`  Status: ${sub.status}`);
    console.log(`  Trial Ends: ${sub.trial_ends_at ? new Date(sub.trial_ends_at).toISOString() : 'N/A'}`);
    console.log(`  Has Payment Method: ${sub.has_payment_method ? 'Yes' : 'No'}`);
    console.log(`  Running Bots: ${sub.running_bots}`);
    console.log(`  Paused Bots: ${sub.paused_bots}`);

    if (sub.plan_tier === 'live_trial' && sub.trial_ends_at) {
      const trialEnd = new Date(sub.trial_ends_at);
      const now = new Date();
      if (trialEnd < now) {
        const daysExpired = Math.floor((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n  ⚠️  TRIAL EXPIRED ${daysExpired} days ago!`);

        if (fix) {
          await transitionExpiredTrial({
            id: sub.id,
            user_id: sub.user_id,
            email: sub.email,
            name: sub.name,
            plan_tier: sub.plan_tier,
            status: sub.status,
            trial_ends_at: trialEnd,
            days_expired: daysExpired,
            has_payment_method: sub.has_payment_method,
            active_bots: sub.running_bots,
          }, false);
        } else {
          console.log('  Run with --fix to transition this trial');
        }
      } else {
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n  ✓ Trial still active (${daysRemaining} days remaining)`);
      }
    } else if (sub.status === 'payment_required') {
      console.log('\n  ⚠️  Subscription requires payment to continue trading');
    } else {
      console.log(`\n  ✓ Subscription status: ${sub.status}`);
    }
  } else {
    // Check all expired trials
    const expiredTrials = await getExpiredTrials();

    if (expiredTrials.length === 0) {
      console.log('No expired trials found that need transition.');
      process.exit(0);
    }

    console.log(`Found ${expiredTrials.length} expired trial(s):\n`);

    for (const trial of expiredTrials) {
      console.log(`User: ${trial.email} (${trial.name || 'No name'})`);
      console.log(`  Trial expired: ${trial.days_expired} days ago`);
      console.log(`  Has payment method: ${trial.has_payment_method ? 'Yes' : 'No'}`);
      console.log(`  Active bots: ${trial.active_bots}`);

      await transitionExpiredTrial(trial, !fix);
      console.log('');
    }

    if (!fix) {
      console.log('\nRun with --fix to apply these changes.');
    }
  }

  await pool.end();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
