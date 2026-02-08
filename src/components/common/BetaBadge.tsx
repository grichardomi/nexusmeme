'use client';

import Link from 'next/link';

/**
 * BetaBadge Component
 * Displays a beta badge with link to beta information
 * Mobile-friendly with responsive sizing
 */

interface BetaBadgeProps {
  /** Optional className for positioning */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function BetaBadge({ className = '', size = 'md' }: BetaBadgeProps) {
  const sizeClasses = {
    sm: 'text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5',
    md: 'text-xs sm:text-sm px-2 sm:px-2.5 py-0.5 sm:py-1',
  };

  return (
    <Link
      href="/help#beta"
      className={`inline-flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-full hover:from-purple-600 hover:to-pink-600 transition-all hover:scale-105 touch-manipulation ${sizeClasses[size]} ${className}`}
      title="Learn more about our beta program"
    >
      <span>BETA</span>
      <svg
        className="w-3 h-3 hidden sm:inline"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </Link>
  );
}
