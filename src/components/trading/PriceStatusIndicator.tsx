'use client';

type PriceStatus = 'polling' | 'idle' | 'error' | 'stale' | 'unavailable';

interface PriceStatusIndicatorProps {
  status: PriceStatus;
  isStale: boolean;
}

export function PriceStatusIndicator({ status, isStale }: PriceStatusIndicatorProps) {
  if (status === 'polling' && !isStale) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        Live
      </span>
    );
  }

  if (isStale) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-semibold">
        <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
        Stale
      </span>
    );
  }

  if (status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold">
        <span className="inline-block w-2 h-2 bg-gray-500 rounded-full"></span>
        Unavailable
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
        <span className="inline-block w-2 h-2 bg-red-500 rounded-full"></span>
        Error
      </span>
    );
  }

  return null;
}
