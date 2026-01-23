'use client';

import { useEffect } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean; // Shows red styling for dangerous actions
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation modal to replace window.confirm()
 *
 * Usage:
 * const [showConfirm, setShowConfirm] = useState(false);
 *
 * <ConfirmationModal
 *   isOpen={showConfirm}
 *   title="Remove Payment Method"
 *   message="Are you sure you want to remove this payment method?"
 *   confirmText="Remove"
 *   cancelText="Keep It"
 *   isDangerous={true}
 *   isLoading={isRemoving}
 *   onConfirm={handleRemove}
 *   onCancel={() => setShowConfirm(false)}
 * />
 */
export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-sm w-full">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${isDangerous ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
          <h2 className={`text-lg font-bold ${isDangerous ? 'text-red-900 dark:text-red-200' : 'text-slate-900 dark:text-white'}`}>
            {title}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <p className="text-slate-700 dark:text-slate-300">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg font-medium text-sm transition bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition text-white ${
              isDangerous
                ? 'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600'
                : 'bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
