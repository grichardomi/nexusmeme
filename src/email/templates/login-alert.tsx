import { EmailTemplate } from '@/types/email';
import { getLogoUrl, appUrl } from './shared';

interface LoginAlertEmailProps {
  name?: string;
  attemptCount: number;
  isLocked: boolean;
  lockedUntil?: string; // human-readable e.g. "15 minutes"
  resetUrl: string;
  ipAddress?: string;
}

export function LoginAlertEmailTemplate({
  name,
  attemptCount,
  isLocked,
  lockedUntil,
  resetUrl,
  ipAddress,
}: LoginAlertEmailProps): EmailTemplate {
  const subject = isLocked
    ? 'Your NexusMeme account has been locked'
    : `Security alert: ${attemptCount} failed login attempts on your account`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${isLocked ? '#dc2626' : '#d97706'}; color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; font-size: 16px; }
          .alert-box { background: ${isLocked ? '#fef2f2' : '#fffbeb'}; border: 1px solid ${isLocked ? '#fca5a5' : '#fcd34d'}; border-radius: 6px; padding: 16px; margin: 20px 0; }
          .meta { font-size: 13px; color: #666; margin-top: 8px; }
          h1 { margin: 0; font-size: 24px; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="text-align:center;margin-bottom:16px;">
              <img src="${getLogoUrl()}" alt="NexusMeme" width="80" style="border-radius:8px;" />
            </div>
            <h1>${isLocked ? '🔒 Account Locked' : '⚠️ Security Alert'}</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>

            ${isLocked ? `
            <div class="alert-box">
              <strong>Your account has been temporarily locked</strong> after ${attemptCount} consecutive failed login attempts.
              ${lockedUntil ? `<p>The lock will lift automatically in <strong>${lockedUntil}</strong>.</p>` : ''}
            </div>
            <p>If this was you — perhaps you forgot your password — use the button below to reset it and regain access immediately:</p>
            ` : `
            <div class="alert-box">
              We detected <strong>${attemptCount} failed login attempts</strong> on your NexusMeme account.
              ${ipAddress ? `<p class="meta">Source: ${ipAddress}</p>` : ''}
            </div>
            <p>If this was you, you can safely ignore this email.</p>
            <p>If you did <strong>not</strong> attempt to log in, your account may be under attack. We recommend resetting your password now:</p>
            `}

            <table cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="border-radius:4px;background-color:#667eea;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;">
                    Reset My Password
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:13px;color:#666;">This link expires in 24 hours. If you didn't request it, you can ignore it — your password won't change.</p>

            <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
            <p style="font-size:13px;color:#666;">
              <strong>If you're locked out and don't want to reset your password:</strong><br>
              Your account will unlock automatically ${lockedUntil ? `in ${lockedUntil}` : 'shortly'}. Then sign in normally.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="${appUrl('/privacy')}" style="color:#667eea;text-decoration:none;">Privacy Policy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = isLocked
    ? `Hi ${name || 'Trader'},\n\nYour NexusMeme account has been temporarily locked after ${attemptCount} failed login attempts.${lockedUntil ? ` It will unlock in ${lockedUntil}.` : ''}\n\nReset your password to regain access immediately:\n${resetUrl}\n\nIf you didn't attempt to log in, please reset your password to secure your account.\n\nThe NexusMeme Team`
    : `Hi ${name || 'Trader'},\n\nWe detected ${attemptCount} failed login attempts on your NexusMeme account.${ipAddress ? ` Source: ${ipAddress}` : ''}\n\nIf this wasn't you, reset your password now:\n${resetUrl}\n\nIf it was you, you can ignore this email.\n\nThe NexusMeme Team`;

  return { subject, html, text };
}
