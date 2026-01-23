import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { refundFee } from '@/services/billing/performance-fee';
import { z } from 'zod';

/**
 * POST /api/admin/fees/refund
 * Refund a paid fee
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
    const refundSchema = z.object({
      feeId: z.string().uuid(),
      reason: z.string().min(10).max(500),
    });

    const validated = refundSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { feeId, reason } = validated.data;

    // Perform refund
    const refundId = await refundFee(feeId, session.user.id, reason);

    logger.info('Fee refunded by admin', {
      adminId: session.user.id,
      feeId,
      refundId,
    });

    return NextResponse.json(
      {
        message: 'Fee refunded successfully',
        feeId,
        refundId,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Failed to refund fee', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to refund fee',
      },
      { status: 500 }
    );
  }
}
