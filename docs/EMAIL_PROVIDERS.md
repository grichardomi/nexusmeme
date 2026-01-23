# Email Providers Configuration Guide

## Overview

NexusMeme supports multiple email providers with automatic fallback:
- **Primary Provider**: Mailgun (default)
- **Fallback Provider**: Resend

This dual-provider setup ensures reliable email delivery with automatic fallback if the primary provider fails.

## Configuration

### Environment Variables

Add these variables to your `.env.local` or deployment environment:

```env
# Mailgun (Primary Provider - Default)
MAILGUN_API_KEY=key-your-mailgun-api-key
MAILGUN_DOMAIN=mg.yourdomain.com

# Resend (Fallback Provider - Optional)
RESEND_API_KEY=re_your-resend-key
```

### Provider Selection Logic

The system automatically selects the provider with Mailgun as the default choice:

1. **Mailgun (PRIMARY)**: If both `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` are configured → **Use Mailgun**
2. **Resend (FALLBACK)**: If Mailgun is not configured but `RESEND_API_KEY` is present → **Use Resend**
3. **Mailgun Default**: If neither provider is configured → **Default to Mailgun** (mock mode for development/testing)

**Key Point**: Mailgun is always the default choice. If Mailgun credentials are missing, the system falls back to Resend.

## Usage

### Basic Email Sending

```typescript
import { sendEmail } from '@/services/email/provider';

// Send a single email
await sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello World</p>',
  text: 'Hello World',
});
```

### Templated Emails

```typescript
import { sendTemplatedEmail } from '@/services/email/provider';

// Send templated email
await sendTemplatedEmail(
  'user@example.com',
  'Welcome to NexusMeme',
  '<p>Welcome!</p>',
  'Welcome!',
  'noreply@nexusmeme.com'
);
```

### Batch Emails

```typescript
import { sendBatchEmails } from '@/services/email/provider';

// Send multiple emails
const results = await sendBatchEmails([
  {
    to: 'user1@example.com',
    subject: 'Test 1',
    html: '<p>Test 1</p>',
  },
  {
    to: 'user2@example.com',
    subject: 'Test 2',
    html: '<p>Test 2</p>',
  },
]);
```

### Getting Active Provider

```typescript
import { getActiveProvider } from '@/services/email/provider';

const provider = getActiveProvider(); // Returns 'mailgun' or 'resend'
console.log(`Using ${provider} email provider`);
```

## Architecture

### File Structure

```
src/services/email/
├── mailgun.ts          # Mailgun API integration
├── resend.ts           # Resend API integration
├── provider.ts         # Abstraction layer with fallback logic
├── queue.ts            # Email queue management (uses provider abstraction)
└── triggers.ts         # High-level email trigger functions

src/config/
└── environment.ts      # Configuration loading and validation
```

### How It Works

```
User Code
    ↓
sendEmail() [provider.ts]
    ↓
    ├─→ Try Mailgun Provider
    │    ├─→ Success ✓ Return result
    │    └─→ Error → Fallback
    │
    └─→ Try Resend Provider
         ├─→ Success ✓ Return result
         └─→ Error → Throw error
```

### Provider Abstraction Layer (provider.ts)

The `provider.ts` file:
1. Determines active provider based on environment variables
2. Attempts to send with primary provider
3. Falls back to secondary provider on failure
4. Throws error if all providers fail
5. Logs provider usage for debugging

### Queue Integration

The email queue system (`queue.ts`) now uses the provider abstraction:

```typescript
// queue.ts now imports from provider instead of resend
import { sendEmail, getActiveProvider } from './provider';

// Logs which provider is being used
console.log(`Processing emails using ${provider} provider`);
```

## Configuration Examples

### Recommended: Production with Mailgun Only (PRIMARY)

```env
# Mailgun will be used for all email sending
MAILGUN_API_KEY=key-production-key
MAILGUN_DOMAIN=mg.nexusmeme.com
```

