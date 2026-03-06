/**
 * Direct USDC Payment Service (Base Network)
 * Primary payment method — permissionless, zero downtime, zero processor fees
 *
 * Flow:
 * 1. Generate unique payment reference per invoice
 * 2. Show user: wallet address + amount + reference
 * 3. User sends USDC on Base to wallet address
 * 4. Alchemy webhook detects transfer → reconcile → mark paid
 */

import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnvironmentConfig } from '@/config/environment';
import crypto from 'crypto';

export interface USDCInvoice {
  id: string;
  user_id: string;
  payment_reference: string;
  amount_usd: number;
  amount_usdc_raw: string; // exact raw USDC units (6 decimals) expected — unique per invoice
  fee_ids: string[];
  status: 'pending' | 'paid' | 'expired';
  wallet_address: string;
  usdc_contract: string;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
}

/**
 * Check if direct USDC payment is enabled and configured
 */
export function isUSDCPaymentEnabled(): boolean {
  const env = getEnvironmentConfig();
  return env.USDC_PAYMENT_ENABLED &&
    !!env.USDC_WALLET_ADDRESS &&
    !!env.USDC_CONTRACT_ADDRESS &&
    !!env.ALCHEMY_API_KEY &&
    !!env.ALCHEMY_WEBHOOK_SIGNING_KEY;
}

/**
 * Generate a unique 8-char payment reference (e.g. NXM-A3F9B2C1)
 * Short enough to type, unique enough to avoid collisions
 */
function generatePaymentReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let ref = 'NXM-';
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

/**
 * Compute a unique USDC raw amount (6 decimals) for an invoice.
 * We add a random micro-offset (1–999 raw units = $0.000001–$0.000999)
 * so two users owing the same dollar amount get different on-chain values.
 * The offset is negligible (<$0.001) and enables exact matching in the webhook.
 *
 * Returns the raw unit string to store and display (divide by 1_000_000 for USD display).
 */
function computeUniqueRawAmount(totalAmountUSD: number): string {
  const baseRaw = Math.round(totalAmountUSD * 1_000_000); // USDC has 6 decimals
  const microOffset = Math.floor(Math.random() * 999) + 1; // 1–999 raw units
  return String(baseRaw + microOffset);
}

/**
 * Create a USDC invoice for pending performance fees
 * Called by monthly billing job or manually by user
 */
export async function createUSDCInvoice(
  userId: string,
  feeIds: string[],
  totalAmount: number
): Promise<USDCInvoice> {
  const env = getEnvironmentConfig();

  if (!env.USDC_WALLET_ADDRESS) {
    throw new Error('USDC wallet address not configured');
  }
  if (!env.USDC_CONTRACT_ADDRESS) {
    throw new Error('USDC contract address not configured');
  }

  // Generate unique reference — retry if collision (extremely rare)
  let paymentReference = generatePaymentReference();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await query(
      `SELECT id FROM usdc_payment_references WHERE payment_reference = $1`,
      [paymentReference]
    );
    if (!existing[0]) break;
    paymentReference = generatePaymentReference();
    attempts++;
  }

  // Unique micro-amount: avoids wrong-user credit when two users owe identical amounts
  const amountUsdcRaw = computeUniqueRawAmount(totalAmount);
  const displayAmountUSD = parseInt(amountUsdcRaw, 10) / 1_000_000;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days to pay

  const result = await query(
    `INSERT INTO usdc_payment_references
     (user_id, payment_reference, amount_usd, amount_usdc_raw, fee_ids, status,
      wallet_address, usdc_contract, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NOW())
     RETURNING *`,
    [
      userId,
      paymentReference,
      displayAmountUSD,
      amountUsdcRaw,
      feeIds,
      env.USDC_WALLET_ADDRESS,
      env.USDC_CONTRACT_ADDRESS,
      expiresAt,
    ]
  );

  logger.info('USDC invoice created', {
    userId,
    paymentReference,
    amount: totalAmount,
    feeCount: feeIds.length,
    expiresAt,
  });

  return result[0] as USDCInvoice;
}

/**
 * Get active (pending) USDC invoice for a user
 */
