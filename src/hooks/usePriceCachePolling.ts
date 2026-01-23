/**
 * React hook for polling prices from cache-only endpoint
 * Replaces WebSocket/SSE with simple HTTP polling of shared cache
 *
 * Architecture:
 * - Polls /api/market-data/prices endpoint every 2 seconds
 * - Endpoint reads from Redis (no exchange calls)
 * - Shared cache means all users see same prices
 * - Graceful handling of cold cache (returns 503 with "temporarily unavailable")
 * - Marks data as stale if older than threshold
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { MarketData } from '@/types/market';

interface UsePriceCachePollingOptions {
  pollIntervalMs?: number; // How often to poll cache (default: 2000ms)
  staleThresholdMs?: number; // Mark data as stale after this age (default: 30000ms)
  onError?: (error: Error) => void;
}

interface UsePriceCachePollingResult {
  prices: Map<string, MarketData>;
  status: 'polling' | 'idle' | 'error' | 'stale' | 'unavailable';
  isLoading: boolean;
  isStale: boolean;
  lastUpdate: number; // Timestamp of last successful fetch
  lastServerUpdate: number; // Timestamp of when server last fetched from exchange
  error: Error | null;
  stalePairs: string[]; // Pairs without recent data
}

export function usePriceCachePolling(
  pairs: string[],
  options: UsePriceCachePollingOptions = {}
): UsePriceCachePollingResult {
  const { pollIntervalMs = 10000, staleThresholdMs = 30000, onError } = options;

  const [prices, setPrices] = useState<Map<string, MarketData>>(new Map());
  const [status, setStatus] = useState<'polling' | 'idle' | 'error' | 'stale' | 'unavailable'>(
    pairs.length > 0 ? 'polling' : 'idle'
  );
  const [isStale, setIsStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [lastServerUpdate, setLastServerUpdate] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [stalePairs, setStalePairs] = useState<string[]>([]);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const staleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pricesRef = useRef<Map<string, MarketData>>(new Map());
  const pairsRef = useRef(pairs);
  const onErrorRef = useRef(onError);

  // Keep refs in sync
  useEffect(() => {
    pairsRef.current = pairs;
  }, [pairs]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  /**
   * Fetch prices from cache endpoint
   * Defined in effect to capture current pairs
   */
  const fetchPrices = async () => {
    const currentPairs = pairsRef.current;
    if (currentPairs.length === 0) return;

    try {
      const url = `/api/market-data/prices?pairs=${encodeURIComponent(currentPairs.join(','))}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        // 503 means cache is still being populated
        if (response.status === 503) {
          setStatus('unavailable');
          const errMsg = 'Price cache not yet populated';
          const err = new Error(errMsg);
          setError(err);
          onErrorRef.current?.(err);
          return;
        }

        throw new Error(`Failed to fetch prices: ${response.status} ${response.statusText}`);
      }

      const data: Record<string, any> = await response.json();
      const now = Date.now();

      // Map API response to internal format
      const newPrices = new Map<string, MarketData>();
      for (const pair of currentPairs) {
        if (data[pair]) {
          const priceData = data[pair];
          newPrices.set(pair, {
            pair,
            price: priceData.price,
            volume: priceData.volume ?? 0,
            timestamp: priceData.timestamp ?? now,
            change24h: priceData.change24h ?? 0,
            high24h: priceData.high24h ?? priceData.price,
            low24h: priceData.low24h ?? priceData.price,
          });
        }
      }

      pricesRef.current = newPrices;
      setPrices(new Map(newPrices));
      setLastUpdate(now);

      // Server's last update is when they fetched from exchange
      if (newPrices.size > 0) {
        const firstPrice = Array.from(newPrices.values())[0];
        setLastServerUpdate(typeof firstPrice.timestamp === 'number' ? firstPrice.timestamp : now);
      }

      setStatus('polling');
      setError(null);
      setIsStale(false);
      setStalePairs([]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Silently handle errors (connection refused, network issues, etc.)
      // Only set error state, don't spam console
      setError(error);
      setStatus('error');
      onErrorRef.current?.(error);
    }
  };

  /**
   * Monitor for stale prices
   */
  useEffect(() => {
    if (pairs.length === 0) return;

    const checkStale = () => {
      const now = Date.now();
      const stale: string[] = [];

      for (const pair of pairsRef.current) {
        const price = pricesRef.current.get(pair);
        if (!price || !price.timestamp) {
          stale.push(pair);
        } else {
          const age = now - (typeof price.timestamp === 'number' ? price.timestamp : now);
          if (age > staleThresholdMs) {
            stale.push(pair);
          }
        }
      }

      setStalePairs(stale);
      setIsStale(stale.length > 0);

      // Update status based on staleness
      setStatus((currentStatus) => {
        if (stale.length > 0 && currentStatus === 'polling') {
          return 'stale';
        } else if (stale.length === 0 && currentStatus === 'stale') {
          return 'polling';
        }
        return currentStatus;
      });
    };

    staleCheckIntervalRef.current = setInterval(checkStale, 5000);
    return () => {
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
      }
    };
  }, [pairs, staleThresholdMs]);

  /**
   * Setup polling interval
   */
  useEffect(() => {
    // If no pairs, clear interval and return (don't set state every render)
    if (pairs.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Only set idle state if not already idle (to avoid infinite loops)
      setStatus((prevStatus) => (prevStatus === 'idle' ? prevStatus : 'idle'));
      setPrices((prevPrices) => (prevPrices.size === 0 ? prevPrices : new Map()));
      return;
    }

    // Fetch immediately
    setStatus('polling');
    fetchPrices();

    // Set up polling interval - call fetchPrices directly (captures current refs)
    pollIntervalRef.current = setInterval(fetchPrices, pollIntervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pairs, pollIntervalMs]);

  const isLoading = status === 'polling' && prices.size === 0;

  return {
    prices,
    status,
    isLoading,
    isStale,
    lastUpdate,
    lastServerUpdate,
    error,
    stalePairs,
  };
}
