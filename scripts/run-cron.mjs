/**
 * Cron runner — called by Railway cron service
 * Usage: node scripts/run-cron.mjs <job>
 *   job: billing-monthly | billing-upcoming | billing-dunning
 */

const job = process.argv[2];

if (!['billing-monthly', 'billing-upcoming', 'billing-dunning'].includes(job)) {
  console.error(`Unknown job: ${job}`);
  process.exit(1);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!appUrl || !cronSecret) {
  console.error('Missing NEXT_PUBLIC_APP_URL or CRON_SECRET');
  process.exit(1);
}

const url = `${appUrl}/api/cron/${job}`;
console.log(`Running cron job: ${job} → ${url}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'x-cron-secret': cronSecret },
});

const body = await res.json();
console.log(`Status: ${res.status}`, JSON.stringify(body, null, 2));

if (!res.ok) process.exit(1);
