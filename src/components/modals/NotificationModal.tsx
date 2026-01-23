'use client';

import { useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationModalProps {
  isOpen: boolean;
  type: NotificationType;
  title?: string;
  message: string;
  duration?: number; // Auto-close after milliseconds (0 = manual close only)
  onClose: () => void;
}

/**
 * Reusable notification modal to replace alert()
 *
 * Usage:
 * const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
 *
 * <NotificationModal
 *   isOpen={notification !== null}
 *   type={notification?.type || 'info'}
 *   message={notification?.message || ''}
 *   duration={3000}
 *   onClose={() => setNotification(null)}
 * />
 */
export function NotificationModal({
  isOpen,
  type,
  title,
  message,
  duration = 3000,
  onClose,
}: NotificationModalProps) {
  useEffect(() => {
    if (!isOpen || duration === 0) return;

    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styleMap = {
    success: {
      bg: 'bg-green-50 dark:bg-green-950/20',
      border: 'border-green-200 dark:border-green-900/50',
      header: 'bg-green-100 dark:bg-green-900/30',
      icon: '✓',
      text: 'text-green-900 dark:text-green-200',
      button: 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950/20',
      border: 'border-red-200 dark:border-red-900/50',
      header: 'bg-red-100 dark:bg-red-900/30',
      icon: '✕',
      text: 'text-red-900 dark:text-red-200',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      border: 'border-amber-200 dark:border-amber-900/50',
      header: 'bg-amber-100 dark:bg-amber-900/30',
      icon: '⚠',
      text: 'text-amber-900 dark:text-amber-200',
      button: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/20',
      border: 'border-blue-200 dark:border-blue-900/50',
      header: 'bg-blue-100 dark:bg-blue-900/30',
      icon: 'ℹ',
      text: 'text-blue-900 dark:text-blue-200',
      button: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600',
    },
  };

  const style = styleMap[type];

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`${style.bg} border ${style.border} rounded-lg shadow-xl max-w-sm w-full overflow-hidden`}>
        {/* Header with Icon */}
        <div className={`${style.header} px-6 py-4 flex items-center gap-3`}>
          <span className="text-2xl">{style.icon}</span>
          {title && (
            <h2 className={`text-lg font-bold ${style.text}`}>
              {title}
            </h2>
          )}
        </div>

        {/* Message */}
        <div className={`px-6 py-4 ${style.text}`}>
          <p className="break-words">{message}</p>
        </div>

        {/* Action Button */}
        <div className="px-6 py-4 border-t border-inherit flex justify-end">
          <button
            onClick={onClose}
            className={`${style.button} text-white px-4 py-2 rounded-lg font-medium text-sm transition`}
          >
            OK
          </button>
        </div>

        {/* Auto-close indicator (only show if duration > 0) */}
        {duration > 0 && (
          <div
            className={`h-1 ${style.button} opacity-40`}
            style={{
              animation: `shrink ${duration}ms linear forwards`,
            }}
          />
        )}

        <style>{`
          @keyframes shrink {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}</style>
      </div>
    </div>
  );
}
