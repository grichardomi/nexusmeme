/**
 * Admin Fees Management API
 * GET: Retrieve all performance fees with filtering
 * POST: Adjust, waive, or refund fees with audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  sendFeeAdjustmentEmail,
  sendFeeRefundEmail,
} from '@/services/email/triggers';

/**
 * GET /api/admin/fees
 * Retrieve performance fees with optional filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const adminCheck = await query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    );
    if (!adminCheck[0] || adminCheck[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '20', 10), 1), 100);
    const status = searchParams.get('status');

    const offset = (page - 1) * pageSize;

    // Build query with optional status filter
    let whereClause = '1=1';
    const params: any[] = [];

    if (status && status !== 'all') {
      whereClause += ' AND pf.status = $1';
      params.push(status);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM performance_fees pf WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Get fees with user info
    const paramIndex = params.length + 1;
    const feesResult = await query(
      `SELECT
        pf.id,
        pf.user_id,
        u.email as user_email,
        u.name as user_name,
        pf.trade_id,
        pf.pair,
        pf.profit_amount,
        pf.fee_amount,
        pf.status,
        pf.created_at,
        pf.billed_at,
        pf.notes
      FROM performance_fees pf
      JOIN users u ON pf.user_id = u.id
      WHERE ${whereClause}
      ORDER BY pf.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    const fees = feesResult.map((f) => ({
      id: f.id,
      user_id: f.user_id,
      user_email: f.user_email,
      user_name: f.user_name,
      trade_id: f.trade_id,
      pair: f.pair,
      profit_amount: parseFloat(f.profit_amount),
      fee_amount: parseFloat(f.fee_amount),
      status: f.status,
      created_at: f.created_at,
      billed_at: f.billed_at,
      notes: f.notes,
    }));

    return NextResponse.json({
      fees,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    logger.error('Error fetching fees', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 });
  }
}

/**
 * POST /api/admin/fees
 * Adjust, waive, or refund a fee
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const adminCheck = await query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    );
    if (!adminCheck[0] || adminCheck[0].role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { feeId, action, reason, newAmount } = body;

    if (!feeId || !action || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: feeId, action, reason' },
        { status: 400 }
      );
    }

    if (!['adjust', 'waive', 'refund'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Fetch the fee
    const feeResult = await query(
      `SELECT pf.*, u.email, u.name FROM performance_fees pf
       JOIN users u ON pf.user_id = u.id
       WHERE pf.id = $1`,
      [feeId]
    );

    if (feeResult.length === 0) {
      return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
    }

    const fee = feeResult[0];

    // Process based on action
    await transaction(async (client) => {
      let newStatus = fee.status;
      let newFeeAmount = fee.fee_amount;

      switch (action) {
        case 'adjust':
          if (newAmount === undefined || newAmount < 0) {
            throw new Error('Invalid amount for adjustment');
          }
          newFeeAmount = newAmount;
          break;

        case 'waive':
          newStatus = 'waived';
          newFeeAmount = 0;
          break;

        case 'refund':
          newStatus = 'refunded';
          break;
      }

      // Update fee record
      await client.query(
        `UPDATE performance_fees
         SET status = $1,
             fee_amount = $2,
             notes = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [newStatus, newFeeAmount, reason, feeId]
      );

      // Create audit trail in fee_adjustments_audit table
      await client.query(
        `INSERT INTO fee_adjustments_audit
         (admin_user_id, affected_user_id, action, affected_fee_ids, reason, original_amount, adjusted_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [session.user?.id, fee.user_id, action, [feeId], reason, fee.fee_amount, newFeeAmount]
      );
    });

    // Send notification email
    try {
      if (action === 'adjust') {
        await sendFeeAdjustmentEmail(
          fee.email,
          fee.name || 'Trader',
          parseFloat(fee.fee_amount),
          newAmount,
          reason
        );
      } else if (action === 'refund') {
        await sendFeeRefundEmail(
          fee.email,
          fee.name || 'Trader',
          parseFloat(fee.fee_amount),
          reason
        );
      }
    } catch (emailError) {
      logger.warn('Failed to send fee adjustment email', {
        feeId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    logger.info('Fee action processed', {
      feeId,
      action,
      adminId: session.user?.id,
      reason,
    });

    return NextResponse.json({
      success: true,
      message: `Fee ${action}ed successfully`,
    });
  } catch (error) {
    logger.error('Error processing fee action', error instanceof Error ? error : null);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process action' },
      { status: 500 }
    );
  }
}
