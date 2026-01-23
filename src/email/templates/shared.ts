import { getLogoSrcForEmail } from '@/utils/email-image-utils';

export { getLogoSrcForEmail as getLogoUrl };

/**
 * Logo URL for email templates
 *
 * STRATEGY:
 * - Embeds logo as base64 data URL directly in email HTML
 * - Image displays inline in email body (not as attachment)
 * - Works on localhost and production
 * - Works in ALL email clients including Gmail
 *
 * ADVANTAGES:
 * - Works on localhost without HTTPS issues
 * - Works offline (no external requests needed)
 * - Works in all email clients including Gmail
 * - Image displays in email body, not as attachment
 * - No blocked content warnings
 * - Simple and reliable implementation
 *
 * EXAMPLE: <img src="data:image/png;base64,iVBORw0KGg..." />
 *
 * USAGE IN TEMPLATES:
 * Instead of: const logoUrl = getLogoUrl()
 * Use: ${getLogoUrl()}  in template strings
 */
