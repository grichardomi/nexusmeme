import { query, transaction } from '@/lib/db';
import { generateToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { jobQueueManager } from '@/services/job-queue/singleton';

/**
 * Email Verification Service
 * Handles email verification flow with tokens
 */
export class EmailVerificationService {
  private tokenExpiryMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate and send verification email
   */
  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    try {
      // Generate unique token
      const token = generateToken(32);
      const expiresAt = new Date(Date.now() + this.tokenExpiryMs);

      // Store token
      await transaction(async client => {
        // Delete any existing tokens for this user
        await client.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);

        // Create new token
        await client.query(
          `INSERT INTO email_verification_tokens (user_id, token, expires_at)
           VALUES ($1, $2, $3)`,
          [userId, token, expiresAt]
        );
      });

      // Queue email job
      await jobQueueManager.enqueue(
        'send_email',
        {
          to: email,
          subject: 'Verify your NexusMeme account',
          template: 'email-verification',
          variables: {
            verificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${token}`,
            expiresIn: '24 hours',
          },
        },
        { priority: 8, maxRetries: 3 }
      );

      logger.info('Verification email queued', { userId, email });
    } catch (error) {
      logger.error('Failed to send verification email', error instanceof Error ? error : null, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{ userId: string; email: string } | null> {
    try {
      // Find valid token
      const result = await query<{
        user_id: string;
        expires_at: string;
      }>(
        `SELECT user_id, expires_at FROM email_verification_tokens
         WHERE token = $1 AND expires_at > NOW()`,
        [token]
      );

      if (result.length === 0) {
        logger.warn('Invalid or expired verification token');
        return null;
      }

      const { user_id } = result[0];

      // Update user
      await transaction(async client => {
        // Mark user as verified
        await client.query(
          `UPDATE users SET email_verified = true, email_verified_at = NOW()
           WHERE id = $1`,
          [user_id]
        );

        // Delete token
        await client.query(`DELETE FROM email_verification_tokens WHERE token = $1`, [token]);
      });

      // Get user email
      const userResult = await query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [user_id]
      );

      if (userResult.length > 0) {
        logger.info('Email verified', { userId: user_id });
        return {
          userId: user_id,
          email: userResult[0].email,
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to verify email', error instanceof Error ? error : null);
      throw error;
    }
  }

  /**
   * Check if email is verified
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    try {
      const result = await query<{ email_verified: boolean }>(
        `SELECT email_verified FROM users WHERE id = $1`,
        [userId]
      );

      return result.length > 0 && result[0].email_verified;
    } catch (error) {
      logger.error('Failed to check email verification', error instanceof Error ? error : null, {
        userId,
      });
      return false;
    }
  }
}

// Export singleton instance
export const emailVerificationService = new EmailVerificationService();
