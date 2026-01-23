'use client';

import { AuthLayout } from '@/components/layouts/AuthLayout';
import { SignUpForm } from '@/components/auth/SignUpForm';

/**
 * Sign Up Page
 * User registration page with light/dark mode support
 */

export default function SignUpPage() {
  return (
    <AuthLayout title="Create Account" subtitle="Get a 10-day free trial with $200 to test live trading">
      <SignUpForm />
    </AuthLayout>
  );
}
