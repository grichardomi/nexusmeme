#!/usr/bin/env node

/**
 * Email System Diagnostics
 * Tests Mailgun credentials, checks queue, and provides troubleshooting
 */

// Load .env.local manually
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
} catch (e) {
  console.warn('⚠️  Could not load .env.local automatically');
}

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const DATABASE_URL = process.env.DATABASE_URL;

async function testMailgunAPI() {
  console.log('🧪 Test 1: Mailgun API Connectivity\n');

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.log('❌ Mailgun credentials missing in .env.local');
    console.log('   MAILGUN_API_KEY:', MAILGUN_API_KEY ? '✓' : '✗');
    console.log('   MAILGUN_DOMAIN:', MAILGUN_DOMAIN ? '✓' : '✗');
    return false;
  }

  try {
    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: 'NexusMeme <noreply@nexusmeme.com>',
        to: 'support@nexusmeme.com',
        subject: 'Diagnostics Test',
        text: 'Test email',
        html: '<p>Test email</p>',
      }).toString(),
    });

    if (response.ok) {
      console.log('✅ Mailgun API responding correctly');
      const data = await response.json();
      console.log('   Message ID:', data.id, '\n');
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Mailgun API error:', response.status, error.message, '\n');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to connect to Mailgun:', error.message, '\n');
    return false;
  }
}

async function checkQueue() {
  console.log('🧪 Test 2: Email Queue Status\n');

  if (!DATABASE_URL) {
    console.log('❌ DATABASE_URL not configured\n');
    return;
  }

  try {
    // This would require psql - let user do it manually
    console.log('📋 Check email queue manually:\n');
    console.log('   psql "$DATABASE_URL" -c "SELECT id, type, to_email, status, retries, error FROM email_queue ORDER BY created_at DESC LIMIT 10;"\n');
    console.log('📋 Count pending emails:\n');
    console.log('   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM email_queue WHERE status = \'pending\';"\n');
  } catch (error) {
    console.log('Error:', error.message, '\n');
  }
}

async function getDevServerURL() {
  console.log('🧪 Test 3: Development Server Status\n');

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${BASE_URL}/api/init`);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Dev server is running');
      console.log('   Status:', JSON.stringify(data.status, null, 2), '\n');
      return true;
    } else {
      console.log('⚠️  Dev server returned:', response.status, '\n');
      return false;
    }
  } catch (error) {
    console.log('❌ Dev server not responding at', BASE_URL);
    console.log('   Start with: npm run dev\n');
    return false;
  }
}

async function runDiagnostics() {
  console.log('\n═══════════════════════════════════════════\n');
  console.log('📊 NexusMeme Email System Diagnostics\n');
  console.log('═══════════════════════════════════════════\n');

  const mailgunOk = await testMailgunAPI();
  await checkQueue();
  const devOk = await getDevServerURL();

  console.log('═══════════════════════════════════════════\n');
  console.log('📋 Troubleshooting Guide:\n');

  if (!mailgunOk) {
    console.log('❌ Mailgun Configuration Issue:');
    console.log('   1. Verify MAILGUN_API_KEY in .env.local');
    console.log('   2. Verify MAILGUN_DOMAIN in .env.local');
    console.log('   3. Check Mailgun account: https://mailgun.com/\n');
  }

  if (!devOk) {
    console.log('❌ Development Server Not Running:');
    console.log('   1. Start dev server: npm run dev');
    console.log('   2. Wait 5 seconds for initialization');
    console.log('   3. Re-run diagnostics\n');
  }

  if (mailgunOk && devOk) {
    console.log('✅ All systems operational!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Create a support ticket');
    console.log('   2. Admin should receive notification email');
    console.log('   3. Check email queue to verify sent status\n');
  }

  console.log('═══════════════════════════════════════════\n');
}

runDiagnostics();
