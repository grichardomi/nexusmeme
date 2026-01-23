import { query, transaction } from '@/lib/db';
import { generateToken, hash } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { jobQueueManager } from '@/services/job-queue/singleton';

/**
 * Password Reset Service
 * Handles password reset flow with secure tokens
 */
export class PasswordResetService {
  private tokenExpiryMs = 60 * 60 * 1000; // 1 hour

  /**
   * Request password reset
   */
  async requestReset(email: string): Promise<void> {
    try {
      // Find user by email
      const result = await query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (result.length === 0) {
        // Don't reveal if email exists
        logger.info('Password reset requested for non-existent email', { email });
        return;
      }

      const userId = result[0].id;

      // Generate reset token
      const token = generateToken(32);
      const expiresAt = new Date(Date.now() + this.tokenExpiryMs);

      // Store token
      await transaction(async client => {
        // Delete any existing unused tokens
        await client.query(
          `DELETE FROM password_reset_tokens
           WHERE user_id = $1 AND used_at IS NULL`,
          [userId]
        );

        // Create new token
        await client.query(
          `INSERT INTO password_reset_tokens (user_id, token, expires_at)
           VALUES ($1, $2, $3)`,
          [userId, token, expiresAt]
        );
      });

      // Queue reset email job
      await jobQueueManager.enqueue(
        'send_email',
        {
          to: email,
          subject: 'Reset your NexusMeme password',
          template: 'password-reset',
          variables: {
            resetUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`,
            expiresIn: '1 hour',
          },
        },
        { priority: 7, maxRetries: 3 }
      );

      logger.info('Password reset email queued', { userId });
    } catch (error) {
      logger.error('Failed to request password reset', error instanceof Error ? error : null, {
        email,
      });
      throw error;
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ userId: string } | null> {
    try {
      // Validate token and get user
      const result = await query<{ user_id: string; expires_at: string }>(
        `SELECT user_id, expires_at FROM password_reset_tokens
         WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
        [token]
      );

      if (result.length === 0) {
        logger.warn('Invalid or expired password reset token');
        return null;
      }

      const userId = result[0].user_id;

      // Validate password
      if (!this.validatePassword(newPassword)) {
        throw new Error('Password does not meet requirements');
      }

      // Hash new password
      const passwordHash = hash(newPassword);

      // Update password in transaction
      await transaction(async client => {
        // Update user password
        await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
          passwordHash,
          userId,
        ]);

        // Mark token as used
        await client.query(
          `UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`,
          [token]
        );
      });

      logger.info('Password reset completed', { userId });

      return { userId };
    } catch (error) {
      logger.error('Failed to reset password', error instanceof Error ? error : null);
      throw error;
    }
  }

  /**
   * Validate password requirements
   */
  private validatePassword(password: string): boolean {
    // Minimum 8 characters
    if (password.length < 8) {
      return false;
    }

    // At least one uppercase, one lowercase, one number
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    return hasUppercase && hasLowercase && hasNumber;
  }

  /**
   * Get password validation error message
   */
  getPasswordValidationError(password: string): string | null {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }

    if (!/[A-Z]/.test(password)) {
      return 'Password must contain an uppercase letter';
    }

    if (!/[a-z]/.test(password)) {
      return 'Password must contain a lowercase letter';
    }

    if (!/\d/.test(password)) {
      return 'Password must contain a number';
    }

    return null;
  }
}

// Export singleton instance
export const passwordResetService = new PasswordResetService();
