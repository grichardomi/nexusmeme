import { useState, useCallback } from 'react';

/**
 * Generic Load More pagination state
 */
export interface LoadMoreState<T> {
  items: T[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
}

/**
 * Configuration for useLoadMore hook
 */
export interface UseLoadMoreConfig<T> {
  /** Initial page size for first load */
  initialPageSize?: number;
  /** Page size for subsequent loads */
  pageSize?: number;
  /** Callback to fetch items, returns { items, total, hasMore } */
  fetchFn: (offset: number, pageSize: number) => Promise<{ items: T[]; total: number }>;
}

/**
 * Custom hook for managing infinite scroll / load more pagination
 *
 * Features:
 * - Accumulates items from multiple fetch calls
 * - Tracks offset for pagination
 * - Manages loading state
 * - Handles errors gracefully
 * - Knows when no more items are available
 *
 * @template T The type of items being paginated
 * @param config Configuration object
 * @returns State object and control functions
 *
 * @example
 * const { items, isLoading, error, hasMore, loadMore } = useLoadMore({
 *   pageSize: 20,
 *   fetchFn: async (offset, limit) => {
 *     const res = await fetch(`/api/tickets?offset=${offset}&limit=${limit}`);
 *     const data = await res.json();
 *     return { items: data.tickets, total: data.total };
 *   }
 * });
 */
export function useLoadMore<T>({
  initialPageSize = 20,
  pageSize = 20,
  fetchFn,
}: UseLoadMoreConfig<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  /**
   * Load initial batch of items
   */
  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { items: newItems, total: itemTotal } = await fetchFn(0, initialPageSize);

      setItems(newItems);
      setTotal(itemTotal);
      setOffset(initialPageSize);
      setHasMore(newItems.length < itemTotal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [initialPageSize, fetchFn]);

  /**
   * Load more items (append to existing items)
   */
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    try {
      setIsLoading(true);
      setError(null);

      const { items: newItems, total: itemTotal } = await fetchFn(offset, pageSize);

      setItems(prev => [...prev, ...newItems]);
      setTotal(itemTotal);
      setOffset(prev => prev + pageSize);

      // Check if there are more items
      const totalLoaded = offset + newItems.length;
      setHasMore(totalLoaded < itemTotal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more items');
    } finally {
      setIsLoading(false);
    }
  }, [offset, pageSize, hasMore, isLoading, fetchFn]);

  /**
   * Reset pagination state
   */
  const reset = useCallback(() => {
    setItems([]);
    setIsLoading(false);
    setError(null);
    setOffset(0);
    setTotal(0);
    setHasMore(true);
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    items,
    isLoading,
    error,
    hasMore,
    total,
    itemsLoaded: items.length,

    // Actions
    load,
    loadMore,
    reset,
    clearError,
  };
}
