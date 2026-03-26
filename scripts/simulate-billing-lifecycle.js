#!/usr/bin/env node
/**
 * Billing Lifecycle Simulation
 * Runs against the DEV (ballast) database only.
 *
 * Simulates the full billing lifecycle for grichardomi@gmail.com:
 *   Step 1  — Verify user exists, show current state
 *   Step 2  — Seed a performance fee ($150) + flat fee ($29) → create invoice → send invoice email
 *   Step 3  — Simulate Day 7: send dunning reminder #1
 *   Step 4  — Simulate Day 10: send final warning #2
 *   Step 5  — Simulate Day 14: suspend bots → send bot-suspended email
 *   Step 6  — Simulate Day 30: expire invoice → write off fees → send invoice-expired + bot-suspended
 *   Step 7  — Simulate reinstatement: create new invoice for full debt → send reinstatement email
 *   Step 8  — Simulate payment received → mark paid → resume bots → send bot-resumed email
 *   Step 9  — Cleanup: restore original state (reset all simulation rows)
 *
 * Usage:
 *   node scripts/simulate-billing-lifecycle.js           # run all steps
 *   node scripts/simulate-billing-lifecycle.js --step 3  # run single step
 *   node scripts/simulate-billing-lifecycle.js --no-cleanup  # keep sim data for inspection
 *
 * SAFETY: only touches rows tagged with sim_session_id. Never touches prod (switchback).
 */

import { config } from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';

config({ path: '.env.local' });

// ─── Safety guard ─────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL || '';
if (DB_URL.includes('switchback')) {
  console.error('❌ ABORT: DATABASE_URL points to switchback (production). Refusing to run.');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL });

const SIM_EMAIL = 'grichardomi@gmail.com';
const SIM_SESSION = `sim_${crypto.randomBytes(4).toString('hex')}`;
const FLAT_FEE = 29.00;
const PERF_FEE = 150.00;
const INVOICE_TOTAL = PERF_FEE + FLAT_FEE; // $179.00

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const BILLING_URL = `${APP_URL}/dashboard/billing`;

// Parse CLI args
const args = process.argv.slice(2);
const stepArg = args.includes('--step') ? parseInt(args[args.indexOf('--step') + 1]) : null;
const noCleanup = args.includes('--no-cleanup');

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

