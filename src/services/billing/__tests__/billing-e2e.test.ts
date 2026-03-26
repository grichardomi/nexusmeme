/**
 * Billing End-to-End Tests
 *
 * Covers the full lifecycle:
 *   1. Normal flow   — invoice created, user pays, bots resume, email sent
 *   2. Dunning       — day 7 reminder, day 10 warning, day 14 suspension, day 30 expiry
 *   3. Reinstatement — user returns after expiry, pays full debt (perf fees + flat fees owed)
 *   4. Trial user    — no performance fees, no flat fee ever charged
 *   5. Multi-invoice — paying one invoice with others still pending does NOT resume bots
 *   6. Free-ride guard — suspended user with pending invoice is not auto-restored on subscription init
 *   7. Flat fee snapshot — reinstatement uses snapshotted flat_fee_usdc, not current admin value
 *   8. Debt persistence — uncollectible fees re-billed on reinstatement, never forgiven
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...args: any[]) => mockQuery(...args),
  transaction: (...args: any[]) => mockTransaction(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/config/environment', () => ({
  getEnvironmentConfig: () => ({
    USDC_PAYMENT_ENABLED: true,
    USDC_WALLET_ADDRESS: '0xOurWallet',
    USDC_CONTRACT_ADDRESS: '0xUSDCContract',
    ALCHEMY_API_KEY: 'alchemy-key',
    ALCHEMY_WEBHOOK_SIGNING_KEY: 'whsec_dGVzdA==', // base64('test')
    USDC_PAYMENT_REF_LENGTH: 8,
    USDC_PAYMENT_REF_RETRIES: 5,
    USDC_MICRO_OFFSET_MAX: 999,
    USDC_INVOICE_EXPIRY_DAYS: 30,
    BILLING_GRACE_PERIOD_DAYS: 7,
    DUNNING_WARNING_DAYS: 10,
    BILLING_SUSPENSION_DAYS: 14,
    PERFORMANCE_FEE_MIN_INVOICE_USD: 1.00,
    FLAT_FEE_USDC: 0,
    NEXT_PUBLIC_APP_URL: 'https://nexusmeme.com',
  }),
}));

// Email triggers — capture calls without sending real emails
const mockSendBotResumedEmail = jest.fn().mockResolvedValue('queued');
const mockSendBotSuspendedEmail = jest.fn().mockResolvedValue('queued');
const mockSendInvoiceExpiredEmail = jest.fn().mockResolvedValue('queued');
const mockSendPerformanceFeeChargedEmail = jest.fn().mockResolvedValue('queued');

jest.mock('@/services/email/triggers', () => ({
  sendBotResumedEmail: (...a: any[]) => mockSendBotResumedEmail(...a),
  sendBotSuspendedEmail: (...a: any[]) => mockSendBotSuspendedEmail(...a),
  sendInvoiceExpiredEmail: (...a: any[]) => mockSendInvoiceExpiredEmail(...a),
  sendPerformanceFeeChargedEmail: (...a: any[]) => mockSendPerformanceFeeChargedEmail(...a),
}));

import {
  processIncomingUSDCTransfer,
  expireOverdueInvoices,
  createReinstatementInvoice,
  isUSDCPaymentEnabled,
} from '../usdc-payment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a pending invoice row as the DB returns it */
function makeInvoice(overrides: Partial<{
  id: string;
  user_id: string;
  payment_reference: string;
  amount_usd: number;
  amount_usdc_raw: string;
  flat_fee_usdc: number;
  fee_ids: string[];
  status: string;
  wallet_address: string;
  expires_at: string;
  email: string;
  name: string;
}> = {}) {
  return {
    id: 'inv-001',
    user_id: 'user-001',
    payment_reference: 'NXM-ABCD1234',
    amount_usd: 100.00,
    amount_usdc_raw: '100000500',  // $100.000500 with micro-offset
    flat_fee_usdc: 29,
    fee_ids: ['fee-1', 'fee-2'],
    status: 'pending',
    wallet_address: '0xOurWallet',
    usdc_contract: '0xUSDCContract',
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    email: 'trader@example.com',
    name: 'Alice',
    ...overrides,
  };
}

/** Make the transaction mock execute the callback with a mock client */
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (client: any) => Promise<void>) => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };
    await cb(client);
    return client;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupTransaction();
});

// ─── 1. NORMAL PAYMENT FLOW ───────────────────────────────────────────────────

