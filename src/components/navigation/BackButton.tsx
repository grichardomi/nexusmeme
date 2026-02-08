'use client';

import { useRouter } from 'next/navigation';

/**
 * BackButton Component
 * Mobile-friendly back navigation button using browser history
 * Minimum 44x44px touch target for accessibility
 */

interface BackButtonProps {
  /** Optional className for custom styling */
  className?: string;
  /** Optional label text (hidden by default on mobile) */
  label?: string;
}

export function BackButton({ className = '', label }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  return (
    <button
      onClick={handleBack}
      className={`p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-2 touch-manipulation min-w-[44px] min-h-[44px] flex-shrink-0 ${className}`}
      aria-label="Go back"
      title="Go back"
    >
      {/* Left Arrow Icon */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 19l-7-7 7-7"
        />
      </svg>
      {label && (
        <span className="hidden sm:inline text-sm font-medium">{label}</span>
      )}
    </button>
  );
}
