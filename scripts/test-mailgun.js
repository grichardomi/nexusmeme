#!/usr/bin/env node

/**
 * Test Mailgun Email Sending Directly
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
  // .env.local not found - env vars may be set manually
}

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

async function testMailgun() {
  console.log('🧪 Testing Mailgun Configuration\n');
  console.log(`API Key: ${MAILGUN_API_KEY ? '✓ Present' : '✗ Missing'}`);
  console.log(`Domain: ${MAILGUN_DOMAIN ? '✓ Present (' + MAILGUN_DOMAIN + ')' : '✗ Missing'}\n`);

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error('❌ Mailgun credentials not configured in .env.local');
    process.exit(1);
  }

  try {
    console.log('📍 Sending test email via Mailgun API...\n');

    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
    const formData = new URLSearchParams();
    formData.append('from', 'NexusMeme <noreply@nexusmeme.com>');
    formData.append('to', 'support@nexusmeme.com');
    formData.append('subject', 'Test Email from NexusMeme');
    formData.append('text', 'This is a test email to verify Mailgun is working.');
    formData.append('html', '<p>This is a test email to verify Mailgun is working.</p>');

    const response = await fetch(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    console.log(`Response Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\nResponse Body:\n${JSON.stringify(data, null, 2)}\n`);

    if (!response.ok) {
      console.error('❌ Mailgun API Error');
      process.exit(1);
    }

    console.log('✅ Mailgun test email sent successfully!');
    console.log(`📧 Message ID: ${data.id}`);
  } catch (error) {
    console.error('❌ Failed to send test email:', error.message);
    process.exit(1);
  }
}

testMailgun();
