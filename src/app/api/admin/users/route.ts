import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/users
 * Get list of all users with pagination and subscription info
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const search = searchParams.get('search');

    const offset = (page - 1) * pageSize;

    let sql = `
      SELECT
        u.id, u.email, u.name, u.role, u.created_at, u.email_verified_at,
        s.id as subscription_id,
        s.status as subscription_status,
        s.plan_tier,
        s.trial_ends_at,
        b.config->>'billingTier' as billing_tier,
        (b.config->>'totalAccountValue')::numeric as total_account_value,
        b.config->>'accountValueUpdatedAt' as account_value_updated_at,
        ub.fee_exempt,
        ub.fee_exempt_reason
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, status, plan_tier, trial_ends_at
        FROM subscriptions
        WHERE user_id = u.id AND status != 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT config
        FROM bot_instances
        WHERE user_id = u.id
        ORDER BY created_at DESC
        LIMIT 1
      ) b ON true
      LEFT JOIN user_billing ub ON ub.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (u.email ILIKE $${params.length + 1} OR u.name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const users = await query<any>(sql, params);

    let countSql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams: any[] = [];

    if (search) {
      countSql += ` AND (email ILIKE $${countParams.length + 1} OR name ILIKE $${countParams.length + 1})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query<{ count: number | string }>(countSql, countParams);
    const total = parseInt(String(countResult[0]?.count || '0'), 10);

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: new Date(u.created_at),
        emailVerified: u.email_verified_at ? true : false,
        subscription: u.subscription_id
          ? {
              id: u.subscription_id,
              status: u.subscription_status,
              planTier: u.plan_tier,
              trialEndsAt: u.trial_ends_at ? new Date(u.trial_ends_at) : null,
            }
          : null,
        billingTier: u.billing_tier ?? null,
        totalAccountValue: u.total_account_value ? parseFloat(u.total_account_value) : null,
        accountValueUpdatedAt: u.account_value_updated_at ?? null,
        feeExempt: u.fee_exempt === true,
        feeExemptReason: u.fee_exempt_reason ?? null,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    logger.error('Failed to fetch admin users', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 * Extend a user's free trial expiration
 * Body: { userId: string, action: 'extend_trial', days: number }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, days } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    if (action === 'extend_trial') {
      const daysNum = parseInt(String(days), 10);
      if (!daysNum || daysNum < 1 || daysNum > 90) {
        return NextResponse.json({ error: 'days must be between 1 and 90' }, { status: 400 });
      }

      // Find the user's subscription (any plan — handles both live_trial and transitioned performance_fees)
      const subs = await query<any>(
        `SELECT id, status, plan_tier, trial_ends_at FROM subscriptions
         WHERE user_id = $1 AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );

      if (subs.length === 0) {
        return NextResponse.json({ error: 'No subscription found for this user' }, { status: 404 });
      }

      const sub = subs[0];

      // Extend from current expiry (or now if already expired/null)
      const baseDate = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()
        ? new Date(sub.trial_ends_at)
        : new Date();

      const newTrialEnd = new Date(baseDate);
      newTrialEnd.setDate(newTrialEnd.getDate() + daysNum);

      // Restore plan_tier to live_trial if it was transitioned away (e.g. performance_fees after expiry)
      await query(
        `UPDATE subscriptions
         SET trial_ends_at = $1,
             plan_tier = 'live_trial',
             status = 'trialing',
             trial_extended = TRUE,
             trial_extended_at = NOW(),
             trial_extended_days = COALESCE(trial_extended_days, 0) + $3,
             updated_at = NOW()
         WHERE id = $2`,
        [newTrialEnd, sub.id, daysNum],
      );

      // Resume paused/stopped bots — trial is active again, user should not need to restart manually
      const resumedBots = await query<any>(
        `UPDATE bot_instances
         SET status = 'running',
             updated_at = NOW()
         WHERE user_id = $1 AND status IN ('paused', 'stopped')
         RETURNING id`,
        [userId],
      );

      logger.info('Admin extended trial', {
        adminId: session.user.id,
        targetUserId: userId,
        subscriptionId: sub.id,
        daysAdded: daysNum,
        newTrialEnd,
        resumedBots: resumedBots.length,
      });

      return NextResponse.json({
        success: true,
        newTrialEnd,
        daysAdded: daysNum,
        resumedBots: resumedBots.length,
      });
    }

    if (action === 'waive_fees') {
      const reason = body.reason?.trim() || null;

      await query(
        `INSERT INTO user_billing (user_id, billing_status, fee_exempt, fee_exempt_reason, fee_exempt_set_at, fee_exempt_set_by)
         VALUES ($1, 'exempt', true, $2, NOW(), $3)
         ON CONFLICT (user_id) DO UPDATE
           SET fee_exempt = true,
               fee_exempt_reason = $2,
               fee_exempt_set_at = NOW(),
               fee_exempt_set_by = $3,
               billing_status = CASE WHEN user_billing.billing_status = 'suspended' THEN 'exempt' ELSE user_billing.billing_status END,
               updated_at = NOW()`,
        [userId, reason, session.user.id]
      );

      // Resume any suspended bots
      const resumedBots = await query<any>(
        `UPDATE bot_instances SET status = 'running', updated_at = NOW()
         WHERE user_id = $1 AND status IN ('paused', 'stopped') RETURNING id`,
        [userId]
      );

      logger.info('Admin granted fee exemption', { adminId: session.user.id, targetUserId: userId, reason });

      return NextResponse.json({ success: true, resumedBots: resumedBots.length });
    }

    if (action === 'remove_waiver') {
      await query(
        `UPDATE user_billing
         SET fee_exempt = false,
             fee_exempt_reason = NULL,
             fee_exempt_set_at = NULL,
             fee_exempt_set_by = NULL,
             billing_status = CASE WHEN billing_status = 'exempt' THEN 'active' ELSE billing_status END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('Admin removed fee exemption', { adminId: session.user.id, targetUserId: userId });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('Failed to update user', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
