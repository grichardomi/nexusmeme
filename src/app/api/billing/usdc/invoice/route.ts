/**
 * USDC Invoice API
 * GET  /api/billing/usdc/invoice — get active invoice or pending fees info
 * POST /api/billing/usdc/invoice — create invoice for pending fees
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  isUSDCPaymentEnabled,
  createUSDCInvoice,
  getUserActiveUSDCInvoice,
} from '@/services/billing/usdc-payment';
import { getPendingFees, getUserFeeSummary } from '@/services/billing/performance-fee';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string };

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as { user?: SessionUser } | null)?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const env = getEnvironmentConfig();
    const enabled = isUSDCPaymentEnabled();

    const [pendingFees, summary, activeInvoice] = await Promise.all([
      getPendingFees(userId),
      getUserFeeSummary(userId),
      getUserActiveUSDCInvoice(userId),
    ]);

    const totalPending = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);

    return NextResponse.json({
      enabled,
      walletAddress: enabled ? env.USDC_WALLET_ADDRESS : null,
      network: 'Base',
      pendingFees: {
        count: pendingFees.length,
        totalAmount: totalPending,
      },
      activeInvoice: activeInvoice ? {
        id: activeInvoice.id,
        reference: activeInvoice.payment_reference,
        amount: activeInvoice.amount_usd,
        walletAddress: activeInvoice.wallet_address,
        expiresAt: activeInvoice.expires_at,
        status: activeInvoice.status,
      } : null,
      summary,
    });
  } catch (error) {
    logger.error('GET /api/billing/usdc/invoice error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as { user?: SessionUser } | null)?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isUSDCPaymentEnabled()) {
      return NextResponse.json({ error: 'USDC payment not enabled' }, { status: 400 });
    }

    // Return existing active invoice if one exists
    const existing = await getUserActiveUSDCInvoice(userId);
    if (existing) {
      return NextResponse.json({
        invoice: {
          id: existing.id,
          reference: existing.payment_reference,
          amount: existing.amount_usd,
          walletAddress: existing.wallet_address,
          expiresAt: existing.expires_at,
          status: existing.status,
        },
      });
    }

    // Get pending fees
    const pendingFees = await getPendingFees(userId);
    if (pendingFees.length === 0) {
      return NextResponse.json({ error: 'No pending fees to pay' }, { status: 400 });
    }

    const totalAmount = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);
    const feeIds = pendingFees.map(f => f.id);

    const invoice = await createUSDCInvoice(userId, feeIds, totalAmount);

    logger.info('USDC invoice created via API', { userId, reference: invoice.payment_reference, totalAmount });

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        reference: invoice.payment_reference,
        amount: invoice.amount_usd,
        walletAddress: invoice.wallet_address,
        expiresAt: invoice.expires_at,
        status: invoice.status,
      },
    });
  } catch (error) {
    logger.error('POST /api/billing/usdc/invoice error', error instanceof Error ? error : null);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