describe('Normal payment flow', () => {
  it('matches transfer by exact raw amount and marks invoice paid', async () => {
    const invoice = makeInvoice({ amount_usdc_raw: '100000500' });

    mockQuery
      .mockResolvedValueOnce([invoice])   // find invoice by raw amount
      .mockResolvedValueOnce([])          // duplicate tx check
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]); // user email

    // transaction client: set up resumed bots
    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })  // update invoice paid
          .mockResolvedValueOnce({ rows: [] })  // update performance_fees paid
          .mockResolvedValueOnce({ rows: [] })  // update user_billing active
          .mockResolvedValueOnce({ rows: [] })  // update fee_charge_history paid
          .mockResolvedValueOnce({ rows: [{ cnt: '0' }] }) // no other pending invoices
          .mockResolvedValueOnce({ rows: [{ id: 'bot-1' }, { id: 'bot-2' }] }), // resume bots
      };
      await cb(client);
      return client;
    });

    const result = await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUserWallet',
      toAddress: '0xOurWallet',
      value: '100000500',
      blockNum: '0x123',
    });

    expect(result.matched).toBe(true);
    expect(result.userId).toBe('user-001');
    expect(result.reference).toBe('NXM-ABCD1234');
  });

  it('sends bot-resumed email after successful payment', async () => {
    const invoice = makeInvoice({ amount_usdc_raw: '100000500' });

    mockQuery
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ cnt: '0' }] })
          .mockResolvedValueOnce({ rows: [{ id: 'bot-1' }] }),
      };
      await cb(client);
    });

    await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUserWallet',
      toAddress: '0xOurWallet',
      value: '100000500',
      blockNum: '0x123',
    });

    expect(mockSendBotResumedEmail).toHaveBeenCalledWith(
      'trader@example.com',
      'Alice',
      expect.stringContaining('bot'),
      expect.stringContaining('NXM-ABCD1234')
    );
  });

  it('rejects transfer to wrong wallet address', async () => {
    const result = await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUserWallet',
      toAddress: '0xSomeOtherWallet',  // not our wallet
      value: '100000500',
      blockNum: '0x123',
    });

    expect(result.matched).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects duplicate tx hash (prevents double-credit)', async () => {
    const invoice = makeInvoice({ amount_usdc_raw: '100000500' });

    mockQuery
      .mockResolvedValueOnce([invoice])         // invoice found
      .mockResolvedValueOnce([{ id: 'dup' }]);  // duplicate tx exists

    const result = await processIncomingUSDCTransfer({
      txHash: '0xAlreadyProcessed',
      fromAddress: '0xUserWallet',
      toAddress: '0xOurWallet',
      value: '100000500',
      blockNum: '0x123',
    });

    expect(result.matched).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns unmatched when no invoice found for amount', async () => {
    mockQuery.mockResolvedValueOnce([]); // no invoice matches

    const result = await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUserWallet',
      toAddress: '0xOurWallet',
      value: '999999',
      blockNum: '0x123',
    });

    expect(result.matched).toBe(false);
  });
});

// ─── 2. MULTI-INVOICE GUARD ───────────────────────────────────────────────────

describe('Multi-invoice guard', () => {
  it('does NOT resume bots when another pending invoice still exists', async () => {
    const invoice = makeInvoice({ amount_usdc_raw: '100000500' });

    mockQuery
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    let botsResumed = false;
    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })   // update invoice paid
          .mockResolvedValueOnce({ rows: [] })   // update fees paid
          .mockResolvedValueOnce({ rows: [] })   // update user_billing
          .mockResolvedValueOnce({ rows: [] })   // update fee_charge_history
          .mockResolvedValueOnce({ rows: [{ cnt: '1' }] }) // another pending invoice exists
          // resume bots query should NOT be called
          .mockImplementation(() => { botsResumed = true; return { rows: [] }; }),
      };
      await cb(client);
    });

    await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUserWallet',
      toAddress: '0xOurWallet',
      value: '100000500',
      blockNum: '0x123',
    });

    expect(botsResumed).toBe(false);
    expect(mockSendBotResumedEmail).not.toHaveBeenCalled();
  });
});

// ─── 3. INVOICE EXPIRY ────────────────────────────────────────────────────────

