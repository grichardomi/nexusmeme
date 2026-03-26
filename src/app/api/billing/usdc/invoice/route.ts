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
  createReinstatementInvoice,
} from '@/services/billing/usdc-payment';
import { getPendingFees, getUserFeeSummary } from '@/services/billing/performance-fee';
import { query } from '@/lib/db';
import { getEnvironmentConfig } from '@/config/environment';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string };

function getMockInvoiceResponse() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const walletAddress = '0x1111111111111111111111111111111111111111';
  return {
    enabled: true,
    walletAddress,
    usdcContract: '0x0000000000000000000000000000000000000000',
    chainId: 84532,
    network: 'Base (Mock)',
    pendingFees: {
      count: 1,
      totalAmount: 1.00,
    },
    activeInvoice: {
      id: 'mock-invoice',
      reference: 'MOCK-1234ABCD',
      amount: 1.00,
      walletAddress,
      expiresAt,
      status: 'pending',
    },
    // Mock: total_fees_collected = total_profits * 0.06 exactly (16.67 * 0.06 = 1.00)
    summary: {
      total_profits: 16.67,
      total_fees_collected: 1.00,
      pending_fees: 1.00,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const mockMode =
      req.nextUrl.searchParams.get('mock') === '1' ||
      process.env.NEXT_PUBLIC_USDC_PAYMENT_MOCK === 'true' ||
      process.env.USDC_PAYMENT_MOCK === 'true';
    if (mockMode) {
      return NextResponse.json(getMockInvoiceResponse());
    }

    const session = await getServerSession(authOptions);
    const userId = (session as { user?: SessionUser } | null)?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const env = getEnvironmentConfig();
    const enabled = isUSDCPaymentEnabled();

    const [pendingFees, summary, activeInvoice, billingRows] = await Promise.all([
      getPendingFees(userId),
      getUserFeeSummary(userId),
      getUserActiveUSDCInvoice(userId),
      query<{ billing_status: string }>(`SELECT billing_status FROM user_billing WHERE user_id = $1`, [userId]),
    ]);

    const totalPending = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);
    const isSuspended = billingRows[0]?.billing_status === 'suspended';
    // User is suspended with no pending fees and no active invoice — needs reinstatement
    const needsReinstatement = isSuspended && pendingFees.length === 0 && !activeInvoice;

    return NextResponse.json({
      enabled,
      walletAddress: enabled ? env.USDC_WALLET_ADDRESS : null,
      usdcContract: enabled ? env.USDC_CONTRACT_ADDRESS : null,
      chainId: env.USDC_CHAIN_ID,
      network: 'Base',
      isSuspended,
      needsReinstatement,
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

export async function POST(req: NextRequest) {
  try {
    const mockMode =
      req.nextUrl.searchParams.get('mock') === '1' ||
      process.env.NEXT_PUBLIC_USDC_PAYMENT_MOCK === 'true' ||
      process.env.USDC_PAYMENT_MOCK === 'true';
    if (mockMode) {
      const mock = getMockInvoiceResponse();
      return NextResponse.json({ invoice: mock.activeInvoice });
    }

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

    let invoice;

    if (pendingFees.length === 0) {
      // No pending fees — check if user is suspended with expired invoices.
      // In this case they need a reinstatement invoice to clear suspension.
      const billingRows = await query<{ billing_status: string }>(
        `SELECT billing_status FROM user_billing WHERE user_id = $1`,
        [userId]
      );
      const isSuspended = billingRows[0]?.billing_status === 'suspended';

      if (!isSuspended) {
        return NextResponse.json({ error: 'No pending fees to pay' }, { status: 400 });
      }

      const reinstatement = await createReinstatementInvoice(userId);
      if (!reinstatement) {
        return NextResponse.json({ error: 'No pending fees to pay' }, { status: 400 });
      }
      invoice = reinstatement;
    } else {
      const totalAmount = pendingFees.reduce((sum, f) => sum + parseFloat(String(f.fee_amount)), 0);
      const feeIds = pendingFees.map(f => f.id);
      invoice = await createUSDCInvoice(userId, feeIds, totalAmount);
    }

    logger.info('USDC invoice created via API', { userId, reference: invoice.payment_reference, amount: invoice.amount_usd });

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
