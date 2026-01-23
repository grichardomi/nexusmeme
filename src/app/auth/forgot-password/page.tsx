import { AuthLayout } from '@/components/layouts/AuthLayout';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

/**
 * Forgot Password Page
 * Password reset request page
 */

export const metadata = {
  title: 'Forgot Password - NexusMeme Trading',
  description: 'Reset your NexusMeme account password',
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Reset Your Password" subtitle="We'll send you a link to reset your password">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
