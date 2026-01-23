#!/usr/bin/env node

/**
 * Email Queue Processor Script
 * Processes pending emails from the queue
 *
 * Usage: node scripts/process-emails.js
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-dev-key-change-in-production';

async function processEmails() {
  try {
    console.log('🔄 Processing pending emails...');

    const response = await fetch(`${BASE_URL}/api/email/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INTERNAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ ${result.message}`);

    if (result.processedCount > 0) {
      console.log(`   - Processed ${result.processedCount} email(s)`);
    } else {
      console.log('   - No pending emails');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to process emails:', error.message);
    process.exit(1);
  }
}

processEmails();
