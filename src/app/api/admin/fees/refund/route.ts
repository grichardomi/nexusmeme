import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { markFeeRefunded } from '@/services/billing/performance-fee';
import { z } from 'zod';

/**
 * POST /api/admin/fees/refund
 * Mark a paid fee as refunded (manual crypto refund process)
 * Note: With Coinbase Commerce, refunds must be processed manually
 * via crypto wallet transfer. This endpoint records the refund in the system.
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
      refundTxId: z.string().optional(), // Optional transaction ID for crypto refund
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

    const { feeId, reason, refundTxId } = validated.data;

    // Mark fee as refunded
    await markFeeRefunded(feeId, session.user.id, reason, refundTxId);

    logger.info('Fee marked as refunded by admin', {
      adminId: session.user.id,
      feeId,
      refundTxId,
    });

    return NextResponse.json(
      {
        message: 'Fee marked as refunded successfully',
        feeId,
        refundTxId,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Failed to mark fee as refunded', error instanceof Error ? error : null);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to mark fee as refunded',
      },
      { status: 500 }
    );
  }
}
