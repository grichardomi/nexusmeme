import { AuthLayout } from '@/components/layouts/AuthLayout';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

/**
 * Reset Password Page
 * Password reset confirmation page
 */

export const metadata = {
  title: 'Reset Password - NexusMeme Trading',
  description: 'Reset your NexusMeme account password',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  if (!params.token) {
    return (
      <AuthLayout title="Invalid Link" subtitle="The password reset link is missing or invalid">
        <div className="text-center space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            The password reset link appears to be invalid or has expired.
          </p>
          <a href="/auth/forgot-password" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            Request a new reset link
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set New Password" subtitle="Enter your new password">
      <ResetPasswordForm token={params.token} />
    </AuthLayout>
  );
}
