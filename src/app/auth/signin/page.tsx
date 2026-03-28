'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { SignInForm } from '@/components/auth/SignInForm';

export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  if (status === 'authenticated') return null;

  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your trading account">
      <SignInForm />
    </AuthLayout>
  );
}
