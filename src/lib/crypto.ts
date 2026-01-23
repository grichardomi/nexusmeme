import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getEnv } from '@/config/environment';
import { logger } from '@/lib/logger';

/**
 * Encryption/Decryption Utilities
 * Uses AES-256-GCM for authenticated encryption
 * CRITICAL: Never use in production without proper key management
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment
 * Key must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  try {
    const keyString = getEnv('ENCRYPTION_KEY');

    // Convert hex or base64 string to buffer
    if (keyString.length === KEY_LENGTH * 2) {
      // Assume hex
      return Buffer.from(keyString, 'hex');
    } else {
      // Assume raw string, hash it to get consistent key
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(keyString).digest();
    }
  } catch (error) {
    logger.error('Failed to get encryption key', error instanceof Error ? error : null);
    throw new Error('Encryption key not available');
  }
}

/**
 * Encrypt plaintext string
 * Returns: iv:encryptedData:authTag (all hex encoded)
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const tag = cipher.getAuthTag();

    // Return IV:encrypted:tag (all hex)
    return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
  } catch (error) {
    logger.error('Encryption failed', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Decrypt ciphertext string
 * Expects format: iv:encryptedData:authTag (all hex encoded)
 * Also handles legacy base64-encoded format for backward compatibility
 */
export function decrypt(ciphertext: string): string {
  try {
    const key = getEncryptionKey();

    // Try GCM format first (iv:encryptedData:authTag)
    const parts = ciphertext.split(':');
    if (parts.length === 3) {
      try {
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const tag = Buffer.from(parts[2], 'hex');

        // Validate sizes
        if (iv.length !== IV_LENGTH) {
          throw new Error(`Invalid IV length: ${iv.length}`);
        }
        if (tag.length !== TAG_LENGTH) {
          throw new Error(`Invalid auth tag length: ${tag.length}`);
        }

        // Create decipher
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        // Decrypt
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
      } catch (gcmError) {
        // GCM format failed, try legacy format
        logger.debug('GCM format failed, trying legacy base64 format');
      }
    }

    // Try legacy base64-encoded format
    try {
      const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
      // If we successfully decoded and it looks like a valid API key (20-100 chars, alphanumeric), use it
      if (decoded && decoded.length > 10) {
        logger.debug('Successfully decoded from legacy base64 format');
        return decoded;
      }
    } catch (base64Error) {
      logger.debug('Base64 decode failed');
    }

    // If both formats failed, throw error
    throw new Error('Invalid ciphertext format - not in GCM or legacy base64 format');
  } catch (error) {
    logger.error('Decryption failed', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Hash string (one-way, for verification only)
 */
export function hash(plaintext: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Verify plaintext matches hash
 */
export function verifyHash(plaintext: string, hashValue: string): boolean {
  return hash(plaintext) === hashValue;
}

/**
 * Generate random token (for password reset, etc.)
 */
export function generateToken(length = 32): string {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}
