'use client';

import { useEffect, useState, useRef } from 'react';

export interface Bot {
  id: string;
  exchange: string;
  enabledPairs: string[];
  tradingMode: 'paper' | 'live';
  isActive: boolean;
  createdAt: string;
  totalTrades: number;
  profitLoss: number;
  config: Record<string, unknown>;
}

interface CachedBots {
  bots: Bot[];
  timestamp: number;
}

// Client-side cache shared across all components
const botsCacheRef = { current: null as CachedBots | null };

// Track last error to avoid console spam
let lastErrorMessage: string | null = null;
let errorLoggedAt = 0;

/**
 * Hook to fetch bots with client-side caching to prevent duplicate API calls.
 * All components using this hook share a single cache with 5-second expiry.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 5000ms)
 * @returns Array of bots
 *
 * @example
 * const bots = useLiveBots(5000);
 * const activeBot = bots.find(b => b.isActive);
 */
export function useLiveBots(intervalMs = 5000): Bot[] {
  const [bots, setBots] = useState<Bot[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function fetchBots() {
      try {
        const now = Date.now();

        // Use cached data if still fresh (5 second expiry)
        if (botsCacheRef.current && now - botsCacheRef.current.timestamp < 5000) {
          if (isMountedRef.current) {
            setBots(botsCacheRef.current.bots);
          }
          return;
        }

        // Fetch fresh data
        const response = await fetch('/api/bots');
        if (!response.ok) {
          // Parse error message but only log once per unique error (avoid console spam)
          let errorMsg = `HTTP ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            errorMsg = response.statusText || errorMsg;
          }

          // Only log if this is a new error or enough time has passed (30 seconds)
          const shouldLog = lastErrorMessage !== errorMsg || (now - errorLoggedAt > 30000);
          if (shouldLog) {
            // 401 is expected when not logged in - use warn, not error
            if (response.status === 401) {
              // Silent - user just isn't logged in, no need to log
            } else {
              console.warn('useLiveBots: fetch failed -', errorMsg);
            }
            lastErrorMessage = errorMsg;
            errorLoggedAt = now;
          }
          return;
        }

        // Success - clear error tracking
        lastErrorMessage = null;

        const data: Bot[] = await response.json();

        // Update cache
        botsCacheRef.current = {
          bots: data,
          timestamp: now,
        };

        if (isMountedRef.current) {
          setBots(data);
        }
      } catch (err) {
        // Only log network errors once per 30 seconds to avoid spam
        const now = Date.now();
        const errorMsg = err instanceof Error ? err.message : String(err);
        const shouldLog = lastErrorMessage !== errorMsg || (now - errorLoggedAt > 30000);
        if (shouldLog) {
          console.warn('useLiveBots: network error -', errorMsg);
          lastErrorMessage = errorMsg;
          errorLoggedAt = now;
        }
      }
    }

    // Fetch immediately
    fetchBots();

    // Set up interval
    const interval = setInterval(fetchBots, intervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return bots;
}
