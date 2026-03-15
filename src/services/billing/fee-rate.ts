import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

/**
 * Get the effective fee rate for a user.
 * Priority: user override > global billing_settings > env fallback
 * No caching — always fresh DB read.
 */
export async function getEffectiveFeeRate(userId: string): Promise<number> {
  try {
    // 1. Check user-specific override
    const overrideResult = await query(
      'SELECT fee_rate FROM user_billing_overrides WHERE user_id = $1',
      [userId]
    );
    if (overrideResult[0]) {
      return parseFloat(String(overrideResult[0].fee_rate));
    }

    // 2. Check global billing_settings
    const settingResult = await query(
      "SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'",
      []
    );
    if (settingResult[0]) {
      return parseFloat(String(settingResult[0].value));
    }
  } catch (err) {
    console.error('[fee-rate] DB error, using env fallback:', err);
  }

  // 3. Emergency env fallback — only reaches here during a DB outage.
  // The authoritative rate is managed in billing_settings via /admin/fees.
  const env = getEnvironmentConfig();
  console.warn('[fee-rate] WARNING: DB unavailable — using PERFORMANCE_FEE_RATE env fallback. Fee rate may not reflect admin-configured value.');
  return env.PERFORMANCE_FEE_RATE;
}
