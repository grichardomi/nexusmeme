'use client';

import { useState, useEffect } from 'react';

interface DeleteItem {
  label: string;
  value: string;
}

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  itemsToDelete: DeleteItem[];
  confirmationText: string; // Text user must type to confirm (e.g., "DELETE" or bot name)
  confirmButtonText?: string;
  isDangerous?: boolean; // Shows extra warning styling
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation modal for destructive actions
 * Requires user to type exact confirmation text to proceed
 *
 * Usage:
 * <ConfirmDeleteModal
 *   isOpen={showDeleteModal}
 *   title="Delete Bot"
 *   description="This will permanently delete your trading bot and all associated data."
 *   itemsToDelete={[
 *     { label: 'Bot', value: botName },
 *     { label: 'Trade History', value: `${tradeCount} trades` },
 *     { label: 'Performance Fees', value: 'All records' }
 *   ]}
 *   confirmationText="DELETE"
 *   isDangerous={true}
 *   onConfirm={handleDeleteBot}
 *   onCancel={handleCancel}
 * />
 */
export function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  itemsToDelete,
  confirmationText,
  confirmButtonText = 'Delete Permanently',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const [userInput, setUserInput] = useState('');
  const [hasTypedCorrectly, setHasTypedCorrectly] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setUserInput('');
      setHasTypedCorrectly(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setHasTypedCorrectly(userInput === confirmationText);
  }, [userInput, confirmationText]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${isDangerous ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
          <h2 className={`text-lg font-bold ${isDangerous ? 'text-red-900 dark:text-red-200' : 'text-slate-900 dark:text-white'}`}>
            {title}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Description */}
          <div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {description}
            </p>
          </div>

          {/* Items to Delete */}
          {itemsToDelete.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                Will be deleted permanently:
              </p>
              {itemsToDelete.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className="text-slate-900 dark:text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warning Message */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">⚠️ This action cannot be undone.</span> Please proceed with caution.
            </p>
          </div>

          {/* Confirmation Input */}
          <div>
            <label htmlFor="confirmation-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Type <span className="font-mono font-bold text-slate-900 dark:text-white">{confirmationText}</span> to confirm:
            </label>
            <input
              id="confirmation-input"
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={`Type "${confirmationText}" here`}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-mono transition ${
                hasTypedCorrectly
                  ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-200'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
              }`}
              disabled={isLoading}
              autoFocus
            />
            {hasTypedCorrectly && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                ✓ Ready to delete
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg font-medium text-sm transition bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!hasTypedCorrectly || isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition text-white ${
              isDangerous
                ? 'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600'
                : 'bg-orange-600 dark:bg-orange-700 hover:bg-orange-700 dark:hover:bg-orange-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? 'Deleting...' : confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
