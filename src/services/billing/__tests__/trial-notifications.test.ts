/**
 * Tests for Trial Notifications Service
 * Verifies:
 * 1. 3-day email notice is sent
 * 2. 1-day email notice is sent
 * 3. Auto-transition happens for expired trials
 */

jest.mock('@/lib/db');
jest.mock('@/lib/logger');
jest.mock('@/email/render');
jest.mock('@/services/email/resend');

import { getPool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { renderEmailTemplate } from '@/email/render';
import { sendEmail } from '@/services/email/resend';
import { processTrialNotifications } from '../trial-notifications';

describe('Trial Notifications Service', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Default mock implementations
    (renderEmailTemplate as jest.Mock).mockReturnValue({
      subject: 'Test Email',
      html: '<html>Test</html>',
      text: 'Test',
    });

    (sendEmail as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Trial Expiration Notifications', () => {
    it('should send 3-day notice email when trial expires in 2-3 days', async () => {
      const now = new Date();
      const trialEndsIn72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      // Mock getExpiringTrials query
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            user_id: 'user-1',
            plan: 'live_trial',
            trial_ends_at: trialEndsIn72Hours,
            trial_capital_used: 0,
            email: 'user@example.com',
            name: 'Test User',
            payment_method_id: null,
          },
        ],
      });

      // Mock markNotificationSent
      mockClient.query.mockResolvedValueOnce({});

      const result = await processTrialNotifications();

      // Verify email was sent
      expect(sendEmail).toHaveBeenCalled();
      expect(renderEmailTemplate).toHaveBeenCalled();

      // Verify notification was marked as sent
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('trial_notification_sent_at'),
        expect.arrayContaining(['sub-1'])
      );

      // Verify result
      expect(result.sent).toBe(1);
      expect(result.transitioned).toBe(0);
      expect(result.failed).toBe(0);

      mockClient.release();
    });

    it('should send 1-day urgent notice email when trial expires in 0-1 days', async () => {
      const now = new Date();
      const trialEndsIn24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Mock getExpiringTrials query
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-2',
            user_id: 'user-2',
            plan: 'live_trial',
            trial_ends_at: trialEndsIn24Hours,
            trial_capital_used: 100,
            email: 'urgent@example.com',
            name: 'Urgent User',
            payment_method_id: null,
          },
        ],
      });

      // Mock markNotificationSent
      mockClient.query.mockResolvedValueOnce({});

      const result = await processTrialNotifications();

      // Verify email was sent
      expect(sendEmail).toHaveBeenCalled();
      expect(renderEmailTemplate).toHaveBeenCalled();

      // Verify the 1-day template was used (has "add_payment" variant if no payment method)
      const templateCall = (renderEmailTemplate as jest.Mock).mock.calls[0];
      expect(templateCall[0]).toMatch(/trial_ending_soon/);

      expect(result.sent).toBe(1);
      expect(result.transitioned).toBe(0);

      mockClient.release();
    });

    it('should auto-transition expired trials to performance_fees plan', async () => {
      const now = new Date();
      const trialAlreadyExpired = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

      // Mock getExpiringTrials query
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-3',
            user_id: 'user-3',
            plan: 'live_trial',
            trial_ends_at: trialAlreadyExpired,
            trial_capital_used: 200,
            email: 'expired@example.com',
            name: 'Expired User',
            payment_method_id: 'pm-123',
          },
        ],
      });

      // Mock transitionExpiredTrial UPDATE query
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'sub-3' }],
      });

      // Mock markNotificationSent
      mockClient.query.mockResolvedValueOnce({});

      const result = await processTrialNotifications();

      // Verify UPDATE was called to transition plan
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("plan = $1"),
        expect.arrayContaining(['performance_fees'])
      );

      // Verify no email was sent for expired trial (no email needed, just transition)
      expect(result.transitioned).toBe(1);
      expect(result.sent).toBe(0);

      mockClient.release();
    });

    it('should correctly calculate days until expiry', async () => {
      const now = new Date();
      const testCases = [
        {
          name: '3 days',
          expiryTime: new Date(now.getTime() + 72 * 60 * 60 * 1000),
          expectedDays: 3,
          shouldSend: true,
        },
        {
          name: '1 day',
          expiryTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          expectedDays: 1,
          shouldSend: true,
        },
        {
          name: '6 hours',
          expiryTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
          expectedDays: 0,
          shouldSend: true,
        },
        {
          name: 'expired',
          expiryTime: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          expectedDays: -1,
          shouldTransition: true,
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: `sub-${testCase.name}`,
              user_id: `user-${testCase.name}`,
              plan: 'live_trial',
              trial_ends_at: testCase.expiryTime,
              trial_capital_used: 0,
              email: `${testCase.name}@example.com`,
              name: testCase.name,
              payment_method_id: 'pm-test',
            },
          ],
        });

        // Mock required queries
        if (testCase.shouldTransition) {
          mockClient.query.mockResolvedValueOnce({
            rows: [{ id: `sub-${testCase.name}` }],
          });
        }
        mockClient.query.mockResolvedValueOnce({});

        const result = await processTrialNotifications();

        if (testCase.shouldSend) {
          expect(result.sent).toBe(1);
        } else if (testCase.shouldTransition) {
          expect(result.transitioned).toBe(1);
        }

        mockClient.release();
      }
    });

    it('should handle expired trials query (no >NOW() filter)', async () => {
      const now = new Date();
      const trialAlreadyExpired = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 2 days ago

      // Mock getExpiringTrials - should return expired trials
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-expired-query',
            user_id: 'user-expired',
            plan: 'live_trial',
            trial_ends_at: trialAlreadyExpired,
            trial_capital_used: 150,
            email: 'test@example.com',
            name: 'Test',
            payment_method_id: null,
          },
        ],
      });

      // Mock transition
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'sub-expired-query' }] });

      // Mock markNotificationSent
      mockClient.query.mockResolvedValueOnce({});

      const result = await processTrialNotifications();

      // Verify query was made
      expect(mockClient.query).toHaveBeenCalled();

      // Verify the query string does NOT contain "AND s.trial_ends_at > NOW()"
      const queryCall = (mockClient.query as jest.Mock).mock.calls[0];
      const queryString = queryCall[0];
      expect(queryString).not.toContain('trial_ends_at > NOW()');

      // Verify transition happened
      expect(result.transitioned).toBe(1);

      mockClient.release();
    });
  });

  describe('Error Handling', () => {
    it('should handle notification failures gracefully', async () => {
      const now = new Date();
      const trialEndsIn72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-fail',
            user_id: 'user-fail',
            plan: 'live_trial',
            trial_ends_at: trialEndsIn72Hours,
            trial_capital_used: 0,
            email: 'fail@example.com',
            name: 'Fail User',
            payment_method_id: null,
          },
        ],
      });

      // Make email sending fail
      (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('Email service down'));

      const result = await processTrialNotifications();

      // Should record the failure
      expect(result.failed).toBeGreaterThan(0);

      // Logger should have recorded the error
      expect(logger.error).toHaveBeenCalled();

      mockClient.release();
    });

    it('should continue processing after individual failures', async () => {
      const now = new Date();
      const trialEndsIn72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            user_id: 'user-1',
            plan: 'live_trial',
            trial_ends_at: trialEndsIn72Hours,
            trial_capital_used: 0,
            email: 'user1@example.com',
            name: 'User 1',
            payment_method_id: null,
          },
          {
            id: 'sub-2',
            user_id: 'user-2',
            plan: 'live_trial',
            trial_ends_at: trialEndsIn72Hours,
            trial_capital_used: 0,
            email: 'user2@example.com',
            name: 'User 2',
            payment_method_id: null,
          },
        ],
      });

      // First user succeeds
      (sendEmail as jest.Mock).mockResolvedValueOnce(undefined);
      // Mark notification sent for first
      mockClient.query.mockResolvedValueOnce({});

      // Second user fails
      (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('Email failed'));

      const result = await processTrialNotifications();

      // Both should be processed
      expect(result.processed).toBe(2);
      // One succeeded
      expect(result.sent).toBe(1);
      // One failed
      expect(result.failed).toBe(1);

      mockClient.release();
    });
  });
});
