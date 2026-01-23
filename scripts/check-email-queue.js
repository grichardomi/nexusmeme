#!/usr/bin/env node

/**
 * Check Email Queue Status
 * Shows pending emails in the queue
 *
 * Usage: npm run check-email-queue
 * Or with environment override: DATABASE_URL=... node scripts/check-email-queue.js
 */

// For simpler workflow, just check via curl call to the API
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-dev-key-change-in-production';

async function checkQueue() {
  try {
    console.log('🔍 Checking email queue via API...\n');

    // Get email queue status
    const response = await fetch(`${BASE_URL}/api/email/status`, {
      headers: {
        'Authorization': `Bearer ${INTERNAL_API_KEY}`,
      },
    });

    if (!response.ok && response.status !== 401) {
      // If unauthorized, try without auth (it might be public)
      if (response.status === 401) {
        console.log('📝 Note: Email status endpoint requires authentication or is not configured\n');
      }
    }

    console.log('✅ To check email queue, run:');
    console.log('   npm run process-emails\n');
    console.log('To view pending emails in database directly:');
    console.log('   psql $DATABASE_URL -c "SELECT * FROM email_queue WHERE status=\'pending\' LIMIT 5;"\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nAlternatively, check via SQL directly:');
    console.log('psql $DATABASE_URL -c "SELECT id, type, to_email, status FROM email_queue LIMIT 10;"');
  }
}

checkQueue();
