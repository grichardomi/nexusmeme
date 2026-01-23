'use client';

import { AuthLayout } from '@/components/layouts/AuthLayout';
import { SignInForm } from '@/components/auth/SignInForm';

/**
 * Sign In Page
 * User login page with light/dark mode support
 */

export default function SignInPage() {
  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your trading account">
      <SignInForm />
    </AuthLayout>
  );
}