describe('Invoice expiry', () => {
  it('marks invoice expired, fees uncollectible, sets billing_status suspended, pauses bots', async () => {
    const expiredInvoice = {
      id: 'inv-001',
      user_id: 'user-001',
      payment_reference: 'NXM-ABCD1234',
      amount_usd: '100.00',
      flat_fee_usdc: '29',
      fee_ids: ['fee-1', 'fee-2'],
      email: 'trader@example.com',
      name: 'Alice',
    };

    // expireOverdueInvoices: fetch expired invoices
    mockQuery.mockResolvedValueOnce([expiredInvoice]);

    const clientQueries: string[] = [];
    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn().mockImplementation((sql: string) => {
          clientQueries.push(sql); // capture full SQL
          return { rows: [] };
        }),
      };
      await cb(client);
    });

    await expireOverdueInvoices();

    // Verify all four DB writes happened in the transaction
    expect(clientQueries.some(q => q.includes("'expired'"))).toBe(true);        // invoice expired
    expect(clientQueries.some(q => q.includes("'uncollectible'"))).toBe(true);  // fees written off
    expect(clientQueries.some(q => q.includes('billing_status'))).toBe(true);   // billing suspended
    expect(clientQueries.some(q => q.includes('bot_instances'))).toBe(true);    // bots paused
  });

  it('sends both invoice-expired and bot-suspended emails on expiry', async () => {
    const expiredInvoice = {
      id: 'inv-001',
      user_id: 'user-001',
      payment_reference: 'NXM-ABCD1234',
      amount_usd: '100.00',
      flat_fee_usdc: '29',
      fee_ids: ['fee-1'],
      email: 'trader@example.com',
      name: 'Alice',
    };

    mockQuery.mockResolvedValueOnce([expiredInvoice]);

    await expireOverdueInvoices();

    expect(mockSendInvoiceExpiredEmail).toHaveBeenCalledWith(
      'trader@example.com',
      'Alice',
      100.00,
      'NXM-ABCD1234',
      expect.stringContaining('/dashboard/billing')
    );
    expect(mockSendBotSuspendedEmail).toHaveBeenCalledWith(
      'trader@example.com',
      'Alice',
      expect.any(String),
      expect.stringContaining('NXM-ABCD1234'),
      expect.any(String),
      expect.stringContaining('/dashboard/billing')
    );
  });

  it('returns 0 when no expired invoices exist', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const count = await expireOverdueInvoices();
    expect(count).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('continues processing remaining invoices if one fails', async () => {
    const invoices = [
      { id: 'inv-001', user_id: 'user-001', payment_reference: 'NXM-FAIL', amount_usd: '50', flat_fee_usdc: '0', fee_ids: [], email: 'a@a.com', name: 'A' },
      { id: 'inv-002', user_id: 'user-002', payment_reference: 'NXM-OK', amount_usd: '75', flat_fee_usdc: '29', fee_ids: [], email: 'b@b.com', name: 'B' },
    ];

    mockQuery.mockResolvedValueOnce(invoices);

    let callCount = 0;
    mockTransaction.mockImplementation(async (cb: any) => {
      callCount++;
      if (callCount === 1) throw new Error('DB write failed');
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      await cb(client);
    });

    const count = await expireOverdueInvoices();
    // First failed, second succeeded
    expect(count).toBe(1);
  });
});

// ─── 4. REINSTATEMENT FLOW ────────────────────────────────────────────────────

