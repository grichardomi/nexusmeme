import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { adjustFee } from '@/services/billing/performance-fee';
import { z } from 'zod';

/**
 * POST /api/admin/fees/adjust
 * Adjust a fee (for P&L corrections)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const adminCheck = await query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    );

    if (!adminCheck[0] || adminCheck[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // Validate input
    const adjustSchema = z.object({
      feeId: z.string().uuid(),
      correctedProfit: z.number().positive(),
      reason: z.string().min(10).max(500),
    });

    const validated = adjustSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { feeId, correctedProfit, reason } = validated.data;

    // Perform adjustment
    await adjustFee(feeId, correctedProfit, session.user.id, reason);

    logger.info('Fee adjusted by admin', {
      adminId: session.user.id,
      feeId,
      correctedProfit,
    });

    return NextResponse.json(
      {
        message: 'Fee adjusted successfully',
        feeId,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Failed to adjust fee', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to adjust fee',
      },
      { status: 500 }
    );
  }
}
