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
 * Generate a unique payment reference (e.g. NXM-A3F9B2C1)
 * Short enough to type, unique enough to avoid collisions
 */
function generatePaymentReference(refLength: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let ref = 'NXM-';
  for (let i = 0; i < refLength; i++) {
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
function computeUniqueRawAmount(totalAmountUSD: number, microOffsetMax: number): string {
  const usdcDecimals = 1_000_000; // USDC protocol constant: 6 decimal places
  const baseRaw = Math.round(totalAmountUSD * usdcDecimals);
  const microOffset = Math.floor(Math.random() * microOffsetMax) + 1; // 1–max raw units
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
  let paymentReference = generatePaymentReference(env.USDC_PAYMENT_REF_LENGTH);
  let attempts = 0;
  while (attempts < env.USDC_PAYMENT_REF_RETRIES) {
    const existing = await query(
      `SELECT id FROM usdc_payment_references WHERE payment_reference = $1`,
      [paymentReference]
    );
    if (!existing[0]) break;
    paymentReference = generatePaymentReference(env.USDC_PAYMENT_REF_LENGTH);
    attempts++;
    if (attempts === env.USDC_PAYMENT_REF_RETRIES) {
      throw new Error(
        `Failed to generate unique payment reference after ${attempts} attempts — please retry`
      );
    }
  }

  // Unique micro-amount: avoids wrong-user credit when two users owe identical amounts
  const amountUsdcRaw = computeUniqueRawAmount(totalAmount, env.USDC_MICRO_OFFSET_MAX);
  const usdcDecimals = 1_000_000; // USDC protocol constant: 6 decimal places
  const displayAmountUSD = parseInt(amountUsdcRaw, 10) / usdcDecimals;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.USDC_INVOICE_EXPIRY_DAYS);

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

  // Alchemy uses Svix: whsec_ prefix + base64-encoded raw secret bytes
  const secretBase64 = env.ALCHEMY_WEBHOOK_SIGNING_KEY.replace(/^whsec_/, '');
  const secret = Buffer.from(secretBase64, 'base64');

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
      `UPDATE user_billing
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
 * Expire overdue invoices and write off associated fees (run nightly).
 *
 * Atomically per invoice:
 *   1. Mark usdc_payment_references → 'expired'
 *   2. Mark linked performance_fees → 'uncollectible'
 *      (fees move out of 'billed' so revenue dashboard stays accurate)
 *
 * Returns: number of invoices successfully processed (not number of fee rows written off).
 * Each invoice may cover multiple fee rows — check logs for per-invoice feeCount details.
 *
 * Fees are preserved for audit history — they are never deleted.
 * If the user later pays a regenerated invoice, those new fees will be
 * fresh 'pending_billing' records from their next billing cycle.
 */
export async function expireOverdueInvoices(): Promise<number> {
  // Fetch expired invoices with fee_ids in a single query
  const expired = await query<{
    id: string;
    user_id: string;
    payment_reference: string;
    amount_usd: string;
    fee_ids: string[];
    email: string;
    name: string;
  }>(
    `SELECT r.id, r.user_id, r.payment_reference, r.amount_usd, r.fee_ids, u.email, u.name
     FROM usdc_payment_references r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
       AND r.expires_at < NOW()`,
    []
  );

  if (expired.length === 0) return 0;

  logger.info('Expiring overdue USDC invoices', { count: expired.length });

  let writeOffCount = 0;

  for (const inv of expired) {
    try {
      await transaction(async (client) => {
        // 1. Expire the invoice
        await client.query(
          `UPDATE usdc_payment_references
           SET status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [inv.id]
        );

        // 2. Write off the linked fees — move 'billed' → 'uncollectible'
        //    Only touch 'billed' — don't clobber 'paid', 'waived', 'refunded'
        if (inv.fee_ids?.length > 0) {
          await client.query(
            `UPDATE performance_fees
             SET status = 'uncollectible',
                 updated_at = NOW()
             WHERE id = ANY($1::uuid[])
               AND status = 'billed'`,
            [inv.fee_ids]
          );
        }
      });

      writeOffCount++;

      logger.info('Invoice expired and fees written off', {
        invoiceId: inv.id,
        userId: inv.user_id,
        reference: inv.payment_reference,
        amountUsd: inv.amount_usd,
        feeCount: inv.fee_ids?.length ?? 0,
      });
    } catch (err) {
      // Log but continue — a failed write-off on one invoice should not block others
      logger.error('Failed to expire invoice', err instanceof Error ? err : null, {
        invoiceId: inv.id,
        userId: inv.user_id,
      });
    }
  }

  // Send expiry emails (non-fatal — revenue write-off already committed)
  const { sendInvoiceExpiredEmail } = await import('@/services/email/triggers');
  const env = getEnvironmentConfig();
  const billingUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

  for (const inv of expired) {
    try {
      await sendInvoiceExpiredEmail(
        inv.email,
        inv.name || 'Trader',
        parseFloat(String(inv.amount_usd)),
        inv.payment_reference,
        billingUrl
      );
    } catch {
      logger.warn('Failed to send invoice expired email', { invoiceId: inv.id });
    }
  }

  return writeOffCount;
}

