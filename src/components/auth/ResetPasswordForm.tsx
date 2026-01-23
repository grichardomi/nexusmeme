'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Reset Password Form Component
 * Handles password reset with token
 */

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const passwordStrength = {
    hasLength: formData.password.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.password),
    hasLowercase: /[a-z]/.test(formData.password),
    hasNumber: /\d/.test(formData.password),
  };

  const isPasswordValid = Object.values(passwordStrength).every(v => v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!isPasswordValid) {
      setError('Password does not meet requirements');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Reset failed');
        return;
      }

      setSuccess(true);

      // Redirect to sign in after delay
      setTimeout(() => {
        router.push('/auth/signin');
      }, 2000);
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
          <p className="font-medium">Password Reset Successful</p>
          <p className="text-sm mt-1">
            Your password has been reset. Redirecting to sign in...
          </p>
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

      {/* Password Field */}
      <div>
        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">New Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
            disabled={isLoading}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300"
            disabled={isLoading}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>

        {/* Password Strength Indicator */}
        {formData.password && (
          <div className="mt-3 space-y-1 text-xs">
            <div className={passwordStrength.hasLength ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-400'}>
              ✓ At least 8 characters
            </div>
            <div className={passwordStrength.hasUppercase ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-400'}>
              ✓ Uppercase letter
            </div>
            <div className={passwordStrength.hasLowercase ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-400'}>
              ✓ Lowercase letter
            </div>
            <div className={passwordStrength.hasNumber ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-400'}>
              ✓ Number
            </div>
          </div>
        )}
      </div>

      {/* Confirm Password Field */}
      <div>
        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Confirm Password</label>
        <input
          type="password"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder="••••••••"
          className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
          disabled={isLoading}
          required
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !isPasswordValid}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-medium py-2 rounded transition"
      >
        {isLoading ? 'Resetting...' : 'Reset Password'}
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
