import { EmailTemplate } from '@/types/email';
import { getLogoUrl } from './shared';

interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
}

export function PasswordResetEmailTemplate({
  name,
  resetUrl,
}: PasswordResetEmailProps): EmailTemplate {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .logo-container { text-align: center; padding: 20px 0; }
          .logo-box { background: white; border-radius: 12px; padding: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .logo { max-width: 150px; width: 150px; height: auto; display: block; }
          .content { background: #f9f9f9; padding: 40px 20px; }
          .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .btn { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin: 20px 0; font-weight: 600; }
          .btn:hover { background: #5568d3; }
          h1 { margin: 0; font-size: 28px; }
          h3 { margin: 15px 0 10px 0; }
          p { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              <div class="logo-box">
                <img src="${getLogoUrl()}" alt="NexusMeme Logo" class="logo" width="150" height="150" style="max-width: 150px; width: 150px; height: auto; display: block;" />
              </div>
            </div>
            <h1>🔐 Reset Your Password</h1>
          </div>
          <div class="content">
            <p>Hi ${name || 'Trader'},</p>
            <p>You requested a password reset for your NexusMeme account.</p>
            <p><strong>Click the button below to reset your password:</strong></p>
            <a href="${resetUrl}" class="btn" style="background-color: #667eea; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: 600; margin: 20px 0; line-height: 1.5; font-size: 16px; letter-spacing: 0.3px;">Reset Password</a>
            <p style="font-size: 12px; color: #666;">This link will expire in 1 hour.</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email or contact support if you're concerned about your account security.
            </div>
            <h3>Didn't request a password reset?</h3>
            <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 NexusMeme. All rights reserved.</p>
            <p><a href="https://nexusmeme.com/support" style="color: #667eea; text-decoration: none;">Support</a> | <a href="https://nexusmeme.com/privacy" style="color: #667eea; text-decoration: none;">Privacy</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    subject: 'Reset Your NexusMeme Password',
    html,
    text: `
Reset Your Password

Hi ${name || 'Trader'},

You requested a password reset for your NexusMeme account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email.

Best regards,
The NexusMeme Team
    `,
  };
}