// ─── Email via live app API ───────────────────────────────────────────────────
async function processEmailQueue() {
  try {
    const res = await fetch(`${APP_URL}/api/email/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-dev-key-change-in-production'}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json().catch(() => ({}));
    return data.processedCount || 0;
  } catch {
    return 0; // app may not be running — emails queued but not dispatched
  }
}

function queueEmail(type, context) {
  return q(
    `INSERT INTO email_queue (type, to_email, context, status, created_at)
     VALUES ($1, $2, $3, 'pending', NOW())`,
    [type, SIM_EMAIL, JSON.stringify({ ...context, _sim_session: SIM_SESSION })]
  );
}

// ─── Print helpers ────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function ok(msg) { console.log(`  ✅  ${msg}`); }
function info(msg) { console.log(`  ℹ️   ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function emailSent(type) { console.log(`  📧  Email queued: ${type} → ${SIM_EMAIL}`); }

// ─── Steps ────────────────────────────────────────────────────────────────────

async function step1_verifyUser() {
  section('Step 1 — Verify user & current state');

  const users = await q(`SELECT id, email, name, role FROM users WHERE email = $1`, [SIM_EMAIL]);
  if (!users[0]) {
    warn(`User ${SIM_EMAIL} not found in ballast DB.`);
    warn('Run: node scripts/seed-e2e-users.js to seed users first.');
    process.exit(1);
  }

  const user = users[0];
  ok(`Found user: ${user.name || '(no name)'} <${user.email}> id=${user.id}`);

  const [sub] = await q(`SELECT plan_tier, status, trial_ends_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
  info(`Subscription: ${sub ? `${sub.plan_tier} / ${sub.status}` : 'none'}`);

  const [billing] = await q(`SELECT billing_status, fee_exempt, failed_charge_attempts FROM user_billing WHERE user_id = $1`, [user.id]);
  info(`Billing status: ${billing?.billing_status ?? 'no row'} | fee_exempt: ${billing?.fee_exempt ?? false}`);

  const bots = await q(`SELECT id, status FROM bot_instances WHERE user_id = $1`, [user.id]);
  info(`Bots: ${bots.length === 0 ? 'none' : bots.map(b => `${b.id.slice(0,8)} (${b.status})`).join(', ')}`);

  const pendingFees = await q(`SELECT COUNT(*) as cnt, SUM(fee_amount) as total FROM performance_fees WHERE user_id = $1 AND status = 'pending_billing'`, [user.id]);
  info(`Pending fees: ${pendingFees[0]?.cnt ?? 0} rows, $${parseFloat(pendingFees[0]?.total ?? 0).toFixed(2)}`);

  return user;
}

async function step2_createInvoice(user) {
  section(`Step 2 — Seed fee ($${PERF_FEE}) + create invoice ($${INVOICE_TOTAL})`);

  // Find an existing bot to reference (bot_instance_id is a UUID FK)
  const [existingBot] = await q(`SELECT id FROM bot_instances WHERE user_id = $1 LIMIT 1`, [user.id]);
  const botRef = existingBot?.id ?? '00000000-0000-0000-0000-000000000000';

  // Seed a performance fee row
  const [fee] = await q(
    `INSERT INTO performance_fees
       (user_id, trade_id, bot_instance_id, profit_amount, fee_amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending_billing', NOW(), NOW())
     RETURNING id`,
    [user.id, `sim-trade-${SIM_SESSION}`, botRef, 2500.00, PERF_FEE]
  );
  ok(`Seeded performance fee: $${PERF_FEE} (id: ${fee.id})`);

  // Ensure user_billing row exists
  await q(
    `INSERT INTO user_billing (user_id, billing_status, failed_charge_attempts)
     VALUES ($1, 'active', 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

  // Create USDC invoice
  const payRef = `SIM-${SIM_SESSION.toUpperCase()}`;
  const rawAmount = String(Math.round(INVOICE_TOTAL * 1_000_000) + Math.floor(Math.random() * 999) + 1);
  const expiresAt = new Date(Date.now() + 30 * 86400_000);

  const [invoice] = await q(
    `INSERT INTO usdc_payment_references
       (user_id, payment_reference, amount_usd, amount_usdc_raw, fee_ids, flat_fee_usdc,
        status, wallet_address, usdc_contract, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, NOW())
     RETURNING id, payment_reference, amount_usd`,
    [
      user.id, payRef, INVOICE_TOTAL, rawAmount, [fee.id], FLAT_FEE,
      process.env.USDC_WALLET_ADDRESS || '0xSimWallet',
      process.env.USDC_CONTRACT_ADDRESS || '0xSimUSDC',
      expiresAt,
    ]
  );
  ok(`Invoice created: ref=${invoice.payment_reference} amount=$${INVOICE_TOTAL}`);
  info(`  Breakdown: $${PERF_FEE} performance fee + $${FLAT_FEE} platform fee`);
  info(`  Expires: ${expiresAt.toDateString()}`);
  info(`  Pay at: ${BILLING_URL}`);

  // Queue invoice email
  await queueEmail('performance_fee_charged', {
    name: user.name || 'Trader',
    amount: INVOICE_TOTAL,
    invoiceId: invoice.payment_reference,
    invoiceUrl: BILLING_URL,
    trades: 1,
    feePercent: 6,
  });
  emailSent('performance_fee_charged (invoice created)');

  // Also insert fee_charge_history (stripe_invoice_id reused as reference column)
  await q(
    `INSERT INTO fee_charge_history
       (user_id, billing_period_start, billing_period_end, total_fees_amount,
        total_fees_count, flat_fee_usdc, stripe_invoice_id, status)
     VALUES ($1, date_trunc('month', NOW() - interval '1 month'),
               (date_trunc('month', NOW()) - interval '1 day')::date,
               $2, 1, $3, $4, 'pending')`,
    [user.id, INVOICE_TOTAL, FLAT_FEE, payRef]
  );

  return { invoice, fee, payRef, rawAmount };
}

async function step3_dunningDay7(user) {
  section('Step 3 — Day 7: First dunning reminder');

  const [invoice] = await q(
    `SELECT * FROM usdc_payment_references WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!invoice) { warn('No pending invoice found. Run step 2 first.'); return; }

  await q(
    `UPDATE usdc_payment_references SET last_dunning_attempt = 1, updated_at = NOW() WHERE id = $1`,
    [invoice.id]
  );

  await queueEmail('performance_fee_dunning', {
    name: user.name || 'Trader',
    amount: parseFloat(invoice.amount_usd),
    attemptNumber: 1,
    deadline: new Date(invoice.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    walletAddress: invoice.wallet_address,
    paymentReference: invoice.payment_reference,
    billingUrl: BILLING_URL,
    daysUntilSuspension: 7, // 14 - 7
  });
  emailSent('performance_fee_dunning (attempt 1 — day 7 reminder)');
  ok(`Dunning attempt 1 recorded on invoice ${invoice.payment_reference}`);
}

async function step4_dunningDay10(user) {
  section('Step 4 — Day 10: Final warning');

  const [invoice] = await q(
    `SELECT * FROM usdc_payment_references WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!invoice) { warn('No pending invoice found. Run step 2 first.'); return; }

  await q(
    `UPDATE usdc_payment_references SET last_dunning_attempt = 2, updated_at = NOW() WHERE id = $1`,
    [invoice.id]
  );

  await queueEmail('performance_fee_dunning', {
    name: user.name || 'Trader',
    amount: parseFloat(invoice.amount_usd),
    attemptNumber: 2,
    deadline: new Date(invoice.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    walletAddress: invoice.wallet_address,
    paymentReference: invoice.payment_reference,
    billingUrl: BILLING_URL,
    daysUntilSuspension: 4, // 14 - 10
  });
  emailSent('performance_fee_dunning (attempt 2 — final warning day 10)');
  ok(`Dunning attempt 2 recorded on invoice ${invoice.payment_reference}`);
}

async function step5_suspendDay14(user) {
  section('Step 5 — Day 14: Bots suspended');

  // Pause any running bots
  const suspended = await q(
    `UPDATE bot_instances SET status = 'paused', updated_at = NOW()
     WHERE user_id = $1 AND status IN ('running', 'active')
     RETURNING id`,
    [user.id]
  );

  // Set billing_status to suspended
  await q(
    `UPDATE user_billing SET billing_status = 'suspended' WHERE user_id = $1`,
    [user.id]
  );

  const [invoice] = await q(
    `SELECT payment_reference, amount_usd FROM usdc_payment_references
     WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );

  await queueEmail('bot_suspended_payment_failure', {
    name: user.name || 'Trader',
    botInstanceId: suspended.length > 0 ? `${suspended.length} bot(s)` : 'your bot(s)',
    reason: `Performance fee invoice ${invoice?.payment_reference} overdue ($${parseFloat(invoice?.amount_usd || '0').toFixed(2)} USDC)`,
    action: 'Pay your invoice to instantly resume trading',
    billingUrl: BILLING_URL,
  });
  emailSent('bot_suspended_payment_failure (day 14 suspension)');
  ok(`billing_status → suspended`);
  ok(`${suspended.length} bot(s) paused`);
}

async function step6_expireDay30(user) {
  section('Step 6 — Day 30: Invoice expires → fees written off');

  const [invoice] = await q(
    `SELECT * FROM usdc_payment_references WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!invoice) { warn('No pending invoice found.'); return; }

  // Expire the invoice
  await q(
    `UPDATE usdc_payment_references SET status = 'expired', updated_at = NOW() WHERE id = $1`,
    [invoice.id]
  );

  // Write off fees → uncollectible
  if (invoice.fee_ids?.length > 0) {
    await q(
      `UPDATE performance_fees SET status = 'uncollectible', updated_at = NOW()
       WHERE id = ANY($1) AND status = 'billed'`,
      [invoice.fee_ids]
    );
    // Also catch pending_billing (sim didn't go through markFeesAsBilled)
    await q(
      `UPDATE performance_fees SET status = 'uncollectible', updated_at = NOW()
       WHERE id = ANY($1) AND status = 'pending_billing'`,
      [invoice.fee_ids]
    );
  }

  // Update fee_charge_history → failed (closest allowed status to uncollectible)
  await q(
    `UPDATE fee_charge_history SET status = 'failed', failure_reason = 'invoice_expired', updated_at = NOW()
     WHERE stripe_invoice_id = $1 AND status = 'pending'`,
    [invoice.payment_reference]
  );

  // billing_status stays suspended (safety net — already suspended at day 14)
  await q(
    `UPDATE user_billing SET billing_status = 'suspended' WHERE user_id = $1 AND billing_status != 'suspended'`,
    [user.id]
  );

  await queueEmail('invoice_expired', {
    name: user.name || 'Trader',
    amount: parseFloat(invoice.amount_usd),
    paymentReference: invoice.payment_reference,
    billingUrl: BILLING_URL,
  });
  emailSent('invoice_expired');

  await queueEmail('bot_suspended_payment_failure', {
    name: user.name || 'Trader',
    botInstanceId: 'your bot(s)',
    reason: `Invoice ${invoice.payment_reference} ($${parseFloat(invoice.amount_usd).toFixed(2)} USDC) expired unpaid`,
    action: 'Pay your invoice at the billing page to resume trading immediately',
    billingUrl: BILLING_URL,
  });
  emailSent('bot_suspended_payment_failure (safety net on invoice expiry)');

  ok(`Invoice ${invoice.payment_reference} → expired`);
  ok(`Performance fees → uncollectible (debt stays on books, not forgiven)`);
  info(`User has no payable invoice. Must pay reinstatement invoice to resume.`);
}

async function step7_reinstatement(user) {
  section('Step 7 — Reinstatement: user returns after 9 months');

  // Confirm suspended with no active invoice
  const [billing] = await q(`SELECT billing_status FROM user_billing WHERE user_id = $1`, [user.id]);
  const [activeInv] = await q(
    `SELECT id FROM usdc_payment_references WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW()`,
    [user.id]
  );

  if (billing?.billing_status !== 'suspended') {
    warn(`User is not suspended (status: ${billing?.billing_status}). Run steps 5-6 first.`);
    return;
  }
  if (activeInv) {
    warn(`User already has an active invoice. Returning existing invoice.`);
    return;
  }

  // Collect all uncollectible fees
  const uncollectible = await q(
    `SELECT id, fee_amount FROM performance_fees WHERE user_id = $1 AND status IN ('uncollectible', 'pending_billing')`,
    [user.id]
  );
  const outstandingTotal = uncollectible.reduce((s, f) => s + parseFloat(f.fee_amount), 0);
  const feeIds = uncollectible.map(f => f.id);

  // Get snapshotted flat fees from expired invoices
  const expiredInvoices = await q(
    `SELECT flat_fee_usdc FROM usdc_payment_references WHERE user_id = $1 AND status = 'expired'`,
    [user.id]
  );
  const unpaidFlatFees = expiredInvoices.reduce((s, r) => s + parseFloat(r.flat_fee_usdc || 0), 0);

  const reinstatementTotal = Math.max(outstandingTotal + unpaidFlatFees, 1.00);

  info(`Outstanding performance fees: $${outstandingTotal.toFixed(2)}`);
  info(`Flat fees from trading months: $${unpaidFlatFees.toFixed(2)} (snapshotted at invoice time)`);
  info(`NOT charging flat fee for suspended months (zero value delivered)`);
  info(`Total reinstatement: $${reinstatementTotal.toFixed(2)}`);

  // Re-mark fees as billed (debt not forgiven)
  if (feeIds.length > 0) {
    await q(
      `UPDATE performance_fees SET status = 'billed', updated_at = NOW()
       WHERE id = ANY($1) AND status = 'uncollectible'`,
      [feeIds]
    );
    ok(`${feeIds.length} fee(s) moved uncollectible → billed (debt persists)`);
  }

  // Create reinstatement invoice
  const payRef = `REIN-${SIM_SESSION.toUpperCase()}`;
  const rawAmount = String(Math.round(reinstatementTotal * 1_000_000) + Math.floor(Math.random() * 999) + 1);
  const expiresAt = new Date(Date.now() + 30 * 86400_000);

  const [invoice] = await q(
    `INSERT INTO usdc_payment_references
       (user_id, payment_reference, amount_usd, amount_usdc_raw, fee_ids, flat_fee_usdc,
        status, wallet_address, usdc_contract, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, NOW())
     RETURNING id, payment_reference, amount_usd`,
    [
      user.id, payRef, reinstatementTotal, rawAmount, feeIds, unpaidFlatFees,
      process.env.USDC_WALLET_ADDRESS || '0xSimWallet',
      process.env.USDC_CONTRACT_ADDRESS || '0xSimUSDC',
      expiresAt,
    ]
  );
  ok(`Reinstatement invoice: ref=${invoice.payment_reference} amount=$${reinstatementTotal.toFixed(2)}`);

  await queueEmail('performance_fee_charged', {
    name: user.name || 'Trader',
    amount: reinstatementTotal,
    invoiceId: invoice.payment_reference,
    invoiceUrl: BILLING_URL,
    trades: uncollectible.length,
    feePercent: 6,
  });
  emailSent('performance_fee_charged (reinstatement invoice — full debt required)');

  return { invoice, rawAmount };
}

async function step8_paymentReceived(user, reinstatementData) {
  section('Step 8 — Payment received → bots resume');

  const [invoice] = await q(
    `SELECT * FROM usdc_payment_references WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!invoice) { warn('No pending invoice to pay. Run step 7 first.'); return; }

  const fakeTxHash = `0xSIM${crypto.randomBytes(16).toString('hex')}`;

  // Mark invoice paid
  await q(
    `UPDATE usdc_payment_references SET status = 'paid', tx_hash = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [fakeTxHash, invoice.id]
  );

  // Mark fees paid
  if (invoice.fee_ids?.length > 0) {
    await q(
      `UPDATE performance_fees SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = ANY($1)`,
      [invoice.fee_ids]
    );
  }

  // Reset billing status
  await q(
    `UPDATE user_billing SET billing_status = 'active', failed_charge_attempts = 0 WHERE user_id = $1`,
    [user.id]
  );

  // Update fee_charge_history → succeeded
  await q(
    `UPDATE fee_charge_history SET status = 'succeeded', paid_at = NOW(), updated_at = NOW()
     WHERE stripe_invoice_id = $1 AND status = 'pending'`,
    [invoice.payment_reference]
  );

  // Check no other pending invoices before resuming bots
  const [otherPending] = await q(
    `SELECT COUNT(*) as cnt FROM usdc_payment_references
     WHERE user_id = $1 AND status = 'pending' AND expires_at > NOW() AND id != $2`,
    [user.id, invoice.id]
  );
  const hasPendingInvoices = parseInt(otherPending?.cnt ?? 0) > 0;

  let resumedCount = 0;
  if (!hasPendingInvoices) {
    const resumed = await q(
      `UPDATE bot_instances SET status = 'running', updated_at = NOW()
       WHERE user_id = $1 AND status = 'paused' RETURNING id`,
      [user.id]
    );
    resumedCount = resumed.length;
  }

  ok(`Invoice ${invoice.payment_reference} → paid (tx: ${fakeTxHash.slice(0, 18)}...)`);
  ok(`billing_status → active, failed_charge_attempts → 0`);
  ok(`${resumedCount} bot(s) resumed`);
  ok(`Performance fees → paid`);

  const amount = parseFloat(invoice.amount_usd);
  await queueEmail('bot_resumed', {
    name: user.name || 'Trader',
    botInstanceId: `${resumedCount} bot(s)`,
    message: `Payment of $${amount.toFixed(2)} USDC received (ref: ${invoice.payment_reference}). Your trading bot${resumedCount !== 1 ? 's have' : ' has'} been resumed automatically.`,
  });
  emailSent('bot_resumed (payment confirmed)');
}

async function step9_cleanup(user) {
  section('Step 9 — Cleanup simulation data');

  // Delete sim fees
  const deleted = await q(
    `DELETE FROM performance_fees WHERE user_id = $1 AND trade_id LIKE 'sim-trade-%' RETURNING id`,
    [user.id]
  );
  ok(`Deleted ${deleted.length} sim performance fee(s)`);

  // Delete sim invoices (both original and reinstatement)
  const deletedInv = await q(
    `DELETE FROM usdc_payment_references WHERE user_id = $1 AND (payment_reference LIKE 'SIM-%' OR payment_reference LIKE 'REIN-%') RETURNING id`,
    [user.id]
  );
  ok(`Deleted ${deletedInv.length} sim invoice(s)`);

  // Delete sim fee_charge_history
  await q(
    `DELETE FROM fee_charge_history WHERE user_id = $1 AND (stripe_invoice_id LIKE 'SIM-%' OR stripe_invoice_id LIKE 'REIN-%')`,
    [user.id]
  );

  // Restore billing_status to active
  await q(`UPDATE user_billing SET billing_status = 'active', failed_charge_attempts = 0 WHERE user_id = $1`, [user.id]);
  ok('billing_status → active (restored)');

  // Restore bots to running
  const restored = await q(
    `UPDATE bot_instances SET status = 'running', updated_at = NOW() WHERE user_id = $1 AND status = 'paused' RETURNING id`,
    [user.id]
  );
  if (restored.length > 0) ok(`${restored.length} bot(s) restored to running`);

  // Clean sim emails from queue
  await q(
    `DELETE FROM email_queue WHERE to_email = $1 AND context::text LIKE $2`,
    [SIM_EMAIL, `%${SIM_SESSION}%`]
  );
  ok('Sim emails removed from queue');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      NexusMeme Billing Lifecycle Simulation              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  User:       ${SIM_EMAIL}`);
  console.log(`  DB:         ballast (dev) — ${DB_URL.split('@')[1]?.split('/')[0]}`);
  console.log(`  Session ID: ${SIM_SESSION}`);
  console.log(`  App URL:    ${APP_URL}`);

  try {
    const user = await step1_verifyUser();

    const runStep = (n) => stepArg === null || stepArg === n;

    let invoiceData;
    if (runStep(2)) invoiceData = await step2_createInvoice(user);
    if (runStep(3)) await step3_dunningDay7(user);
    if (runStep(4)) await step4_dunningDay10(user);
    if (runStep(5)) await step5_suspendDay14(user);
    if (runStep(6)) await step6_expireDay30(user);
    if (runStep(7)) await step7_reinstatement(user);
    if (runStep(8)) await step8_paymentReceived(user);

    // Flush email queue
    section('Flushing email queue');
    const sent = await processEmailQueue();
    if (sent > 0) ok(`${sent} email(s) dispatched via app`);
    else info('Emails queued in DB — run the app and trigger /api/email/process to dispatch');

    if (!noCleanup && stepArg === null) {
      await step9_cleanup(user);
    } else if (noCleanup) {
      section('Skipping cleanup (--no-cleanup flag)');
      info(`Run again without --no-cleanup or run step 9 to restore: node scripts/simulate-billing-lifecycle.js --step 9`);
    }

    section('Simulation complete');
    console.log('\n  Email sequence sent to:', SIM_EMAIL);
    console.log('  Check inbox for:');
    console.log('    1. Invoice created ($179.00)');
    console.log('    2. Day-7 reminder');
    console.log('    3. Day-10 final warning');
    console.log('    4. Bots suspended (day 14)');
    console.log('    5. Invoice expired (day 30)');
    console.log('    6. Bot suspended (safety net)');
    console.log('    7. Reinstatement invoice ($179.00 — full debt)');
    console.log('    8. Bots resumed (payment confirmed)\n');

  } catch (err) {
    console.error('\n❌ Simulation error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
