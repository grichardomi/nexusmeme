/**
 * Run email queue processor directly using the same production code path.
 * Usage: pnpm tsx scripts/run-email-queue.ts
 */
import { processPendingEmails } from '@/services/email/queue';

async function main() {
  console.log('📧 Processing pending emails via production email pipeline...');
  const count = await processPendingEmails();
  console.log(`✅ Done — dispatched ${count} email(s)`);
  process.exit(0);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
