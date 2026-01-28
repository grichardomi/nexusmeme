/**
 * Application Startup Validation
 * Ensures all critical services are properly configured before app starts
 */

import { logger } from '@/lib/logger';

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all critical environment variables and services
 * Called during app initialization
 */
export async function validateStartup(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info('Starting application startup validation');

  // 1. Validate Coinbase Commerce configuration (required for billing)
  if (!process.env.COINBASE_COMMERCE_API_KEY) {
    warnings.push('COINBASE_COMMERCE_API_KEY is not set (billing will not work)');
  } else {
    try {
      // Test Coinbase Commerce API connection
      const response = await fetch('https://api.commerce.coinbase.com/checkouts', {
        method: 'GET',
        headers: {
          'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY,
          'X-CC-Version': '2018-03-22',
        },
      });

      if (response.ok) {
        logger.info('✓ Coinbase Commerce API connection validated');
      } else {
        warnings.push(`Coinbase Commerce API returned status ${response.status}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`Coinbase Commerce API validation failed: ${errorMsg}`);
    }
  }

  // 2. Validate Coinbase Commerce webhook secret
  if (!process.env.COINBASE_COMMERCE_WEBHOOK_SECRET) {
    warnings.push('COINBASE_COMMERCE_WEBHOOK_SECRET is not set (webhooks will not work)');
  } else {
    logger.info('✓ Coinbase Commerce webhook secret configured');
  }

  // 3. Validate database connection (already happens in db.ts)
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set');
  } else {
    logger.info('✓ Database URL configured');
  }

  // 4. Validate authentication secret
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
    errors.push('NEXTAUTH_SECRET must be at least 32 characters');
  } else {
    logger.info('✓ Authentication secret configured');
  }

  // 5. Validate email service
  if (!process.env.RESEND_API_KEY && !process.env.MAILGUN_API_KEY) {
    warnings.push('No email service configured (RESEND_API_KEY or MAILGUN_API_KEY required)');
  } else {
    logger.info('✓ Email service configured');
  }

  // 6. Validate Redis connection (for rate limiting)
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    errors.push('UPSTASH_REDIS_REST_URL is not set (rate limiting will not work)');
  } else {
    logger.info('✓ Redis configured');
  }

  // Log validation results
  if (errors.length > 0) {
    logger.error('Startup validation failed', null, {
      errorCount: errors.length,
      errors,
      warnings,
    });
  } else if (warnings.length > 0) {
    logger.warn('Startup validation completed with warnings', {
      warningCount: warnings.length,
      warnings,
    });
  } else {
    logger.info('✓ All startup validations passed');
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Halt startup if critical errors found
 */
export async function requireStartupValidation(): Promise<void> {
  const result = await validateStartup();

  if (!result.success) {
    logger.error('Application cannot start - critical configuration missing', null, {
      errors: result.errors,
    });

    throw new Error(
      `Application startup failed: ${result.errors.join('; ')}` +
      `\n\nPlease check your environment variables and try again.`
    );
  }
}
