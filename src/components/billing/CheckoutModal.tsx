'use client';

import React, { useState } from 'react';
import { PRICING_PLANS } from '@/config/pricing';

/**
 * Checkout Modal Component
 * Handles plan selection and payment initiation
 */

interface CheckoutModalProps {
  plan: string;
  period: 'monthly' | 'yearly';
  onClose: () => void;
}

export function CheckoutModal({ plan, period, onClose }: CheckoutModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planConfig = PRICING_PLANS[plan as keyof typeof PRICING_PLANS];
  if (!planConfig) return null;

  const price = period === 'yearly' ? planConfig.yearlyPrice : planConfig.monthlyPrice;

  const handleCheckout = async () => {
    if (plan === 'free') {
      onClose();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, period }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full border border-slate-700">
        <h2 className="text-2xl font-bold text-white mb-4">Confirm Upgrade</h2>

        {/* Plan Summary */}
        <div className="bg-slate-700 rounded p-4 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-slate-300">Plan</span>
            <span className="text-white font-semibold">{planConfig.name}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-slate-300">Billing Period</span>
            <span className="text-white font-semibold">{period === 'yearly' ? 'Annual' : 'Monthly'}</span>
          </div>
          <div className="border-t border-slate-600 pt-2 mt-2 flex justify-between">
            <span className="text-slate-300">Total</span>
            <span className="text-white font-bold text-lg">
              ${price}/{period === 'yearly' ? 'year' : 'month'}
            </span>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mb-6">
          <p className="text-sm text-slate-400 mb-3">You'll get access to:</p>
          <ul className="space-y-2">
            {planConfig.features.slice(0, 4).map((feature, idx) => (
              <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 text-white py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCheckout}
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white py-2 rounded font-semibold transition"
          >
            {isLoading ? 'Processing...' : 'Continue to Payment'}
          </button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}
