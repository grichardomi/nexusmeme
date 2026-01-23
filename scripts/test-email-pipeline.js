#!/usr/bin/env node

/**
 * Test Email Processing Pipeline
 * Verifies that emails are queued and processed correctly
 *
 * Usage: npm run test-email-pipeline
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-dev-key-change-in-production';

async function testEmailPipeline() {
  try {
    console.log('🧪 Testing Email Processing Pipeline\n');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Using INTERNAL_API_KEY: ${INTERNAL_API_KEY}\n`);

    // Step 1: Initialize app (triggers job processor)
    console.log('📍 Step 1: Initializing app...');
    const initResponse = await fetch(`${BASE_URL}/api/init`);
    if (!initResponse.ok) {
      throw new Error(`Init failed: ${initResponse.status}`);
    }
    const initData = await initResponse.json();
    console.log(`✅ App initialized: ${JSON.stringify(initData.status)}\n`);

    // Step 2: Check email queue status
    console.log('📍 Step 2: Checking email queue status...');
    const statusResponse = await fetch(`${BASE_URL}/api/email/status`, {
      headers: {
        'Authorization': `Bearer ${INTERNAL_API_KEY}`,
      },
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log(`✅ Queue Status: ${JSON.stringify(statusData, null, 2)}\n`);
    } else if (statusResponse.status === 401) {
      console.log('⚠️  Status endpoint requires auth or not implemented\n');
    }

    // Step 3: Process pending emails
    console.log('📍 Step 3: Processing pending emails...');
    const processResponse = await fetch(`${BASE_URL}/api/email/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INTERNAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!processResponse.ok) {
      throw new Error(`Process failed: ${processResponse.status}`);
    }

    const processData = await processResponse.json();
    console.log(`✅ Process Result:`);
    console.log(`   - Success: ${processData.success}`);
    console.log(`   - Processed Count: ${processData.processedCount}`);
    console.log(`   - Message: ${processData.message}\n`);

    // Step 4: Recommendations
    console.log('📋 Next Steps:');
    console.log('1. Create a support ticket to queue emails:');
    console.log(`   POST ${BASE_URL}/api/support/tickets`);
    console.log('   (Requires authentication)\n');

    console.log('2. Run this script again to process the queued emails:');
    console.log('   npm run test-email-pipeline\n');

    console.log('3. Check database directly:');
    console.log('   psql $DATABASE_URL -c "SELECT id, type, to_email, status FROM email_queue LIMIT 10;"\n');

    console.log('✨ Email pipeline test complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Troubleshooting:');
    console.log('- Ensure the dev server is running: npm run dev');
    console.log('- Ensure DATABASE_URL and INTERNAL_API_KEY are set in .env.local');
    console.log('- Check email queue table: psql $DATABASE_URL -c "SELECT * FROM email_queue;"');
    process.exit(1);
  }
}

testEmailPipeline();
