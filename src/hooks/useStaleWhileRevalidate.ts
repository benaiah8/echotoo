/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Stale-While-Revalidate (SWR) hook
 *
 * Shows cached data immediately, fetches fresh data in background, updates UI when fresh data arrives.
 * User always sees something, never blank screens.
 *
 * Use Cases:
 * - All progressive feeds
 * - Tab switching
 * - Page navigation
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseStaleWhileRevalidateOptions<T> {
  // Data loading
  loadFresh: () => Promise<T>;

  // Caching
  getCached?: () => T | null;
  setCached?: (data: T) => void;
  cacheKey?: string;

  // Options
  enabled?: boolean; // Whether to fetch fresh data
  revalidateOnMount?: boolean; // Whether to revalidate when component mounts
  revalidateOnFocus?: boolean; // Whether to revalidate when window gains focus
  revalidateInterval?: number; // Interval in ms to revalidate (0 = disabled)

  // Callbacks
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;

  // Error handling
  shouldRetry?: (error: Error, retryCount: number) => boolean;
  retryCount?: number;
  retryDelay?: number;
}

export interface UseStaleWhileRevalidateResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean; // Whether fresh data is being fetched
  revalidate: () => Promise<void>;
}

/**
 * Stale-While-Revalidate hook
 *
 * @example
 * ```tsx
 * const { data, isValidating } = useStaleWhileRevalidate({
 *   loadFresh: () => fetchPosts(),
 *   getCached: () => getCachedPosts(),
 *   setCached: (posts) => setCachedPosts(posts),
 * });
 * ```
 */
export function useStaleWhileRevalidate<T>(
  options: UseStaleWhileRevalidateOptions<T>
): UseStaleWhileRevalidateResult<T> {
  const {
    loadFresh,
    getCached,
    setCached,
    enabled = true,
    revalidateOnMount = true,
    revalidateOnFocus = false,
    revalidateInterval = 0,
    onSuccess,
    onError,
    shouldRetry = () => false,
    retryCount: maxRetryCount = 0,
    retryDelay = 1000,
  } = options;

  // State
  const [data, setData] = useState<T | null>(() => {
    // Initialize with cached data immediately (stale)
    return getCached?.() || null;
  });
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Refs
  const retryCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Revalidate function
  const revalidate = useCallback(async () => {
    if (!enabled) return;

    setIsValidating(true);
    setError(null);

    try {
      const freshData = await loadFresh();

      if (!isMountedRef.current) return;

      // Update cache if setCached is provided
      if (setCached) {
        setCached(freshData);
      }

      // Update state with fresh data
      setData(freshData);
      setIsLoading(false);
      retryCountRef.current = 0; // Reset retry count on success

      // Call success callback
      onSuccess?.(freshData);
    } catch (err) {
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      // Retry logic
      if (
        shouldRetry(error, retryCountRef.current) &&
        retryCountRef.current < maxRetryCount
      ) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (isMountedRef.current) {
            revalidate();
          }
        }, retryDelay);
      } else {
        setIsLoading(false);
        onError?.(error);
      }
    } finally {
      if (isMountedRef.current) {
        setIsValidating(false);
      }
    }
  }, [
    enabled,
    loadFresh,
    setCached,
    onSuccess,
    onError,
    shouldRetry,
    maxRetryCount,
    retryDelay,
  ]);

  // Initial load: show cached data immediately, fetch fresh in background
  useEffect(() => {
    if (!enabled) return;

    // Show cached data immediately (already set in useState initializer)
    const cached = getCached?.();
    if (cached) {
      setData(cached);
    }

    // Fetch fresh data in background if revalidateOnMount is true
    if (revalidateOnMount) {
      setIsLoading(true);
      revalidate();
    } else {
      setIsLoading(false);
    }
  }, []); // Only run on mount

  // Revalidate on focus
  useEffect(() => {
    if (!enabled || !revalidateOnFocus) return;

    const handleFocus = () => {
      revalidate();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [enabled, revalidateOnFocus, revalidate]);

  // Revalidate on interval
  useEffect(() => {
    if (!enabled || !revalidateInterval || revalidateInterval <= 0) return;

    intervalRef.current = setInterval(() => {
      revalidate();
    }, revalidateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, revalidateInterval, revalidate]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    revalidate,
  };
}