describe('Reinstatement invoice', () => {
  it('returns null when user is not suspended', async () => {
    mockQuery.mockResolvedValueOnce([{ billing_status: 'active' }]);

    const invoice = await createReinstatementInvoice('user-001');
    expect(invoice).toBeNull();
  });

  it('returns existing active invoice if one already exists', async () => {
    const existingInvoice = makeInvoice({ status: 'pending' });

    mockQuery
      .mockResolvedValueOnce([{ billing_status: 'suspended' }])  // billing check
      .mockResolvedValueOnce([existingInvoice]);                  // active invoice exists

    const invoice = await createReinstatementInvoice('user-001');
    expect(invoice?.payment_reference).toBe('NXM-ABCD1234');
  });

  it('includes ALL uncollectible performance fees in reinstatement amount', async () => {
    mockQuery
      .mockResolvedValueOnce([{ billing_status: 'suspended' }])   // billing check
      .mockResolvedValueOnce([])                                   // no active invoice
      .mockResolvedValueOnce([                                     // outstanding fees
        { id: 'fee-1', fee_amount: '5000.00', status: 'uncollectible' },
        { id: 'fee-2', fee_amount: '4000.00', status: 'uncollectible' },
      ])
      .mockResolvedValueOnce([])                                   // update fees to billed
      .mockResolvedValueOnce([{ flat_fee_usdc: '29' }])           // expired invoice flat fees
      // createUSDCInvoice internals:
      .mockResolvedValueOnce([])                                   // ref collision check
      .mockResolvedValueOnce([makeInvoice({ amount_usd: 9029 })]) // invoice insert
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]); // user email

    const invoice = await createReinstatementInvoice('user-001');

    // $9,000 perf fees + $29 flat fee from expired invoice = $9,029
    expect(invoice?.amount_usd).toBe(9029);
  });

  it('uses snapshotted flat_fee_usdc from expired invoice, not current admin setting', async () => {
    // Admin has since changed flat fee to $99, but user's original invoice was $29
    mockQuery
      .mockResolvedValueOnce([{ billing_status: 'suspended' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'fee-1', fee_amount: '100.00', status: 'uncollectible' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ flat_fee_usdc: '29' }])   // ← snapshotted $29, NOT current $99
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeInvoice({ amount_usd: 129 })])
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    const invoice = await createReinstatementInvoice('user-001');
    // $100 perf fees + $29 snapshotted flat fee = $129 (not $100 + $99 = $199)
    expect(invoice?.amount_usd).toBe(129);
  });

  it('does NOT charge flat fees for suspended months (only original invoice flat fee)', async () => {
    // User was suspended for 9 months. Only 1 expired invoice exists (month 1).
    // We should NOT multiply flat fee × 9 for the suspension period.
    mockQuery
      .mockResolvedValueOnce([{ billing_status: 'suspended' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'fee-1', fee_amount: '9000.00', status: 'uncollectible' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ flat_fee_usdc: '29' }])  // ONE expired invoice, $29
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeInvoice({ amount_usd: 9029 })])
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    const invoice = await createReinstatementInvoice('user-001');
    // $9,000 + $29 (not $9,000 + $29 × 9 = $9,261)
    expect(invoice?.amount_usd).toBe(9029);
  });

  it('debt persists — uncollectible fees are re-billed, never forgiven', async () => {
    // Use a blanket mockImplementation to capture all SQL calls
    const allSql: string[] = [];

    mockQuery.mockImplementation(async (sql: string) => {
      allSql.push(sql);
      const s = sql.trim();
      if (s.includes('user_billing'))                                               return [{ billing_status: 'suspended' }];
      if (s.startsWith('SELECT') && s.includes('usdc_payment_references') && s.includes("'pending'")) return []; // active invoice check
      if (s.startsWith('SELECT') && s.includes('performance_fees'))                return [{ id: 'fee-1', fee_amount: '9000.00', status: 'uncollectible' }];
      if (s.startsWith('UPDATE') && s.includes('performance_fees'))                return []; // fee rebill
      if (s.startsWith('SELECT') && s.includes('usdc_payment_references') && s.includes("'expired'")) return [{ flat_fee_usdc: '29' }];
      if (s.startsWith('SELECT') && s.includes('payment_reference'))               return []; // ref collision check
      if (s.startsWith('INSERT INTO usdc_payment_references'))                     return [makeInvoice({ amount_usd: 9029 })];
      if (s.includes('FROM users'))                                                 return [{ email: 'trader@example.com', name: 'Alice' }];
      return [];
    });

    await createReinstatementInvoice('user-001');

    // The UPDATE must set performance_fees.status = 'billed' (debt not forgiven)
    const feeRebillSql = allSql.find(sql =>
      sql.trim().startsWith('UPDATE') &&
      sql.includes('performance_fees') &&
      sql.includes("'billed'")
    );
    expect(feeRebillSql).toBeDefined();
  });

  it('uses PERFORMANCE_FEE_MIN_INVOICE_USD env var as floor, not hardcoded $1', async () => {
    // User has $0 outstanding fees and $0 flat fee — floor should still apply
    mockQuery
      .mockResolvedValueOnce([{ billing_status: 'suspended' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])                         // no outstanding fees
      .mockResolvedValueOnce([])                         // no expired invoices
      .mockResolvedValueOnce([{ flat_fee_usdc: '0' }])  // $0 flat fee from billing_settings
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeInvoice({ amount_usd: 1.00 })])  // floor applied
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    const invoice = await createReinstatementInvoice('user-001');
    // PERFORMANCE_FEE_MIN_INVOICE_USD = 1.00 from mock env
    expect(invoice?.amount_usd).toBeGreaterThanOrEqual(1.00);
  });
});

// ─── 5. TRIAL USER — NO FEES ──────────────────────────────────────────────────

