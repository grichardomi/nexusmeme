import { getLogoSrcForEmail } from '@/utils/email-image-utils';

export { getLogoSrcForEmail as getLogoUrl };

/**
 * Returns the base app URL from NEXT_PUBLIC_APP_URL env var.
 * Falls back to https://nexusmeme.com in production if not set.
 * Use this for all links in email templates so they work in
 * both local dev (http://localhost:3000) and production.
 */
export function appUrl(path = ''): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://nexusmeme.com';
  return path ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : base;
}

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
