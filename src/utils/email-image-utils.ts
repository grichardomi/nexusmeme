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
 * Returns a data URL that displays the image inline in the email body
 */
export function getLogoSrcForEmail(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_ORIGIN;
  if (origin) {
    const normalizedOrigin = origin.replace(/\/$/, '');
    return `${normalizedOrigin}/logo.png`;
  }

  // Fallback to embedded data URL if no public origin is configured
  return getLogoDataUrl();
}