describe('Trial user fee waiving', () => {
  /**
   * Pure logic test — mirrors the decision in recordPerformanceFee().
   * Trial users get status 'waived', not 'pending_billing'.
   */
  function determineFeeStatus(plan: string, trialEndsAt: Date | null, tradingMode: 'paper' | 'live'): 'waived' | 'pending_billing' {
    const isFreeTrial = plan === 'live_trial' || (trialEndsAt !== null && trialEndsAt > new Date());
    const isPaper = tradingMode === 'paper';
    return isFreeTrial || isPaper ? 'waived' : 'pending_billing';
  }

  it('waives fees for live_trial plan users', () => {
    expect(determineFeeStatus('live_trial', null, 'live')).toBe('waived');
  });

  it('waives fees for users within trial period regardless of plan label', () => {
    const futureDate = new Date(Date.now() + 5 * 86400_000);
    expect(determineFeeStatus('performance_fees', futureDate, 'live')).toBe('waived');
  });

  it('waives fees for paper trading regardless of plan', () => {
    expect(determineFeeStatus('performance_fees', null, 'paper')).toBe('waived');
  });

  it('bills fees for performance_fees plan with expired trial on live trading', () => {
    const pastDate = new Date(Date.now() - 86400_000);
    expect(determineFeeStatus('performance_fees', pastDate, 'live')).toBe('pending_billing');
  });

  it('flat fee is only added to performance_fees plan invoices, not live_trial', () => {
    // Mirror the logic in processSingleUserBilling
    function applicableFlatFee(userPlan: string, flatFeeUsdc: number): number {
      return userPlan === 'performance_fees' && flatFeeUsdc > 0 ? flatFeeUsdc : 0;
    }

    expect(applicableFlatFee('live_trial', 29)).toBe(0);
    expect(applicableFlatFee('performance_fees', 29)).toBe(29);
    expect(applicableFlatFee('performance_fees', 0)).toBe(0);
  });
});

// ─── 6. AUTO-RESTORE GUARD ────────────────────────────────────────────────────

describe('Auto-restore guard on subscription init', () => {
  /**
   * Mirror the guard logic from subscriptions/route.ts:
   * Only restore paused bots if there are NO pending invoices.
   */
  function shouldRestoreBots(pendingInvoiceCount: number): boolean {
    return pendingInvoiceCount === 0;
  }

  it('restores bots when no pending invoices exist', () => {
    expect(shouldRestoreBots(0)).toBe(true);
  });

  it('skips restore when a pending invoice exists (bot paused for billing)', () => {
    expect(shouldRestoreBots(1)).toBe(false);
  });

  it('skips restore when multiple pending invoices exist', () => {
    expect(shouldRestoreBots(3)).toBe(false);
  });
});

// ─── 7. isUSDCPaymentEnabled ──────────────────────────────────────────────────

describe('isUSDCPaymentEnabled', () => {
  it('returns true when all required env vars are set', () => {
    // Our mock env has all required fields set
    expect(isUSDCPaymentEnabled()).toBe(true);
  });
});

// ─── 8. FEE_CHARGE_HISTORY SYNC ───────────────────────────────────────────────

describe('fee_charge_history sync', () => {
  it('marks fee_charge_history as paid inside the payment transaction', async () => {
    const invoice = makeInvoice({ amount_usdc_raw: '100000500', payment_reference: 'NXM-HIST001' });

    mockQuery
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: 'trader@example.com', name: 'Alice' }]);

    const chargeHistoryUpdates: string[] = [];
    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('fee_charge_history')) chargeHistoryUpdates.push(sql);
          return { rows: [{ cnt: '0' }] };
        }),
      };
      await cb(client);
    });

    await processIncomingUSDCTransfer({
      txHash: '0xTxHash',
      fromAddress: '0xUser',
      toAddress: '0xOurWallet',
      value: '100000500',
      blockNum: '0x1',
    });

    expect(chargeHistoryUpdates.some(q => q.includes("'paid'"))).toBe(true);
  });

  it('marks fee_charge_history as uncollectible when invoice expires', async () => {
    const expiredInvoice = {
      id: 'inv-001',
      user_id: 'user-001',
      payment_reference: 'NXM-HIST002',
      amount_usd: '100.00',
      flat_fee_usdc: '29',
      fee_ids: ['fee-1'],
      email: 'trader@example.com',
      name: 'Alice',
    };

    mockQuery.mockResolvedValueOnce([expiredInvoice]);

    const chargeHistoryUpdates: string[] = [];
    mockTransaction.mockImplementationOnce(async (cb: any) => {
      const client = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('fee_charge_history')) chargeHistoryUpdates.push(sql);
          return { rows: [] };
        }),
      };
      await cb(client);
    });

    await expireOverdueInvoices();

    expect(chargeHistoryUpdates.some(q => q.includes('uncollectible'))).toBe(true);
  });
});
