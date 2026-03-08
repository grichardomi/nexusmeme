/**
 * Admin Billing Settings API
 * GET  /api/admin/billing-settings — returns global fee rate + user overrides
 * PUT  /api/admin/billing-settings — updates global rate or user override
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import { sendFeeRateChangedEmail } from '@/services/email/triggers';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string; role?: string };

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>): boolean {
  return (session as { user?: SessionUser } | null)?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionAny = session as { user?: SessionUser } | null;
    if (!sessionAny?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [settingRows, overrideRows] = await Promise.all([
      query("SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'", []),
      query(
        `SELECT ubo.id, ubo.user_id, ubo.fee_rate, ubo.reason, ubo.created_at, u.email, u.name
         FROM user_billing_overrides ubo
         JOIN users u ON u.id = ubo.user_id
         ORDER BY ubo.created_at DESC`,
        []
      ),
    ]);

    const env = getEnvironmentConfig();
    const globalFeeRate = settingRows[0]
      ? parseFloat(String(settingRows[0].value))
      : env.PERFORMANCE_FEE_RATE;

    return NextResponse.json({
      globalFeeRate,
      userOverrides: overrideRows.map(r => ({
        id: r.id,
        user_id: r.user_id,
        email: r.email,
        name: r.name,
        fee_rate: parseFloat(String(r.fee_rate)),
        reason: r.reason,
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    logger.error('GET /api/admin/billing-settings error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionAnyPut = session as { user?: SessionUser } | null;
    if (!sessionAnyPut?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { type, feeRate, userId, userEmail, reason } = body as {
      type: 'global' | 'user';
      feeRate: number | null;
      userId?: string;
      userEmail?: string;
      reason?: string;
    };

    // feeRate null = delete user override
    if (feeRate !== null && (typeof feeRate !== 'number' || feeRate < 0 || feeRate > 1)) {
      return NextResponse.json({ error: 'feeRate must be a number between 0 and 1 (or null to delete)' }, { status: 400 });
    }

    const adminId = sessionAnyPut.user!.id!;

    if (type === 'global') {
      if (feeRate === null) return NextResponse.json({ error: 'feeRate required for global update' }, { status: 400 });

      // Read previous rate BEFORE updating
      const prevRows = await query(
        `SELECT value FROM billing_settings WHERE key = 'performance_fee_rate'`,
        []
      );
      const prevRate: number = prevRows[0] ? parseFloat(String(prevRows[0].value)) : getEnvironmentConfig().PERFORMANCE_FEE_RATE;

      await query(
        `INSERT INTO billing_settings (key, value, updated_at)
         VALUES ('performance_fee_rate', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [String(feeRate)]
      );

      logger.info('Global fee rate updated', { adminId, prevRate, feeRate });

      // Notify all active live users (non-trial) of the rate change (fire-and-forget)
      (async () => {
        try {

          const users = await query<{ email: string; name: string }>(
            `SELECT DISTINCT u.email, u.name
             FROM users u
             JOIN subscriptions s ON s.user_id = u.id
             WHERE s.plan_tier != 'live_trial'
               AND s.status IN ('active', 'trialing')
               AND COALESCE((SELECT ep.billing_notifications FROM email_preferences ep WHERE ep.user_id = u.id), true)`,
            []
          );

          for (const u of users) {
            await sendFeeRateChangedEmail(u.email, u.name || 'Trader', prevRate, feeRate);
          }
          logger.info('Fee change notifications sent', { count: users.length, prevRate, feeRate });
        } catch (emailErr) {
          logger.warn('Failed to send global fee change notifications', {});
        }
      })();

      return NextResponse.json({ success: true, globalFeeRate: feeRate });
    }

    if (type === 'user') {
      // Resolve user ID — accept either userId or userEmail
      let resolvedUserId = userId;
      if (!resolvedUserId && userEmail) {
        const rows = await query('SELECT id FROM users WHERE email = $1', [userEmail]);
        if (!rows[0]) return NextResponse.json({ error: `No user found with email ${userEmail}` }, { status: 404 });
        resolvedUserId = rows[0].id;
      }
      if (!resolvedUserId) {
        return NextResponse.json({ error: 'userId or userEmail required for user override' }, { status: 400 });
      }

      // feeRate null = delete override
      if (feeRate === null) {
        await query('DELETE FROM user_billing_overrides WHERE user_id = $1', [resolvedUserId]);
        logger.info('User fee rate override removed', { adminId, resolvedUserId });
        return NextResponse.json({ success: true });
      }

      await query(
        `INSERT INTO user_billing_overrides (user_id, fee_rate, reason, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET fee_rate = EXCLUDED.fee_rate, reason = EXCLUDED.reason, updated_at = NOW()`,
        [resolvedUserId, feeRate, reason ?? '', adminId]
      );

      logger.info('User fee rate override set', { adminId, resolvedUserId, feeRate });

      // Notify the specific user of their custom rate
      (async () => {
        try {
          // Fetch user info, their current override (prev rate), and global rate in one go
          const userRows = await query<{ email: string; name: string; billing_notifications: boolean; prev_override: string | null; global_rate: string | null }>(
            `SELECT u.email, u.name,
               COALESCE(ep.billing_notifications, true) as billing_notifications,
               (SELECT ubo2.fee_rate FROM user_billing_overrides ubo2 WHERE ubo2.user_id = u.id) as prev_override,
               (SELECT bs.value FROM billing_settings bs WHERE bs.key = 'performance_fee_rate') as global_rate
             FROM users u
             LEFT JOIN email_preferences ep ON ep.user_id = u.id
             WHERE u.id = $1`,
            [resolvedUserId]
          );
          const u = userRows[0];
          if (u?.billing_notifications) {
            const prevUserRate = u.prev_override !== null
              ? parseFloat(String(u.prev_override))
              : (u.global_rate !== null ? parseFloat(String(u.global_rate)) : getEnvironmentConfig().PERFORMANCE_FEE_RATE);
            await sendFeeRateChangedEmail(
              u.email, u.name || 'Trader',
              prevUserRate,
              feeRate!,
              reason || 'Your performance fee rate has been updated by the NexusMeme team.'
            );
          }
        } catch {
          // fire-and-forget
        }
      })();

      return NextResponse.json({ success: true, userId: resolvedUserId, feeRate });
    }

    return NextResponse.json({ error: 'type must be "global" or "user"' }, { status: 400 });
  } catch (error) {
    logger.error('PUT /api/admin/billing-settings error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