export async function getUserActiveUSDCInvoice(userId: string): Promise<USDCInvoice | null> {
  const result = await query(
    `SELECT * FROM usdc_payment_references
     WHERE user_id = $1
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result[0] || null;
}

/**
 * Verify Alchemy webhook signature
 * Header: X-Alchemy-Signature (HMAC-SHA256 of raw body)
 */
export function verifyAlchemySignature(rawBody: string, signature: string): boolean {
  const env = getEnvironmentConfig();

  if (!env.ALCHEMY_WEBHOOK_SIGNING_KEY) {
    logger.warn('Alchemy webhook signing key not configured');
    return false;
  }

  // Strip whsec_ prefix — use the remaining string directly as HMAC key (UTF-8, not base64)
  const secret = env.ALCHEMY_WEBHOOK_SIGNING_KEY.replace(/^whsec_/, '');

  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computed, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Process incoming USDC transfer detected by Alchemy webhook
 * Matches transfer to invoice by amount, marks fees as paid
 */
export async function processIncomingUSDCTransfer(transfer: {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  value: string; // USDC amount as string (6 decimals)
  blockNum: string;
}): Promise<{ matched: boolean; userId?: string; reference?: string }> {
  const env = getEnvironmentConfig();

  // Normalize to address — must match our wallet
  const toAddress = transfer.toAddress.toLowerCase();
  const ourWallet = env.USDC_WALLET_ADDRESS?.toLowerCase();

  if (toAddress !== ourWallet) {
    return { matched: false };
  }

  // Raw USDC value from chain (6 decimals integer string)
  // Alchemy may give hex or decimal — normalise to decimal integer string
  const rawValue = transfer.value.startsWith('0x')
    ? BigInt(transfer.value).toString()
    : String(Math.round(parseFloat(transfer.value)));
  const usdcAmount = parseInt(rawValue, 10) / 1_000_000;

  logger.info('Incoming USDC transfer detected', {
    txHash: transfer.txHash,
    from: transfer.fromAddress,
    rawValue,
    amount: usdcAmount,
  });

  // Match by exact raw amount (unique per invoice — micro-offset ensures no collisions)
  const invoices = await query(
    `SELECT * FROM usdc_payment_references
     WHERE status = 'pending'
       AND expires_at > NOW()
       AND amount_usdc_raw = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [rawValue]
  );

  if (!invoices[0]) {
    logger.warn('No matching USDC invoice found for transfer', {
      txHash: transfer.txHash,
      amount: usdcAmount,
    });
    return { matched: false };
  }

  const invoice = invoices[0] as USDCInvoice;

  // Check tx not already processed
  const duplicate = await query(
    `SELECT id FROM usdc_payment_references WHERE tx_hash = $1`,
    [transfer.txHash]
  );
  if (duplicate[0]) {
    logger.warn('Duplicate USDC tx hash detected', { txHash: transfer.txHash });
    return { matched: false };
  }

  // Mark invoice paid + fees paid atomically
  await transaction(async (client) => {
    // Update invoice
    await client.query(
      `UPDATE usdc_payment_references
       SET status = 'paid',
           tx_hash = $1,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [transfer.txHash, invoice.id]
    );

    // Mark performance fees as paid
    await client.query(
      `UPDATE performance_fees
       SET status = 'paid',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($1)`,
      [invoice.fee_ids]
    );

    // Reset failed charge attempts + activate billing
    await client.query(
      `UPDATE user_stripe_billing
       SET billing_status = 'active',
           failed_charge_attempts = 0
       WHERE user_id = $1`,
      [invoice.user_id]
    );

    // Resume any suspended bots
    await client.query(
      `UPDATE bot_instances
       SET status = 'running', updated_at = NOW()
       WHERE user_id = $1 AND status = 'paused'`,
      [invoice.user_id]
    );
  });

  logger.info('USDC payment matched and confirmed', {
    userId: invoice.user_id,
    reference: invoice.payment_reference,
    txHash: transfer.txHash,
    amount: usdcAmount,
  });

  return {
    matched: true,
    userId: invoice.user_id,
    reference: invoice.payment_reference,
  };
}

/**
 * Expire overdue invoices (run nightly)
 */
export async function expireOverdueInvoices(): Promise<number> {
  const result = await query(
    `UPDATE usdc_payment_references
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id`,
    []
  );
  const count = result.length;
  if (count > 0) {
    logger.info('Expired overdue USDC invoices', { count });
  }
  return count;
}
