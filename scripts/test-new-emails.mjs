#!/usr/bin/env node
/**
 * Test all new email types implemented in the 16-task sprint.
 * Sends real emails to the test address via the running dev server.
 *
 * Usage: node scripts/test-new-emails.mjs
 * Requires: dev server running on localhost:3000
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-dev-key-change-in-production';
const TO = 'grichardomi@gmail.com';
const NAME = 'Richard (Test)';
const APP_URL = 'http://localhost:3000';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${INTERNAL_API_KEY}`,
};

async function queue(label, templateType, context) {
  const res = await fetch(`${BASE_URL}/api/email/test-send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: TO, type: templateType, context }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ ${label}: HTTP ${res.status} — ${text.slice(0, 200)}`);
    return false;
  }

  const data = await res.json();
  console.log(`  ✅ ${label}: queued (id=${data.emailId ?? data.id ?? '?'})`);
  return true;
}

async function flush() {
  const res = await fetch(`${BASE_URL}/api/email/process`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    console.error(`  ❌ flush: HTTP ${res.status}`);
    return 0;
  }

  const data = await res.json();
  return data.processedCount ?? 0;
}

async function main() {
  console.log(`\n📧 Sending test emails to: ${TO}`);
  console.log(`🌐 Server: ${BASE_URL}\n`);

  const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  const emails = [
    ['Trial Started',          'trial_started', {
      name: NAME,
      trialDays: 10,
      trialEndsAt: trialEndsAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      dashboardUrl: `${APP_URL}/dashboard`,
    }],
    ['Invoice Expired',        'invoice_expired', {
      name: NAME,
      amount: 12.50,
      paymentReference: 'NXM-TEST1234',
      billingUrl: `${APP_URL}/dashboard/billing`,
    }],
    ['Perf Fee Dunning Att 1', 'performance_fee_dunning', {
      name: NAME,
      amount: 45.00,
      attemptNumber: 1,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      walletAddress: '0xAbCd1234EfAb5678CdEf9012AbCd3456EfAb7890',
      paymentReference: 'NXM-TEST1234',
      billingUrl: `${APP_URL}/dashboard/billing`,
    }],
    ['Perf Fee Dunning Att 2', 'performance_fee_dunning', {
      name: NAME,
      amount: 45.00,
      attemptNumber: 2,
      deadline: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      walletAddress: '0xAbCd1234EfAb5678CdEf9012AbCd3456EfAb7890',
      paymentReference: 'NXM-TEST1234',
      billingUrl: `${APP_URL}/dashboard/billing`,
    }],
    ['Fee Rate Changed',       'fee_rate_changed', {
      name: NAME,
      prevRatePct: 5.0,
      newRatePct: 6.0,
      reason: 'Rate adjustment effective March 2026 — thank you for trading with NexusMeme.',
    }],
    ['Bot Suspended',          'bot_suspended_payment_failure', {
      name: NAME,
      botInstanceId: 'bot_TEST_001',
      reason: 'Performance fee invoice NXM-TEST1234 is overdue ($45.00 USDC)',
      action: 'Pay your invoice to instantly resume trading',
      billingUrl: `${APP_URL}/dashboard/billing`,
    }],
    ['Trade Alert (BUY)',      'trade_alert', {
      name: NAME,
      botName: 'Momentum Trader #1',
      pair: 'BTC/USDT',
      action: 'BUY',
      price: 82450.00,
      amount: 0.001,
      profit: null,
      dashboardUrl: `${APP_URL}/dashboard`,
    }],
    ['Trade Alert (SELL)',     'trade_alert', {
      name: NAME,
      botName: 'Momentum Trader #1',
      pair: 'BTC/USDT',
      action: 'SELL',
      price: 83910.00,
      amount: 0.001,
      profit: 1.46,
      dashboardUrl: `${APP_URL}/dashboard`,
    }],
    ['Bot Created',            'bot_created', {
      name: NAME,
      botName: 'Test Bot Alpha',
      strategy: 'Momentum Breakout',
      exchange: 'Binance',
      dashboardUrl: `${APP_URL}/dashboard`,
    }],
    ['Perf Fee Charged',       'performance_fee_charged', {
      name: NAME,
      amount: 23.75,
      invoiceId: 'NXM-TEST1234',
      invoiceUrl: `${APP_URL}/dashboard/billing`,
      trades: 5,
    }],
  ];

  let queued = 0;
  for (const [label, type, ctx] of emails) {
    const ok = await queue(label, type, ctx);
    if (ok) queued++;
  }

  console.log(`\n📬 Queued ${queued}/${emails.length} emails. Flushing queue...`);

  const processed = await flush();
  console.log(`✅ Delivered: ${processed} emails\n`);

  if (processed < queued) {
    console.log('⚠️  Some emails may still be pending. Check /admin/email-queue for details.');
    console.log(`   Or run: node scripts/process-emails.js\n`);
  } else {
    console.log(`📥 Check inbox: ${TO}`);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  console.log('\nTroubleshooting:');
  console.log('  - Is dev server running? pnpm dev');
  console.log('  - Is /api/email/test-send endpoint available?');
  process.exit(1);
});
