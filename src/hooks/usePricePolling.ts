'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PriceUpdate } from '@/types/market-data';

interface UsePricePollingOptions {
  pollIntervalMs?: number;
  staleThresholdMs?: number;
  onError?: (error: Error) => void;
}

interface UsePricePollingResult {
  prices: Map<string, PriceUpdate>;
  status: 'polling' | 'idle' | 'error' | 'stale';
  isLoading: boolean;
  isStale: boolean;
  lastUpdate: number;
  error: Error | null;
}

/**
 * Polling hook for real prices from aggregator + Redis cache
 *
 * Behavior:
 * - Fetches from /api/market-data/prices (aggregator + Redis)
 * - Only real data shown (no fallback seeding)
 * - Tracks staleness: marks data as stale if older than threshold
 * - If fetch fails: keeps last known values marked as stale
 * - If fetch fails and no prior values: error state with empty prices
 */
export function usePricePolling(
  pairs: string[],
  options: UsePricePollingOptions = {}
): UsePricePollingResult {
  const { pollIntervalMs = 10000, staleThresholdMs = 60000, onError } = options;

  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const [status, setStatus] = useState<'polling' | 'idle' | 'error' | 'stale'>('idle');
  const [isStale, setIsStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pricesRef = useRef<Map<string, PriceUpdate>>(new Map());
  const lastFetchTimeRef = useRef<number>(0);

  // Fetch real prices from aggregator + Redis
  const fetchPrices = useCallback(async () => {
    if (pairs.length === 0) return;

    try {
      const url = `/api/market-data/prices?pairs=${encodeURIComponent(pairs.join(','))}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`Price fetch failed: ${response.status}`);
      }

      const data: Record<string, any> = await response.json();
      const now = Date.now();

      // Only add prices we actually received (no synthetic seeding)
      const newPrices = new Map<string, PriceUpdate>();
      for (const pair of pairs) {
        if (data[pair]) {
          const price = data[pair].price;
          newPrices.set(pair, {
            pair,
            price,
            bid: price * 0.9999,
            ask: price * 1.0001,
            timestamp: now,
            change24h: data[pair].change24h || 0,
            changePercent24h: data[pair].change24h || 0,
            high24h: data[pair].high24h || price,
            low24h: data[pair].low24h || price,
            volume24h: data[pair].volume || 0,
          });
        }
      }

      pricesRef.current = newPrices;
      setPrices(new Map(newPrices));
      lastFetchTimeRef.current = now;
      setLastUpdate(now);
      setStatus('polling');
      setIsStale(false);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Price polling error:', error);
      setError(error);

      // On error: keep last known values but mark as stale
      if (pricesRef.current.size > 0) {
        setPrices(new Map(pricesRef.current));
        setStatus('stale');
        setIsStale(true);
      } else {
        // No prior data: show error state with empty prices
        setPrices(new Map());
        setStatus('error');
        setIsStale(true);
      }

      onError?.(error);
    }
  }, [pairs, onError]);

  // Monitor for stale prices
  useEffect(() => {
    if (lastFetchTimeRef.current === 0) return;

    const checkStale = () => {
      const timeSinceFetch = Date.now() - lastFetchTimeRef.current;
      if (timeSinceFetch > staleThresholdMs && pricesRef.current.size > 0) {
        setIsStale(true);
        setStatus('stale');
      }
    };

    const staleCheckInterval = setInterval(checkStale, 5000);
    return () => clearInterval(staleCheckInterval);
  }, [staleThresholdMs]);

  // Setup polling
  useEffect(() => {
    if (pairs.length === 0) {
      setStatus('idle');
      setPrices(new Map());
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      return;
    }

    // Fetch immediately
    setStatus('polling');
    fetchPrices();

    // Set up polling interval
    pollIntervalRef.current = setInterval(fetchPrices, pollIntervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pairs, pollIntervalMs, fetchPrices]);

  const isLoading = status === 'polling' && prices.size === 0;

  return {
    prices,
    status,
    isLoading,
    isStale,
    lastUpdate,
    error,
  };
}
