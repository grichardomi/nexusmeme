'use client';

import { useEffect, useState } from 'react';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { SignUpForm } from '@/components/auth/SignUpForm';

/**
 * Sign Up Page
 * User registration page with light/dark mode support
 */

export default function SignUpPage() {
  const [trialDays, setTrialDays] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/billing/trial-days')
      .then(r => r.json())
      .then(d => setTrialDays(d.days ?? null))
      .catch(() => {});
  }, []);

  const subtitle = trialDays !== null
    ? `Get a ${trialDays}-day free trial to test live trading`
    : 'Get a free trial to test live trading';

  return (
    <AuthLayout title="Create Account" subtitle={subtitle}>
      <SignUpForm />
    </AuthLayout>
  );
}
