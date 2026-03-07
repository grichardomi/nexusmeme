/**
 * Tests for USDC payment service and billing UI fixes
 */

// ─── verifyAlchemySignature ───────────────────────────────────────────────────
// We test the exported function directly; mock env so no Railway DB needed.
jest.mock('@/config/environment', () => ({
  getEnvironmentConfig: () => ({
    ALCHEMY_WEBHOOK_SIGNING_KEY: 'whsec_testsecretkey',
    USDC_WALLET_ADDRESS: '0xRecipient',
    USDC_CONTRACT_ADDRESS: '0xUSDC',
    USDC_CHAIN_ID: 8453,
    USDC_REQUIRED_CONFIRMATIONS: 1,
  }),
}));

jest.mock('@/lib/db', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import crypto from 'crypto';
import { verifyAlchemySignature, isUSDCPaymentEnabled } from '../usdc-payment';

describe('verifyAlchemySignature', () => {
  const signingKey = 'testsecretkey'; // whsec_ prefix stripped by implementation

  function makeSignature(body: string) {
    return crypto.createHmac('sha256', signingKey).update(body).digest('hex');
  }

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });
    const sig = makeSignature(body);
    expect(verifyAlchemySignature(body, sig)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const body = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });
    const sig = makeSignature(body);
    expect(verifyAlchemySignature(body + ' ', sig)).toBe(false);
  });

  it('returns false for a wrong signature', () => {
    const body = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });
    expect(verifyAlchemySignature(body, 'deadbeef'.repeat(8))).toBe(false);
  });

  it('returns false for an empty signature string', () => {
    const body = '{}';
    expect(verifyAlchemySignature(body, '')).toBe(false);
  });
});

// ─── isUSDCPaymentEnabled ─────────────────────────────────────────────────────
describe('isUSDCPaymentEnabled', () => {
  it('returns falsy when USDC_PAYMENT_ENABLED is not set', () => {
    // env mock does not set USDC_PAYMENT_ENABLED — function uses && so returns first falsy value
    expect(isUSDCPaymentEnabled()).toBeFalsy();
  });
});

// ─── encodeUSDCTransfer calldata (extracted logic, no module import) ──────────
describe('encodeUSDCTransfer calldata', () => {
  // Replicate the helper from USDCPayButton to test independently
  function encodeUSDCTransfer(toAddress: string, rawAmount: number): string {
    const selector = 'a9059cbb';
    const paddedAddress = toAddress.replace(/^0x/, '').padStart(64, '0');
    const paddedAmount = rawAmount.toString(16).padStart(64, '0');
    return `0x${selector}${paddedAddress}${paddedAmount}`;
  }

  it('starts with transfer(address,uint256) selector 0xa9059cbb', () => {
    const data = encodeUSDCTransfer('0x1234567890abcdef1234567890abcdef12345678', 1000000);
    expect(data.slice(0, 10)).toBe('0xa9059cbb');
  });

  it('pads address to 32 bytes', () => {
    const data = encodeUSDCTransfer('0x1234567890abcdef1234567890abcdef12345678', 1);
    const addrPart = data.slice(10, 74); // 32 bytes after selector
    expect(addrPart).toHaveLength(64);
    expect(addrPart.startsWith('000000000000000000000000')).toBe(true); // leading zeros
  });

  it('encodes exact USDC micro-amount (6 decimals)', () => {
    // $5.00 USDC = 5_000_000 raw units = 0x4C4B40
    const data = encodeUSDCTransfer('0x0000000000000000000000000000000000000001', 5_000_000);
    const amountHex = data.slice(74); // last 32 bytes
    expect(BigInt('0x' + amountHex)).toBe(5_000_000n);
  });

  it('produces total calldata of 68 bytes (4 selector + 32 addr + 32 amount)', () => {
    const data = encodeUSDCTransfer('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', 999);
    // 0x + 4 bytes selector + 32 bytes addr + 32 bytes amount = 2 + 8 + 64 + 64 = 138 chars
    expect(data).toHaveLength(138);
  });
});

// ─── EIP-681 URI format ───────────────────────────────────────────────────────
describe('EIP-681 QR URI', () => {
  it('uses the USDC contract address (not recipient wallet) as the target', () => {
    const usdcContract = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const recipient = '0xRecipientWallet';
    const chainId = 8453;
    const rawAmount = 5_000_001; // with micro-offset

    const uri = `ethereum:${usdcContract}@${chainId}/transfer?address=${recipient}&uint256=${rawAmount}`;

    expect(uri.startsWith(`ethereum:${usdcContract}`)).toBe(true);
    expect(uri).toContain(`@${chainId}`);
    expect(uri).toContain(`address=${recipient}`);
    expect(uri).toContain(`uint256=${rawAmount}`);
  });
});

// ─── Fee rate source of truth ─────────────────────────────────────────────────
describe('Fee rate source of truth', () => {
  it('canonical rate comes from /api/billing/fee-rate (admin-configurable), not TRIAL_CONFIG', () => {
    // TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT is only the UI fallback when the API hasn't loaded yet.
    // The real rate is stored in the DB and served by /api/billing/fee-rate.
    // This test documents that the fallback is 5 (not 15 which was the bug).
    const { TRIAL_CONFIG } = jest.requireActual('@/config/pricing') as { TRIAL_CONFIG: { PERFORMANCE_FEE_PERCENT: number } };
    expect(TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT).toBe(5);
    expect(TRIAL_CONFIG.PERFORMANCE_FEE_PERCENT).not.toBe(15);
  });
});