/**
 * Retry unresolved webhook failures.
 * Called by the webhook-recovery cron every 4 hours.
 *
 * Each row in webhook_failures represents a transfer whose DB processing
 * failed (Alchemy returned 200 so won't retry). This job re-runs the same
 * processIncomingUSDCTransfer() logic and marks rows resolved on success.
 *
 * Skips rows that are already resolved or older than 30 days (unlikely to match
 * any live invoice at that point).
 *
 * Returns: { attempted, resolved, stillFailing }
 */
export async function retryWebhookFailures(): Promise<{
  attempted: number;
  resolved: number;
  stillFailing: number;
}> {
  const failures = await query<{
    id: string;
    tx_hash: string;
    from_address: string;
    to_address: string;
    raw_value: string;
    block_num: string;
  }>(
    `SELECT id, tx_hash, from_address, to_address, raw_value, block_num
     FROM webhook_failures
     WHERE resolved = FALSE
       AND created_at > NOW() - INTERVAL '30 days'
     ORDER BY created_at ASC
     LIMIT 50`
  );

  if (failures.length === 0) return { attempted: 0, resolved: 0, stillFailing: 0 };

  logger.info('webhook-recovery: retrying failed webhook transfers', { count: failures.length });

  let resolved = 0;
  let stillFailing = 0;

  for (const row of failures) {
    try {
      const result = await processIncomingUSDCTransfer({
        txHash: row.tx_hash,
        fromAddress: row.from_address,
        toAddress: row.to_address,
        value: row.raw_value,
        blockNum: row.block_num,
      });

      // Mark resolved whether or not it matched — if no invoice matches, there's
      // nothing to retry (invoice may have expired or already been paid separately).
      await query(
        `UPDATE webhook_failures SET resolved = TRUE, resolved_at = NOW() WHERE id = $1`,
        [row.id]
      );
      resolved++;

      if (result.matched) {
        logger.info('webhook-recovery: transfer matched on retry', {
          txHash: row.tx_hash,
          userId: result.userId,
          reference: result.reference,
        });
      } else {
        logger.info('webhook-recovery: transfer unmatched (invoice expired or already paid) — marked resolved', {
          txHash: row.tx_hash,
        });
      }
    } catch (err) {
      stillFailing++;
      // Update error message so operator can see latest failure reason
      await query(
        `UPDATE webhook_failures SET error_message = $1 WHERE id = $2`,
        [err instanceof Error ? err.message : String(err), row.id]
      ).catch(() => {});
      logger.error('webhook-recovery: retry failed', err instanceof Error ? err : null, {
        txHash: row.tx_hash,
      });
    }
  }

  logger.info('webhook-recovery complete', { attempted: failures.length, resolved, stillFailing });
  return { attempted: failures.length, resolved, stillFailing };
}
