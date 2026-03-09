'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CheckEmailContent() {
  const params = useSearchParams();
  const email = params.get('email');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Check your inbox</h1>
          <p className="text-slate-400">
            We sent a verification link to{' '}
            {email ? <span className="text-white font-medium">{email}</span> : 'your email address'}.
            Click the link to activate your account.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-slate-500">Didn&apos;t receive it? Check your spam folder or</p>
          <Link
            href={`/auth/resend-verification${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="inline-block text-sm text-blue-400 hover:text-blue-300 underline"
          >
            resend the verification email
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-700">
          <Link
            href="/auth/signin"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
