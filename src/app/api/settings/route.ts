import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * GET /api/settings
 * Get user settings
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      `SELECT
        id,
        email,
        name,
        preferences
      FROM users
      WHERE id = $1`,
      [session.user.id]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = result[0];
    const preferences = typeof user.preferences === 'string'
      ? JSON.parse(user.preferences || '{}')
      : user.preferences || {};

    logger.info('Fetched user settings', { userId: session.user.id });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      notificationsEnabled: preferences.notificationsEnabled ?? true,
      dailyReports: preferences.dailyReports ?? true,
      lossAlerts: preferences.lossAlerts ?? false,
    });
  } catch (error) {
    logger.error('Error fetching settings', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Update user settings
 */

const updateSettingsSchema = z.object({
  name: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  dailyReports: z.boolean().optional(),
  lossAlerts: z.boolean().optional(),
}).passthrough();

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // If no fields provided, return error
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Validate input
    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { name, notificationsEnabled, dailyReports, lossAlerts } = validation.data;

    // Update user settings in transaction
    const result = await transaction(async (client) => {
      // Get current preferences
      const userResult = await client.query(
        `SELECT preferences FROM users WHERE id = $1`,
        [session.user.id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const preferencesData = userResult.rows[0].preferences;
      const currentPreferences = typeof preferencesData === 'string'
        ? JSON.parse(preferencesData || '{}')
        : preferencesData || {};

      // Merge preferences
      const updatedPreferences = {
        ...currentPreferences,
        ...(notificationsEnabled !== undefined && { notificationsEnabled }),
        ...(dailyReports !== undefined && { dailyReports }),
        ...(lossAlerts !== undefined && { lossAlerts }),
      };

      // Update user
      const updateResult = await client.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             preferences = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, email, name, preferences`,
        [name || null, JSON.stringify(updatedPreferences), session.user.id]
      );

      return updateResult.rows[0];
    });

    logger.info('Updated user settings', {
      userId: session.user.id,
      updatedFields: Object.keys(validation.data),
    });

    const preferences = typeof result.preferences === 'string'
      ? JSON.parse(result.preferences)
      : result.preferences || {};

    return NextResponse.json({
      id: result.id,
      email: result.email,
      name: result.name,
      notificationsEnabled: preferences.notificationsEnabled ?? true,
      dailyReports: preferences.dailyReports ?? true,
      lossAlerts: preferences.lossAlerts ?? false,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error updating settings', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: 'Failed to update settings', details: errorMsg },
      { status: 500 }
    );
  }
}
