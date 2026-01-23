'use client';

import React, { useState, useEffect } from 'react';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';

/**
 * Payment Methods Component
 * Manages user's saved payment methods
 */

interface PaymentMethod {
  id: string;
  type: string;
  brand?: string;
  last4: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
  created_at: string;
}

export function PaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch('/api/billing/payment-methods');
      if (!response.ok) throw new Error('Failed to fetch payment methods');

      const data = await response.json();
      setPaymentMethods(data.paymentMethods);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment methods');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);

    try {
      const response = await fetch(`/api/billing/payment-methods?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete payment method');

      setPaymentMethods(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment method');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Loading payment methods...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (paymentMethods.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 mb-4">No payment methods saved yet.</p>
        <button className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition">
          Add Payment Method
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {paymentMethods.map(method => (
        <div key={method.id} className="bg-slate-700 rounded-lg p-6 flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            {/* Card Icon */}
            <div className="bg-slate-600 rounded p-3 text-2xl">
              {method.brand === 'visa' ? '🏦' : method.brand === 'mastercard' ? '💳' : '💰'}
            </div>

            {/* Card Details */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold capitalize">{method.brand || method.type}</h3>
                {method.is_default && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">Default</span>
                )}
              </div>
              <p className="text-slate-400 text-sm">
                •••• •••• •••• {method.last4}
              </p>
              {method.exp_month && method.exp_year && (
                <p className="text-slate-400 text-sm">
                  Expires {method.exp_month}/{method.exp_year}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              disabled={method.is_default}
              className="text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Set Default
            </button>
            <button
              onClick={() => handleDelete(method.id)}
              disabled={deletingId === method.id}
              className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {deletingId === method.id ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      ))}

      <button className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition mt-4">
        + Add Payment Method
      </button>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDeleteId !== null}
        title="Remove Payment Method"
        message="Are you sure you want to remove this payment method?"
        confirmText="Remove"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
