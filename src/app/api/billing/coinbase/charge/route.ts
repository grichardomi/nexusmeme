/**
 * Coinbase Commerce Charge API
 * POST /api/billing/coinbase/charge
 *
 * Creates a new charge for pending performance fees
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  createPerformanceFeeCharge,
  isCoinbaseCommerceEnabled,
  getUserPendingCharges,
} from '@/services/billing/coinbase-commerce';
import { getPendingFees, getUserFeeSummary } from '@/services/billing/performance-fee';
import { getEnvironmentConfig } from '@/config/environment';

export async function POST(_req: NextRequest) {
  try {
    // Check if Coinbase Commerce is enabled
    if (!isCoinbaseCommerceEnabled()) {
      return NextResponse.json(
        { error: 'Coinbase Commerce payments are not enabled' },
        { status: 400 }
      );
    }

    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get pending fees for user
    const pendingFees = await getPendingFees(userId);

    if (pendingFees.length === 0) {
      return NextResponse.json(
        { error: 'No pending fees to pay' },
        { status: 400 }
      );
    }

    // Calculate total amount
    const totalAmount = pendingFees.reduce((sum, fee) => sum + Number(fee.fee_amount), 0);
    const minInvoice = getEnvironmentConfig().PERFORMANCE_FEE_MIN_INVOICE_USD;

    if (totalAmount < minInvoice) {
      return NextResponse.json(
        {
          error: `Minimum invoice amount is $${minInvoice.toFixed(2)}`,
          currentAmount: totalAmount,
        },
        { status: 400 }
      );
    }

    // Check for existing pending charges
    const existingCharges = await getUserPendingCharges(userId);
    if (existingCharges.length > 0) {
      // Return existing charge URL instead of creating new one
      return NextResponse.json({
        success: true,
        existingCharge: true,
        charge: {
          id: existingCharges[0].charge_id,
          code: existingCharges[0].charge_code,
          hostedUrl: existingCharges[0].hosted_url,
          amount: existingCharges[0].amount_usd,
          expiresAt: existingCharges[0].expires_at,
        },
      });
    }

    // Create new charge
    const feeIds = pendingFees.map(f => f.id);
    const feeSummary = await getUserFeeSummary(userId);
    const description = `Performance fees for ${pendingFees.length} profitable trade(s). Total profits: $${parseFloat(feeSummary.total_profits || 0).toFixed(2)}`;

    const charge = await createPerformanceFeeCharge({
      userId,
      amount: totalAmount,
      description,
      feeIds,
    });

    logger.info('Performance fee charge created via API', {
      userId,
      chargeId: charge.id,
      amount: totalAmount,
      feeCount: feeIds.length,
    });

    return NextResponse.json({
      success: true,
      charge: {
        id: charge.id,
        code: charge.code,
        hostedUrl: charge.hosted_url,
        amount: totalAmount,
        expiresAt: charge.expires_at,
      },
    });
  } catch (error) {
    logger.error('Failed to create Coinbase Commerce charge', error instanceof Error ? error : null);

    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/coinbase/charge
 * Get user's pending charges and fee summary
 */
export async function GET() {
  try {
    // Check if Coinbase Commerce is enabled
    if (!isCoinbaseCommerceEnabled()) {
      return NextResponse.json(
        { enabled: false, error: 'Coinbase Commerce payments are not enabled' },
        { status: 200 }
      );
    }

    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get pending fees and charges
    const [pendingFees, pendingCharges, feeSummary] = await Promise.all([
      getPendingFees(userId),
      getUserPendingCharges(userId),
      getUserFeeSummary(userId),
    ]);

    const totalPendingAmount = pendingFees.reduce(
      (sum, fee) => sum + Number(fee.fee_amount),
      0
    );

    return NextResponse.json({
      enabled: true,
      pendingFees: {
        count: pendingFees.length,
        totalAmount: totalPendingAmount,
      },
      pendingCharges: pendingCharges.map(c => ({
        id: c.charge_id,
        code: c.charge_code,
        amount: c.amount_usd,
        status: c.status,
        hostedUrl: c.hosted_url,
        expiresAt: c.expires_at,
        createdAt: c.created_at,
      })),
      summary: {
        totalProfits: parseFloat(feeSummary.total_profits || 0),
        totalFeesCollected: parseFloat(feeSummary.total_fees_collected || 0),
        pendingFees: parseFloat(feeSummary.pending_fees || 0),
        billedFees: parseFloat(feeSummary.billed_fees || 0),
      },
    });
  } catch (error) {
    logger.error('Failed to get Coinbase Commerce status', error instanceof Error ? error : null);

    return NextResponse.json(
      { error: 'Failed to get payment status' },
      { status: 500 }
    );
  }
}