### High Availability: Mailgun + Resend Fallback

```env
# Mailgun is primary, Resend kicks in if Mailgun fails
MAILGUN_API_KEY=key-production-key
MAILGUN_DOMAIN=mg.nexusmeme.com
RESEND_API_KEY=re_production_key
```

### Fallback Only: Resend (No Mailgun)

```env
# Mailgun not configured, so Resend will be used as fallback
RESEND_API_KEY=re_dev_key
```

### Development/Testing: Mock Mode (No Credentials)

```env
# No email provider configured - uses mock mode
# Emails log success but aren't actually sent
```

## Mailgun Setup

### 1. Create Mailgun Account

1. Go to [mailgun.com](https://mailgun.com)
2. Sign up for a free account
3. Verify your domain

### 2. Get API Credentials

1. Navigate to API section
2. Copy your API Key (starts with `key-`)
3. Note your domain (e.g., `mg.yourdomain.com`)

### 3. Add to Environment

```env
MAILGUN_API_KEY=key-your-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
```

## Resend Setup (Fallback)

### 1. Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up for an account
3. Get your API key from settings

### 2. Add to Environment

```env
RESEND_API_KEY=re_your_api_key
```

## Error Handling

### What Happens If Mailgun Fails?

```typescript
// If Mailgun fails for any reason:
// 1. Error is logged
// 2. Resend is attempted automatically
// 3. If Resend succeeds, email is sent
// 4. If Resend also fails, error is thrown
```

### Logging

The queue processor logs provider information:

```
Processing 5 pending emails using mailgun provider
Failed to send email xyz: Mailgun error
mailgun email sending failed, attempting fallback...
```

## Testing

Run the email provider tests:

```bash
npm run test -- provider.test.ts
```

Test cases cover:
- Provider selection logic
- Fallback mechanism
- Error handling
- Batch email sending

## Monitoring

### Check Email Status

```typescript
import { getEmailStatus, getUserEmailHistory } from '@/services/email/queue';

// Get specific email status
const status = await getEmailStatus('email-id');

// Get user's email history
const history = await getUserEmailHistory('user@example.com', 50);
```

## Troubleshooting

### Emails Not Sending

1. Check if credentials are configured:
   ```bash
   echo $MAILGUN_API_KEY
   echo $MAILGUN_DOMAIN
   ```

2. Check logs for provider errors:
   ```
   Failed to send email via Mailgun
   Both mailgun and resend failed
   ```

3. Verify API credentials are correct in email provider dashboard

### Wrong Provider Being Used

1. Check environment variables:
   ```typescript
   import { getActiveProvider } from '@/services/email/provider';
   console.log(getActiveProvider()); // 'mailgun' or 'resend'
   ```

2. Verify priority order in `provider.ts`

### Fallback Not Working

1. Ensure Resend API key is configured
2. Check that Resend credentials are valid
3. Review error logs for Resend failures

## Performance

### Mailgun (Primary)
- **Latency**: ~500ms average
- **Throughput**: High volume support
- **Cost**: Competitive pricing

### Resend (Fallback)
- **Latency**: ~300-500ms average
- **Throughput**: Good for transactional emails
- **Cost**: Generous free tier

## Security

### API Key Storage

- Store API keys in environment variables only
- Never commit keys to version control
- Use `.env.local` for development (git-ignored)
- Use secure environment management for production

### Email Verification

- Verify domain ownership in provider dashboard
- Configure SPF, DKIM, DMARC records
- Monitor email deliverability metrics

## Support

For issues or questions:
1. Check provider documentation (Mailgun/Resend)
2. Review email queue status in database
3. Check application logs for errors
4. Enable debug logging if needed

## References

- [Mailgun Documentation](https://documentation.mailgun.com/)
- [Resend Documentation](https://resend.com/docs)
- [Email Provider Tests](../src/services/email/__tests__/provider.test.ts)
- [Queue Service](../src/services/email/queue.ts)
