/**
 * Email Provider Tests
 * Tests dual provider support with Mailgun as default
 */

import { sendEmail, getActiveProvider, sendTemplatedEmail, sendBatchEmails } from '../provider';
import * as mailgun from '../mailgun';
import * as resend from '../resend';

// Mock the provider modules
jest.mock('../mailgun');
jest.mock('../resend');

describe('Email Provider Abstraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('getActiveProvider', () => {
    it('should return mailgun as default when both are configured', () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';
      process.env.RESEND_API_KEY = 'test-resend-key';

      const provider = getActiveProvider();
      expect(provider).toBe('mailgun');
    });

    it('should return resend when only resend is configured', () => {
      delete process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_DOMAIN;
      process.env.RESEND_API_KEY = 'test-resend-key';

      const provider = getActiveProvider();
      expect(provider).toBe('resend');
    });

    it('should return mailgun as default when neither is configured', () => {
      delete process.env.MAILGUN_API_KEY;
      delete process.env.MAILGUN_DOMAIN;
      delete process.env.RESEND_API_KEY;

      const provider = getActiveProvider();
      expect(provider).toBe('mailgun');
    });
  });

  describe('sendEmail', () => {
    it('should use mailgun provider when both are available', async () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';

      const mockSendEmail = mailgun.sendEmail as jest.Mock;
      mockSendEmail.mockResolvedValue({ id: 'mailgun-123' });

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(mockSendEmail).toHaveBeenCalled();
      expect(result.id).toBe('mailgun-123');
    });

    it('should fallback to resend if mailgun fails', async () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';
      process.env.RESEND_API_KEY = 'test-resend-key';

      const mockMailgunSendEmail = mailgun.sendEmail as jest.Mock;
      const mockResendSendEmail = resend.sendEmail as jest.Mock;

      mockMailgunSendEmail.mockRejectedValue(new Error('Mailgun failed'));
      mockResendSendEmail.mockResolvedValue({ id: 'resend-123' });

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(mockMailgunSendEmail).toHaveBeenCalled();
      expect(mockResendSendEmail).toHaveBeenCalled();
      expect(result.id).toBe('resend-123');
    });

    it('should throw error if all providers fail', async () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';

      const mockMailgunSendEmail = mailgun.sendEmail as jest.Mock;
      const mockResendSendEmail = resend.sendEmail as jest.Mock;

      mockMailgunSendEmail.mockRejectedValue(new Error('Mailgun failed'));
      mockResendSendEmail.mockRejectedValue(new Error('Resend failed'));

      await expect(
        sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Failed to send email with all providers');
    });
  });

  describe('sendTemplatedEmail', () => {
    it('should send templated email via active provider', async () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';

      const mockSendEmail = mailgun.sendEmail as jest.Mock;
      mockSendEmail.mockResolvedValue({ id: 'mailgun-456' });

      const result = await sendTemplatedEmail(
        'user@example.com',
        'Welcome',
        '<p>Welcome!</p>',
        'Welcome!',
        'noreply@nexusmeme.com'
      );

      expect(result.id).toBe('mailgun-456');
    });
  });

  describe('sendBatchEmails', () => {
    it('should send multiple emails via active provider', async () => {
      process.env.MAILGUN_API_KEY = 'test-key';
      process.env.MAILGUN_DOMAIN = 'test-domain';

      const mockBatchEmails = mailgun.sendBatchEmails as jest.Mock;
      mockBatchEmails.mockResolvedValue([
        { id: 'mailgun-1' },
        { id: 'mailgun-2' },
      ]);

      const result = await sendBatchEmails([
        {
          to: 'user1@example.com',
          subject: 'Test 1',
          html: '<p>Test 1</p>',
        },
        {
          to: 'user2@example.com',
          subject: 'Test 2',
          html: '<p>Test 2</p>',
        },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mailgun-1');
      expect(result[1].id).toBe('mailgun-2');
    });
  });
});

describe('Email Provider Configuration', () => {
  it('Mailgun should be the default/primary provider when both are configured', () => {
    // Priority: Mailgun (PRIMARY) → Resend (FALLBACK) → Mailgun Default
    process.env.MAILGUN_API_KEY = 'test-key';
    process.env.MAILGUN_DOMAIN = 'test-domain';
    process.env.RESEND_API_KEY = 'test-resend-key';

    expect(getActiveProvider()).toBe('mailgun');
  });

  it('Mailgun should always be the default choice, even without credentials', () => {
    // Mailgun is the default - use it even in mock mode
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    delete process.env.RESEND_API_KEY;

    expect(getActiveProvider()).toBe('mailgun');
  });

  it('Resend should be used only when Mailgun is not configured', () => {
    // If Mailgun not available, fall back to Resend
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    process.env.RESEND_API_KEY = 'test-resend-key';

    expect(getActiveProvider()).toBe('resend');
  });

  it('Should demonstrate provider priority: Mailgun > Resend > Mailgun Default', () => {
    // This test documents the complete priority chain
    const scenarios = [
      {
        mailgun: true,
        resend: true,
        expected: 'mailgun',
        description: 'Both configured → Mailgun (PRIMARY)',
      },
      {
        mailgun: false,
        resend: true,
        expected: 'resend',
        description: 'Only Resend configured → Resend (FALLBACK)',
      },
      {
        mailgun: true,
        resend: false,
        expected: 'mailgun',
        description: 'Only Mailgun configured → Mailgun (PRIMARY)',
      },
      {
        mailgun: false,
        resend: false,
        expected: 'mailgun',
        description: 'Neither configured → Mailgun (DEFAULT)',
      },
    ];

    scenarios.forEach((scenario) => {
      if (scenario.mailgun) {
        process.env.MAILGUN_API_KEY = 'test-key';
        process.env.MAILGUN_DOMAIN = 'test-domain';
      } else {
        delete process.env.MAILGUN_API_KEY;
        delete process.env.MAILGUN_DOMAIN;
      }

      if (scenario.resend) {
        process.env.RESEND_API_KEY = 'test-key';
      } else {
        delete process.env.RESEND_API_KEY;
      }

      expect(getActiveProvider()).toBe(scenario.expected);
    });
  });
});
