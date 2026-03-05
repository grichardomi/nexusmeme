/**
 * Lemon Squeezy Checkout API
 * GET  /api/billing/lemonsqueezy/checkout  — pending order status + fee summary
 * POST /api/billing/lemonsqueezy/checkout  — create checkout for pending fees
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  isLemonSqueezyEnabled,
  createPerformanceFeeCheckout,
  getUserPendingLsOrders,
} from '@/services/billing/lemon-squeezy';
import { getPendingFees, getUserFeeSummary } from '@/services/billing/performance-fee';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isLemonSqueezyEnabled()) {
      return NextResponse.json({ enabled: false });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const [pendingFees, pendingOrders, summary] = await Promise.all([
      getPendingFees(userId),
      getUserPendingLsOrders(userId),
      getUserFeeSummary(userId),
    ]);

    const totalPendingAmount = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);

    return NextResponse.json({
      enabled: true,
      pendingFees: {
        count: pendingFees.length,
        totalAmount: totalPendingAmount,
      },
      pendingOrders: pendingOrders.map(o => ({
        id: o.id,
        checkoutId: o.ls_checkout_id,
        amountUsd: o.amount_cents / 100,
        checkoutUrl: o.checkout_url,
        createdAt: o.created_at,
      })),
      summary: {
        totalProfits: parseFloat(String(summary.total_profits ?? 0)),
        totalFeesCollected: parseFloat(String(summary.total_fees_collected ?? 0)),
        pendingFees: parseFloat(String(summary.pending_fees ?? 0)),
        billedFees: parseFloat(String(summary.billed_fees ?? 0)),
      },
    });
  } catch (error) {
    logger.error('GET /api/billing/lemonsqueezy/checkout error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!isLemonSqueezyEnabled()) {
      return NextResponse.json({ error: 'Lemon Squeezy payments are not enabled' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check for existing pending order first
    const existingOrders = await getUserPendingLsOrders(userId);
    if (existingOrders.length > 0 && existingOrders[0].checkout_url) {
      return NextResponse.json({
        success: true,
        existingOrder: true,
        checkoutUrl: existingOrders[0].checkout_url,
      });
    }

    const pendingFees = await getPendingFees(userId);

    if (pendingFees.length === 0) {
      return NextResponse.json({ error: 'No pending fees to pay' }, { status: 400 });
    }

    const totalAmount = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);
    const minInvoice = getEnvironmentConfig().PERFORMANCE_FEE_MIN_INVOICE_USD;

    if (totalAmount < minInvoice) {
      return NextResponse.json(
        { error: `Minimum invoice amount is $${minInvoice.toFixed(2)}`, currentAmount: totalAmount },
        { status: 400 }
      );
    }

    const feeIds = pendingFees.map(f => String(f.id));
    const checkout = await createPerformanceFeeCheckout({
      userId,
      amountUsd: totalAmount,
      description: `NexusMeme performance fee — ${pendingFees.length} trade(s)`,
      feeIds,
    });

    return NextResponse.json({ success: true, checkoutUrl: checkout.url, checkoutId: checkout.id });
  } catch (error) {
    logger.error('POST /api/billing/lemonsqueezy/checkout error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 });
  }
}
