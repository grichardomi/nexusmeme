import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { z } from 'zod';

/**
 * Email Preferences API
 * GET - Get user's email preferences
 * POST - Update user's email preferences
 */

const preferencesSchema = z.object({
  marketingEmails: z.boolean().optional(),
  transactionEmails: z.boolean().optional(),
  tradeAlerts: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  botStatusUpdates: z.boolean().optional(),
  billingNotifications: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT marketing_emails, transaction_emails, trade_alerts, weekly_summary,
                bot_status_updates, billing_notifications
         FROM email_preferences
         WHERE user_id = $1`,
        [session.user.id]
      );

      if (result.rows.length === 0) {
        // Return defaults if not found
        return NextResponse.json({
          marketingEmails: true,
          transactionEmails: true,
          tradeAlerts: true,
          weeklySummary: true,
          botStatusUpdates: true,
          billingNotifications: true,
        });
      }

      const prefs = result.rows[0];
      return NextResponse.json({
        marketingEmails: prefs.marketing_emails,
        transactionEmails: prefs.transaction_emails,
        tradeAlerts: prefs.trade_alerts,
        weeklySummary: prefs.weekly_summary,
        botStatusUpdates: prefs.bot_status_updates,
        billingNotifications: prefs.billing_notifications,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching email preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      marketingEmails,
      transactionEmails,
      tradeAlerts,
      weeklySummary,
      botStatusUpdates,
      billingNotifications,
    } = preferencesSchema.parse(body);

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `UPDATE email_preferences
         SET marketing_emails = COALESCE($1, marketing_emails),
             transaction_emails = COALESCE($2, transaction_emails),
             trade_alerts = COALESCE($3, trade_alerts),
             weekly_summary = COALESCE($4, weekly_summary),
             bot_status_updates = COALESCE($5, bot_status_updates),
             billing_notifications = COALESCE($6, billing_notifications),
             updated_at = NOW()
         WHERE user_id = $7
         RETURNING *`,
        [
          marketingEmails,
          transactionEmails,
          tradeAlerts,
          weeklySummary,
          botStatusUpdates,
          billingNotifications,
          session.user.id,
        ]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Email preferences not found' },
          { status: 404 }
        );
      }

      const prefs = result.rows[0];
      return NextResponse.json({
        marketingEmails: prefs.marketing_emails,
        transactionEmails: prefs.transaction_emails,
        tradeAlerts: prefs.trade_alerts,
        weeklySummary: prefs.weekly_summary,
        botStatusUpdates: prefs.bot_status_updates,
        billingNotifications: prefs.billing_notifications,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Error updating email preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
