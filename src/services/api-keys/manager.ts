import { query, transaction } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt, decrypt } from '@/lib/crypto';
import { getExchangeAdapter } from '@/services/exchanges/singleton';
import type { ApiKeys } from '@/types/exchange';

/**
 * API Key Manager
 * Handles secure storage, encryption, retrieval of exchange API keys
 * CRITICAL: Never log plaintext keys
 */
export class ApiKeyManager {
  /**
   * Store encrypted API keys for user
   * Validates connection before storing
   */
  async storeKeys(userId: string, exchange: string, publicKey: string, secretKey: string): Promise<void> {
    logger.info('Storing API keys', { userId, exchange }); // Never log keys!

    try {
      // Validate keys work with exchange before storing
      const adapter = getExchangeAdapter(exchange);
      await adapter.connect({ publicKey, secretKey });
      const valid = await adapter.validateConnection();

      if (!valid) {
        throw new Error(`Failed to validate ${exchange} API keys`);
      }

      logger.info('API keys validated', { exchange });

      // Encrypt keys
      const encryptedPublic = encrypt(publicKey);
      const encryptedSecret = encrypt(secretKey);

      // Store in database
      await query(
        `INSERT INTO exchange_api_keys (id, user_id, exchange, encrypted_public_key, encrypted_secret_key, validated_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id, exchange) DO UPDATE SET
         encrypted_public_key = $3,
         encrypted_secret_key = $4,
         validated_at = NOW()`,
        [userId, exchange, encryptedPublic, encryptedSecret]
      );

      logger.info('API keys stored', { userId, exchange });
    } catch (error) {
      logger.error('Failed to store API keys', error instanceof Error ? error : null, {
        userId,
        exchange,
      });
      throw error;
    }
  }

  /**
   * Retrieve and decrypt API keys
   * Returns null if not found
   */
  async getKeys(userId: string, exchange: string): Promise<ApiKeys | null> {
    try {
      const result = await query<{
        encrypted_public_key: string;
        encrypted_secret_key: string;
      }>(
        `SELECT encrypted_public_key, encrypted_secret_key
         FROM exchange_api_keys
         WHERE user_id = $1 AND exchange = $2`,
        [userId, exchange]
      );

      if (result.length === 0) {
        logger.warn('API keys not found', { userId, exchange });
        return null;
      }

      const row = result[0];

      // Decrypt keys
      const publicKey = decrypt(row.encrypted_public_key);
      const secretKey = decrypt(row.encrypted_secret_key);

      logger.debug('API keys retrieved', { userId, exchange }); // Safe log

      return { publicKey, secretKey };
    } catch (error) {
      logger.error('Failed to retrieve API keys', error instanceof Error ? error : null, {
        userId,
        exchange,
      });
      throw error;
    }
  }

  /**
   * Validate API keys work with exchange
   */
  async validateConnection(exchange: string, keys: ApiKeys): Promise<boolean> {
    try {
      logger.info('Validating API keys', { exchange }); // Never log keys!

      const adapter = getExchangeAdapter(exchange);
      await adapter.connect(keys);
      const valid = await adapter.validateConnection();

      if (valid) {
        logger.info('API keys validation successful', { exchange });
      } else {
        logger.warn('API keys validation failed', { exchange });
      }

      return valid;
    } catch (error) {
      logger.error('Failed to validate API keys', error instanceof Error ? error : null, {
        exchange,
      });
      return false;
    }
  }

  /**
   * Delete API keys
   */
  async deleteKeys(userId: string, exchange: string): Promise<void> {
    try {
      await query(
        `DELETE FROM exchange_api_keys
         WHERE user_id = $1 AND exchange = $2`,
        [userId, exchange]
      );

      logger.info('API keys deleted', { userId, exchange });
    } catch (error) {
      logger.error('Failed to delete API keys', error instanceof Error ? error : null, {
        userId,
        exchange,
      });
      throw error;
    }
  }

  /**
   * List exchanges user has keys for
   */
  async listConnectedExchanges(userId: string): Promise<string[]> {
    try {
      const result = await query<{ exchange: string }>(
        `SELECT DISTINCT exchange FROM exchange_api_keys WHERE user_id = $1`,
        [userId]
      );

      const exchanges = result.map(r => r.exchange);
      logger.info('Listed connected exchanges', { userId, count: exchanges.length });

      return exchanges;
    } catch (error) {
      logger.error('Failed to list connected exchanges', error instanceof Error ? error : null, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Rotate API keys (replace old with new)
   * Used when user wants to update their API keys
   */
  async rotateKeys(
    userId: string,
    exchange: string,
    newPublicKey: string,
    newSecretKey: string
  ): Promise<void> {
    try {
      logger.info('Rotating API keys', { userId, exchange }); // Never log keys!

      // Validate new keys work
      const valid = await this.validateConnection(exchange, {
        publicKey: newPublicKey,
        secretKey: newSecretKey,
      });

      if (!valid) {
        throw new Error(`New ${exchange} API keys failed validation`);
      }

      // Store new keys in transaction
      await transaction(async client => {
        const encryptedPublic = encrypt(newPublicKey);
        const encryptedSecret = encrypt(newSecretKey);

        // Update with new keys
        await client.query(
          `UPDATE exchange_api_keys
           SET encrypted_public_key = $1, encrypted_secret_key = $2, validated_at = NOW()
           WHERE user_id = $3 AND exchange = $4`,
          [encryptedPublic, encryptedSecret, userId, exchange]
        );
      });

      logger.info('API keys rotated', { userId, exchange });
    } catch (error) {
      logger.error('Failed to rotate API keys', error instanceof Error ? error : null, {
        userId,
        exchange,
      });
      throw error;
    }
  }

  /**
   * Get last validation time for keys
   */
  async getLastValidated(userId: string, exchange: string): Promise<Date | null> {
    try {
      const result = await query<{ validated_at: string }>(
        `SELECT validated_at FROM exchange_api_keys
         WHERE user_id = $1 AND exchange = $2`,
        [userId, exchange]
      );

      if (result.length === 0) {
        return null;
      }

      return new Date(result[0].validated_at);
    } catch (error) {
      logger.error('Failed to get last validated time', error instanceof Error ? error : null);
      return null;
    }
  }
}

// Export singleton instance
export const apiKeyManager = new ApiKeyManager();
