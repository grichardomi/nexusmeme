'use client';

import React, { useState } from 'react';
import Link from 'next/link';

/**
 * Forgot Password Form Component
 * Handles password reset request
 */

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Request failed');
        return;
      }

      setSuccess(true);
      setEmail('');
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500 text-green-700 dark:text-green-200 px-4 py-3 rounded">
          <p className="font-medium">Check your email</p>
          <p className="text-sm mt-1">
            If an account exists with this email, you'll receive a password reset link within minutes.
          </p>
        </div>

        <div className="text-center">
          <Link href="/auth/signin" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Email Field */}
      <div>
        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
          className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
          disabled={isLoading}
          required
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-medium py-2 rounded transition"
      >
        {isLoading ? 'Sending...' : 'Send Reset Link'}
      </button>

      {/* Back to Sign In */}
      <div className="text-center text-sm text-slate-600 dark:text-slate-400">
        <Link href="/auth/signin" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}
