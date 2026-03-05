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

    const globalFeeRate = settingRows[0]
      ? parseFloat(String(settingRows[0].value))
      : 0.05;

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
      await query(
        `INSERT INTO billing_settings (key, value, updated_at)
         VALUES ('performance_fee_rate', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [String(feeRate)]
      );

      await query(
        `INSERT INTO fee_adjustments_audit (admin_user_id, change_type, new_value, reason, created_at)
         VALUES ($1, 'global_fee_rate_change', $2, $3, NOW())`,
        [adminId, String(feeRate), reason ?? 'Admin update']
      );

      logger.info('Global fee rate updated', { adminId, feeRate });
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

      await query(
        `INSERT INTO fee_adjustments_audit (admin_user_id, target_user_id, change_type, new_value, reason, created_at)
         VALUES ($1, $2, 'user_fee_rate_override', $3, $4, NOW())`,
        [adminId, resolvedUserId, String(feeRate), reason ?? 'Admin override']
      );

      logger.info('User fee rate override set', { adminId, resolvedUserId, feeRate });
      return NextResponse.json({ success: true, userId: resolvedUserId, feeRate });
    }

    return NextResponse.json({ error: 'type must be "global" or "user"' }, { status: 400 });
  } catch (error) {
    logger.error('PUT /api/admin/billing-settings error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
