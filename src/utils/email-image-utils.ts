import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Email image utility for embedding images in email templates
 * Embeds images as base64 data URLs directly in HTML
 * This ensures the image displays inline in the email body (not as attachment)
 * Works in all email clients including Gmail
 */

/**
 * Get base64 encoded logo as data URL
 * Used for embedding directly in email HTML img src attribute
 * Example: <img src="data:image/png;base64,iVBORw0KGg..." />
 */
export function getLogoDataUrl(): string {
  try {
    const logoPath = join(process.cwd(), 'public', 'logo.png');
    const imageBuffer = readFileSync(logoPath);
    const base64 = imageBuffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('Failed to read logo file:', error);
    // Return a minimal transparent PNG as fallback
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
}

/**
 * Get the image reference for use in email HTML
 * Always uses base64 data URL embedding for maximum compatibility.
 * Gmail blocks non-HTTPS image URLs, so base64 is the most reliable
 * approach across all environments (dev, staging, production).
 */
export function getLogoSrcForEmail(): string {
  return getLogoDataUrl();
}
