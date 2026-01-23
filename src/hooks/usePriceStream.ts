/**
 * React hook for consuming real-time price updates via SSE
 * Replaces polling-based price fetching with WebSocket-backed SSE streaming
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PriceUpdate } from '@/types/market-data';

interface UsePriceStreamOptions {
  onError?: (error: Error) => void;
  updateDebounceMs?: number; // Debounce rapid updates to prevent excessive re-renders
}

interface UsePriceStreamResult {
  prices: Map<string, PriceUpdate>;
  status: 'connecting' | 'connected' | 'error' | 'degraded' | 'idle';
  isLoading: boolean;
  lastUpdate: number; // Timestamp of last price update
  error: Error | null;
  isPriceStale: boolean; // True if prices are older than 30 seconds
  stalePairs: string[]; // Pairs that haven't received updates
  hasReceivedPrice: boolean; // True after first price is seen
}

/**
 * Hook for real-time price streaming via SSE
 *
 * Usage:
 * ```typescript
 * const { prices, status } = usePriceStream(['BTC/USD', 'ETH/USD']);
 *
 * if (status === 'connecting') return <Spinner />;
 * if (status === 'error') return <ErrorMessage />;
 *
 * const btcPrice = prices.get('BTC/USD');
 * ```
 */
export function usePriceStream(
  pairs: string[],
  options: UsePriceStreamOptions = {}
): UsePriceStreamResult {
  const { onError, updateDebounceMs = 500 } = options;

  // Refs for avoiding dependency issues
  const eventSourceRef = useRef<EventSource | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pricesRef = useRef<Map<string, PriceUpdate>>(new Map());
  const pairCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noDataTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasReceivedPriceRef = useRef(false);
  const statusRef = useRef<'connecting' | 'connected' | 'error' | 'degraded' | 'idle'>('idle');
  const pairsRef = useRef<string[]>([]);

  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'degraded' | 'idle'>(
    pairs.length > 0 ? 'connecting' : 'idle'
  );
  const [lastUpdate, setLastUpdate] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [isPriceStale, setIsPriceStale] = useState(false);
  const [stalePairs, setStalePairs] = useState<string[]>([]);

  // Update refs whenever state changes to avoid dependency issues
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    pairsRef.current = pairs;
    // Reset received flag when pairs change
    hasReceivedPriceRef.current = false;
  }, [pairs]);

  /**
   * Monitor for stale prices
   * Updates stalePairs/isPriceStale and toggles degraded/connected status
   */
  const checkForStalePrices = useCallback(() => {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    const stale: string[] = [];

    for (const pair of pairsRef.current) {
      const price = pricesRef.current.get(pair);
      if (price) {
        const age = now - price.timestamp;
        if (age > staleThreshold) {
          stale.push(pair);
        }
      } else {
        stale.push(pair);
      }
    }

    setStalePairs(stale);
    setIsPriceStale(stale.length > 0);

    // Toggle between connected/degraded based on staleness
    const currentStatus = statusRef.current;
    const hasStale = stale.length > 0;
    if (hasStale && currentStatus === 'connected') {
      setStatus('degraded');
    } else if (!hasStale && currentStatus === 'degraded') {
      setStatus('connected');
    }
  }, []);

  /**
   * Setup and teardown SSE connection
   * Only depends on pairs to prevent unnecessary reconnections
   */
  useEffect(() => {
    if (pairs.length === 0) {
      // Only set idle if not already idle (prevent loop)
      if (statusRef.current !== 'idle') {
        setStatus('idle');
      }
      setPrices(new Map());
      if (pairCheckTimerRef.current) {
        clearInterval(pairCheckTimerRef.current);
      }
      return;
    }

    // Only set connecting if not already connecting (prevent loop)
    if (statusRef.current !== 'connecting') {
      setStatus('connecting');
    }
    setError(null);

    try {
      const pairsParam = pairs.join(',');
      const url = `/api/market-data/stream?pairs=${encodeURIComponent(pairsParam)}`;

      console.debug('Connecting to price stream', { pairs, url });

      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      pricesRef.current = new Map();

      // Fail fast if no prices arrive within timeout
      if (noDataTimerRef.current) {
        clearTimeout(noDataTimerRef.current);
      }
      noDataTimerRef.current = setTimeout(() => {
        if (pricesRef.current.size === 0) {
          const err = new Error('No price data received');
          setStatus('error');
          setError(err);
          onError?.(err);
        }
      }, 20000);

      // Handler for incoming price updates
      const handlePriceUpdate = (update: PriceUpdate) => {
        // Update internal map
        pricesRef.current.set(update.pair, update);

        // Mark that we've seen data
        hasReceivedPriceRef.current = true;

        // Debounce state updates to prevent excessive re-renders
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          setPrices(new Map(pricesRef.current));
          setLastUpdate(Date.now());
        }, updateDebounceMs);

        // Clear no-data timer once first price is received
        if (noDataTimerRef.current) {
          clearTimeout(noDataTimerRef.current);
          noDataTimerRef.current = null;
        }
      };

      // Handler for SSE messages
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection confirmation
          if (data.type === 'connected') {
            if (statusRef.current !== 'connected') {
              setStatus('connected');
            }
            setError(null);
            console.debug('Price stream connected', { pairs: data.pairs });
            return;
          }

          // Handle price update
          if (data.pair && typeof data.price === 'number') {
            handlePriceUpdate(data as PriceUpdate);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('Failed to parse price update', error);
          setError(error);
        }
      };

      // Handler for SSE errors
      const handleError = () => {
        if (statusRef.current !== 'error') {
          setStatus('error');
        }
        const err = new Error('Price stream connection error');
        setError(err);
        onError?.(err);
        console.error('Price stream error');
      };

      eventSource.addEventListener('message', handleMessage);
      eventSource.addEventListener('error', handleError);

      // Fallback: also listen for open event (some browsers may not support error event properly)
      eventSource.addEventListener('open', () => {
        console.debug('Price stream opened');
      });

      // Start monitoring for stale prices every 10 seconds
      pairCheckTimerRef.current = setInterval(checkForStalePrices, 10000);

      return () => {
        console.debug('Cleaning up price stream', { pairs });
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        if (pairCheckTimerRef.current) {
          clearInterval(pairCheckTimerRef.current);
        }
        if (noDataTimerRef.current) {
          clearTimeout(noDataTimerRef.current);
          noDataTimerRef.current = null;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.removeEventListener('message', handleMessage);
          eventSourceRef.current.removeEventListener('error', handleError);
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to setup price stream', error);
      // Only set error status if not already error (prevent loop)
      if (statusRef.current !== 'error') {
        setStatus('error');
      }
      setError(error);
      onError?.(error);
    }
  }, [pairs, updateDebounceMs]);

  const isLoading = status === 'connecting';

  return {
    prices,
    status,
    isLoading,
    lastUpdate,
    error,
    isPriceStale,
    stalePairs,
    hasReceivedPrice: hasReceivedPriceRef.current,
  };
}
