/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Progressive Feed Component
 *
 * Renders items one-by-one as they become available, with intelligent caching,
 * virtual scrolling, scroll stop detection, and mobile optimizations.
 *
 * Features:
 * - Shows first item from cache immediately
 * - Streams remaining items one-by-one
 * - Stops loading when user stops scrolling
 * - Virtual scrolling for long lists
 * - Mobile-optimized buffers
 * - Integrates with batching
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { useStaleWhileRevalidate } from "../hooks/useStaleWhileRevalidate";
import { useScrollStopDetection } from "../hooks/useScrollStopDetection";
import { useVirtualScrolling } from "../hooks/useVirtualScrolling";
import { useAdaptiveBuffer } from "../hooks/useAdaptiveBuffer";
import { useConnectionAware } from "../hooks/useConnectionAware";
import {
  type OffsetAwareLoadResult,
  extractItems,
  extractConsumedOffset,
  extractCount,
} from "../lib/offsetAwareLoader";

export interface ProgressiveFeedProps<T> {
  // Data loading
  // Supports both old format (Promise<T[]>) and new format (Promise<OffsetAwareLoadResult<T>>)
  loadItems: (
    offset: number,
    limit: number
  ) => Promise<T[] | OffsetAwareLoadResult<T>>;
  renderItem: (item: T, index: number) => React.ReactNode;

  // Initial data (for immediate display)
  initialItems?: T[];

  // Caching
  cacheKey?: string;
  getCachedItems?: () => T[] | null;
  setCachedItems?: (items: T[]) => void;

  // Virtual scrolling
  enableVirtualScrolling?: boolean;
  itemHeight?: number; // Required if virtual scrolling enabled
  bufferSize?: number | "adaptive"; // "adaptive" uses connection + mobile detection

  // Lazy loading
  enableLazyLoading?: boolean;
  loadMoreThreshold?: number; // Pixels from bottom to trigger load (default: 200px)

  // Scroll stop detection
  enableScrollStopDetection?: boolean;
  scrollStopDelay?: number; // Milliseconds to wait before stopping (default: 2000ms)

  // Loading states
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;

  // Loading skeleton component
  loadingComponent?: React.ReactNode;

  // Orientation
  orientation?: "vertical" | "horizontal";

  // Container
  containerRef?: React.RefObject<HTMLElement>;

  // Options
  pageSize?: number; // Items to load per page (default: 6)
  maxItems?: number; // Maximum items to load (0 = unlimited)
}

/**
 * Progressive Feed Component
 *
 * @example
 * ```tsx
 * <ProgressiveFeed
 *   loadItems={(offset, limit) => getPublicFeed({ offset, limit })}
 *   renderItem={(post, index) => <Post key={post.id} {...post} />}
 *   initialItems={cachedPosts}
 *   getCachedItems={() => getCachedFeed()}
 *   setCachedItems={(posts) => setCachedFeed(posts)}
 *   batchedData={batchedData}
 *   enableVirtualScrolling={true}
 *   itemHeight={400}
 *   bufferSize="adaptive"
 *   enableScrollStopDetection={true}
 * />
 * ```
 */
export default function ProgressiveFeed<T extends { id: string }>({
  loadItems,
  renderItem,
  initialItems,
  cacheKey,
  getCachedItems,
  setCachedItems,
  enableVirtualScrolling = false,
  itemHeight = 400,
  bufferSize = "adaptive",
  enableLazyLoading = true,
  loadMoreThreshold = 200,
  enableScrollStopDetection = true,
  scrollStopDelay = 1000, // Faster response to scroll stop (reduced from 3000ms)
  loading: externalLoading = false,
  error: externalError = null,
  emptyMessage = "No items to display",
  loadingComponent,
  orientation = "vertical",
  containerRef: externalContainerRef,
  pageSize = 1, // Default: load one item at a time for true progressive loading
  maxItems = 0,
}: ProgressiveFeedProps<T>) {
  // PWA detection: Use centralized utility
  const isPWA = (() => {
    try {
      const { isPWA: detectPWA } = require("../lib/pwaDetection");
      return detectPWA();
    } catch {
      // Fallback if module not available
      return (
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes("android-app://"))
      );
    }
  })();
  /**
   * Calculate initial load size - fixed at 5 items
   * User requested: "when first load it should load more and also loading just 3 is little lets load 5 posts"
   */
  const calculateInitialLoadSize = useCallback((): number => {
    return 5; // Fixed: always load 5 items initially, show one-by-one
  }, []);

  // Calculate initial items and offset together to keep them in sync
  // This ensures offsetRef matches items.length from the start
  const getInitialItems = (): T[] => {
    let initial: T[] = [];
    if (initialItems && initialItems.length > 0) {
      initial = initialItems;
    } else if (getCachedItems) {
      const cached = getCachedItems();
      if (cached && cached.length > 0) {
        initial = cached;
      }
    }
    // Deduplicate by ID to prevent duplicate keys
    return Array.from(new Map(initial.map((item) => [item.id, item])).values());
  };

  const initialItemsArray = getInitialItems();
  const initialOffset = initialItemsArray.length;

  // Internal state
  const [items, setItems] = useState<T[]>(initialItemsArray);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(externalError);

  // useTransition for progressive rendering (prevents React from batching updates)
  const [isPending, startTransition] = useTransition();

  // Refs
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialOffset); // Initialize with calculated offset
  const shouldLoadRef = useRef(true);
  const initialLoadCompleteRef = useRef(false); // Track if initial load has completed

  // Component mount tracking (removed excessive logs)

  // [PHASE 2.3] Connection-aware configuration
  const {
    pageSize: connectionAwarePageSize,
    bufferSize: connectionAwareBufferSize,
    shouldPause,
  } = useConnectionAware({
    basePageSize: pageSize,
    baseBufferSize: typeof bufferSize === "number" ? bufferSize : 3,
    enablePauseOnSlow: true,
  });

  // Adaptive buffer (existing hook for scroll speed awareness)
  const { bufferSize: adaptiveBufferSize } = useAdaptiveBuffer({
    minBuffer: 1,
    maxBuffer: 3,
    enableConnectionAware: true,
    enableScrollSpeedAware: true,
  });

  // [PHASE 2.3] Determine actual pageSize (use connection-aware if provided pageSize is base)
  const actualPageSize = useMemo(() => {
    // If pageSize was explicitly provided, use connection-aware adjustment
    // Otherwise, use the provided pageSize as-is (for backward compatibility)
    return connectionAwarePageSize;
  }, [connectionAwarePageSize]);

  // Determine actual buffer size
  const actualBufferSize = useMemo(() => {
    if (bufferSize === "adaptive") {
      // [PHASE 2.3] Use connection-aware buffer size if available
      // Otherwise fall back to adaptive buffer from useAdaptiveBuffer
      return connectionAwareBufferSize > 0
        ? connectionAwareBufferSize
        : adaptiveBufferSize;
    }
    return bufferSize;
  }, [bufferSize, adaptiveBufferSize, connectionAwareBufferSize]);

  // Load more items (defined before hooks that use it)
  const loadMoreRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const loadMore = useCallback(async () => {
    // Double-check: Ensure initial load is complete before allowing subsequent loads
    if (!initialLoadCompleteRef.current) {
      return; // Wait for initial load to complete
    }

    // [PHASE 2.3] Pause loading on very slow connections
    if (shouldPause) {
      return; // Don't load more on very slow connections
    }

    // CRITICAL FIX: Prevent loadMore from firing with offset 0 if we already have items
    // This prevents race condition where initial load and loadMore both fire with offset 0
    if (offsetRef.current === 0 && items.length > 0) {
      console.warn(
        "[ProgressiveFeed] loadMore called with offset 0 but items exist - skipping to prevent duplicate loads"
      );
      return;
    }

    // Double-check loading state (prevent race conditions)
    if (
      loadingRef.current ||
      isLoadingMore ||
      !hasMore ||
      !shouldLoadRef.current
    ) {
      return;
    }

    // Fix: Ensure isLoadingMore and loadingRef stay in sync - set both together
    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    // [PWA FIX] Detect PWA context for longer timeout
    const isPWA = (() => {
      try {
        const { isPWA: detectPWA } = require("../lib/pwaDetection");
        return detectPWA();
      } catch {
        // Fallback if module not available
        return (
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true
        );
      }
    })();

    // Safety timeout: Force reset loading state after timeout to prevent stuck state
    // Longer timeout for PWA (20s) to account for slower network connections in PWA context
    const timeout = isPWA ? 20000 : 15000;
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      if (loadingRef.current) {
        console.warn(
          `[ProgressiveFeed] loadMore: TIMEOUT${
            isPWA ? " (PWA)" : ""
          } - Force resetting loading state after ${timeout}ms. This usually indicates a slow network or database query.`
        );
        loadingRef.current = false;
        setIsLoadingMore(false);
        timeoutId = null;
      }
    }, timeout);

    try {
      // [PWA FIX] Add retry logic for PWA network issues
      const loadWithRetry = async (
        attempt = 1
      ): Promise<T[] | OffsetAwareLoadResult<T>> => {
        try {
          // [PHASE 2.3] Use connection-aware pageSize
          return await loadItems(offsetRef.current, actualPageSize);
        } catch (error) {
          // Retry up to 3 times with exponential backoff
          if (attempt < 3) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.warn(
              `[ProgressiveFeed] Load attempt ${attempt} failed, retrying in ${delay}ms:`,
              error
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            return loadWithRetry(attempt + 1);
          }
          throw error;
        }
      };

      const loadResult = await loadWithRetry();

      // Extract items, consumed offset, and count (supports both old and new formats)
      const newItems = extractItems(loadResult);
      const consumedOffset = extractConsumedOffset(loadResult);
      const count = extractCount(loadResult);

      if (newItems.length === 0) {
        // Simplified: Only set hasMore=false when we definitely reached the end
        // consumedOffset === 0 means no items were consumed, so we're at the end
        if (consumedOffset === 0) {
          setHasMore(false);
        } else {
          // We consumed offsets but got 0 items (likely filtering)
          // Update offset and try again
          offsetRef.current += consumedOffset;
        }
      } else {
        // CRITICAL FIX: Update offset using newItems.length, not consumedOffset
        // consumedOffset might be 0 or incorrect if API returns fewer items than requested
        // We definitely consumed newItems.length offsets, so use that
        if (newItems.length > 0) {
          offsetRef.current += newItems.length;
        } else if (consumedOffset === 0) {
          // No items consumed and no items returned = at end
          setHasMore(false);
        }

        // OPTIMIZATION: Use count from PostgreSQL function for reliable hasMore detection
        // If count is available and count < limit, we've reached the end
        // Otherwise, fallback to length check (for backward compatibility)
        // [PHASE 2.3] Use connection-aware pageSize
        if (count !== undefined) {
          if (count < actualPageSize) {
            setHasMore(false);
          }
        } else if (newItems.length < actualPageSize) {
          // Fallback: Use length check if count is not available
          setHasMore(false);
        }

        // [PHASE 2.4] PROGRESSIVE RENDERING: Add items one-by-one for smooth appearance
        // This gives the user immediate feedback as items appear, not all at once
        if (newItems.length > 0) {
          // Add items one-by-one with 100ms delays between each
          // 100ms provides smoother UX while still preventing React batching
          newItems.forEach((item, index) => {
            const addItem = () => {
              if (index === 0) {
                // First item: flushSync (immediate, non-batched, forces render)
                flushSync(() => {
                  setItems((prev) => {
                    // Avoid duplicates - use Map to ensure uniqueness
                    const itemsMap = new Map<string, T>();
                    // Add existing items
                    prev.forEach((existingItem) => {
                      itemsMap.set(existingItem.id, existingItem);
                    });
                    // Add this specific item
                    itemsMap.set(item.id, item);
                    const newItemsArray = Array.from(itemsMap.values());

                    // Check maxItems using the NEW length
                    if (maxItems > 0 && newItemsArray.length >= maxItems) {
                      setHasMore(false);
                    }

                    return newItemsArray;
                  });
                });
                // Reset loading state immediately after first item appears
                loadingRef.current = false;
                setIsLoadingMore(false);
              } else {
                // [PHASE 2.4] Subsequent items: startTransition (non-urgent, can be batched by React)
                // 100ms delay ensures they're in separate event loop ticks for smooth appearance
                startTransition(() => {
                  setItems((prev) => {
                    // Avoid duplicates - use Map to ensure uniqueness
                    const itemsMap = new Map<string, T>();
                    // Add existing items
                    prev.forEach((existingItem) => {
                      itemsMap.set(existingItem.id, existingItem);
                    });
                    // Add this specific item
                    itemsMap.set(item.id, item);
                    const newItemsArray = Array.from(itemsMap.values());

                    // Check maxItems using the NEW length
                    if (maxItems > 0 && newItemsArray.length >= maxItems) {
                      setHasMore(false);
                    }

                    return newItemsArray;
                  });
                });
              }
            };

            if (index === 0) {
              // [PHASE 2.4] First item: show immediately (< 500ms target)
              requestAnimationFrame(addItem);
            } else {
              // [PHASE 2.4] Subsequent items: show with 100ms delay between each
              // 100ms provides smoother, more natural appearance
              setTimeout(addItem, index * 100);
            }
          });

          // Update cache asynchronously (non-blocking)
          // Defer to next tick so it doesn't block progressive rendering
          if (setCachedItems) {
            // Store newItems in closure for async cache update
            const itemsToCache = [...newItems];
            setTimeout(() => {
              // Read current items state and merge with new items
              setItems((currentItems) => {
                const itemsMap = new Map<string, T>();
                // Add existing items from current state
                currentItems.forEach((item) => itemsMap.set(item.id, item));
                // Add new items (will overwrite duplicates)
                itemsToCache.forEach((item) => itemsMap.set(item.id, item));
                const mergedItems = Array.from(itemsMap.values());
                // Update cache (outside of setItems callback)
                setCachedItems(mergedItems);
                return currentItems; // Return unchanged (we're just reading for cache)
              });
            }, 0); // Next tick, non-blocking
          }
        } else {
          // No items: reset loading state immediately
          loadingRef.current = false;
          setIsLoadingMore(false);
        }

        // REMOVED: Aggressive hasMore check that was stopping loading prematurely
        // The existing logic at line 282 (if consumedOffset === 0) already handles
        // the end case correctly. Removing this prevents false positives where
        // API returns fewer items than requested but there are still more items.
        // If there are truly no more items, API will return 0 items and consumedOffset
        // will be 0, triggering hasMore=false correctly.
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("[ProgressiveFeed] Failed to load items:", err);
      // Reset loading state on error
      loadingRef.current = false;
      setIsLoadingMore(false);
    } finally {
      // Clear timeout if it exists
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // Note: Loading state is reset immediately after fetch (before progressive rendering)
      // This allows next load to start while items are still being added progressively

      // Re-check if sentinel is visible after load completes
      // This ensures loading continues if sentinel is still in viewport
      requestAnimationFrame(() => {
        if (
          sentinelRef.current &&
          hasMore &&
          !loadingRef.current &&
          loadMoreRef.current
        ) {
          const rect = sentinelRef.current.getBoundingClientRect();
          const container = containerRef.current || document.documentElement;
          const containerRect =
            container === document.documentElement
              ? {
                  top: 0,
                  bottom: window.innerHeight,
                  left: 0,
                  right: window.innerWidth,
                }
              : (container as HTMLElement).getBoundingClientRect();

          const isVisible =
            rect.top < containerRect.bottom + loadMoreThreshold &&
            rect.bottom > containerRect.top - loadMoreThreshold;

          if (isVisible) {
            // Reset shouldLoadRef if sentinel is visible (allows loading to resume)
            shouldLoadRef.current = true;
            loadMoreRef.current();
          }
        }
      });
    }
  }, [
    hasMore,
    loadItems,
    maxItems,
    setCachedItems,
    isLoadingMore,
    actualPageSize, // [PHASE 2.3] Use connection-aware pageSize
    shouldPause, // [PHASE 2.3] Pause on slow connections
    loadMoreThreshold,
  ]); // Added actualPageSize, shouldPause, and loadMoreThreshold used in loadMore logic

  // Store loadMore in ref for use in other hooks
  loadMoreRef.current = loadMore;

  // Virtual scrolling
  const virtualScrolling = useVirtualScrolling({
    itemCount: items.length,
    itemHeight,
    container: containerRef.current || window,
    bufferSize: actualBufferSize,
    enabled: enableVirtualScrolling && items.length > 50,
  });

  // Scroll stop detection
  // PWA FIX: Use longer delay for PWA to account for slower scroll detection
  const adjustedScrollStopDelay = isPWA
    ? scrollStopDelay * 1.5
    : scrollStopDelay;
  const { isStopped } = useScrollStopDetection({
    container: containerRef.current || window,
    delay: adjustedScrollStopDelay,
    enabled: enableScrollStopDetection,
    onScrollStop: () => {
      shouldLoadRef.current = false;
    },
    onScrollResume: () => {
      shouldLoadRef.current = true;
      // CRITICAL FIX: Don't auto-load on scroll resume
      // Let IntersectionObserver handle loading when sentinel becomes visible
      // This prevents continuous loading when user is scrolling
      // The IntersectionObserver will trigger loadMore when sentinel is visible
    },
  });

  // [FIX] Disable SWR when using ProgressiveFeed - it conflicts with progressive loading
  // SWR was loading 1 item with offset 0, interfering with the main loading mechanism
  // ProgressiveFeed handles initial load via IntersectionObserver and loadMore
  const { data: swrData, isValidating } = useStaleWhileRevalidate({
    loadFresh: async () => {
      // Disabled - ProgressiveFeed handles loading
      return [];
    },
    getCached: getCachedItems,
    setCached: setCachedItems,
    revalidateOnMount: false,
    enabled: false, // Disable SWR - ProgressiveFeed handles all loading
  });

  // [REMOVED] SWR data update effect - SWR is disabled to prevent conflicts

  // Initial load: fill viewport if no initial items
  useEffect(() => {
    // Only do initial load if we have no items and haven't started loading
    if (
      items.length === 0 &&
      hasMore &&
      !loadingRef.current &&
      !isLoadingMore &&
      !externalLoading &&
      !initialLoadCompleteRef.current // Prevent running if already completed
    ) {
      // PWA FIX: Add small delay for PWA to ensure DOM is ready
      const performInitialLoad = () => {
        const initialLoadSize = calculateInitialLoadSize();

        loadingRef.current = true;
        setIsLoadingMore(true);

        loadItems(0, initialLoadSize)
          .then((loadResult) => {
            const newItems = extractItems(loadResult);
            const consumedOffset = extractConsumedOffset(loadResult);
            const count = extractCount(loadResult);

            if (newItems.length > 0) {
              // CRITICAL FIX: Set offset to newItems.length, not consumedOffset
              // consumedOffset might be 0 or incorrect, but we definitely consumed newItems.length offsets
              offsetRef.current = newItems.length;

              // OPTIMIZATION: Use count from PostgreSQL function for reliable hasMore detection
              // If count is available and count < initialLoadSize, we've reached the end
              // Otherwise, fallback to length check (for backward compatibility)
              if (count !== undefined) {
                if (count < initialLoadSize) {
                  setHasMore(false);
                }
              } else if (newItems.length < initialLoadSize) {
                // Fallback: Use length check if count is not available
                setHasMore(false);
              }

              // PROGRESSIVE RENDERING: Add initial items one-by-one for smooth appearance
              // This gives the user immediate feedback as items appear
              newItems.forEach((item, index) => {
                const addItem = () => {
                  if (index === 0) {
                    // First item: flushSync (immediate, non-batched, forces render)
                    flushSync(() => {
                      setItems((prev) => {
                        // For initial load, we can add items directly (no duplicates yet)
                        if (prev.length === 0) {
                          // First item - add just this one
                          return [item];
                        } else {
                          // Subsequent items - merge with existing
                          const itemsMap = new Map<string, T>();
                          prev.forEach((existingItem) => {
                            itemsMap.set(existingItem.id, existingItem);
                          });
                          itemsMap.set(item.id, item);
                          return Array.from(itemsMap.values());
                        }
                      });
                    });
                    // Reset loading state immediately after first item appears
                    loadingRef.current = false;
                    setIsLoadingMore(false);
                    // Mark initial load as complete (allows IntersectionObserver to fire)
                    initialLoadCompleteRef.current = true;
                  } else {
                    // [PHASE 2.4] Subsequent items: startTransition (non-urgent, can be batched by React)
                    // 100ms delay ensures they're in separate event loop ticks for smooth appearance
                    startTransition(() => {
                      setItems((prev) => {
                        // For initial load, we can add items directly (no duplicates yet)
                        if (prev.length === 0) {
                          // First item(s) - add all items up to this index
                          return newItems.slice(0, index + 1);
                        } else {
                          // Subsequent items - merge with existing
                          const itemsMap = new Map<string, T>();
                          prev.forEach((existingItem) => {
                            itemsMap.set(existingItem.id, existingItem);
                          });
                          itemsMap.set(item.id, item);
                          return Array.from(itemsMap.values());
                        }
                      });
                    });
                  }
                };

                if (index === 0) {
                  // [PHASE 2.4] First item: show immediately (< 500ms target)
                  requestAnimationFrame(addItem);
                } else {
                  // [PHASE 2.4] Subsequent items: show with 100ms delay between each
                  // 100ms provides smoother, more natural appearance
                  setTimeout(addItem, index * 100);
                }
              });

              // Update cache asynchronously (non-blocking)
              // Defer to next tick so it doesn't block progressive rendering
              if (setCachedItems) {
                setTimeout(() => {
                  setCachedItems(newItems);
                }, 0); // Next tick, non-blocking
              }

              // REMOVED: Aggressive hasMore check that was stopping loading prematurely
              // The existing logic at line 282 (if consumedOffset === 0) already handles
              // the end case correctly. Removing this prevents false positives where
              // API returns fewer items than requested but there are still more items.
              // If there are truly no more items, API will return 0 items and consumedOffset
              // will be 0, triggering hasMore=false correctly.
            } else {
              setHasMore(false);
              // No items: reset loading state immediately and mark as complete
              loadingRef.current = false;
              setIsLoadingMore(false);
              initialLoadCompleteRef.current = true;
            }
          })
          .catch((err) => {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            console.error("[ProgressiveFeed] Initial load failed:", err);
            // On error, reset loading state immediately
            loadingRef.current = false;
            setIsLoadingMore(false);
            initialLoadCompleteRef.current = true;
          })
          .finally(() => {
            // CRITICAL FIX: Don't reset loading state here - it's handled in addItem callback
            // This ensures skeleton stays visible until first item appears
            // Only mark initial load as complete (allows IntersectionObserver to fire)
            // Note: loading state will be reset when first item appears (in addItem callback)
            // or if there are no items (handled in the else block above)
            if (items.length === 0) {
              // If no items were added (error case), mark as complete
              initialLoadCompleteRef.current = true;
            }
          });
      };

      // PWA FIX: Add small delay for PWA to ensure DOM is ready
      if (isPWA) {
        const timer = setTimeout(performInitialLoad, 100); // 100ms delay for PWA
        return () => clearTimeout(timer);
      } else {
        performInitialLoad();
      }
    } else if (items.length > 0 || initialItems) {
      // If we have items (from cache or initialItems), mark initial load as complete
      initialLoadCompleteRef.current = true;
    }
  }, []); // Only on mount

  // Safety check: Update offsetRef if initialItems prop changes after mount
  // This handles edge cases where initialItems changes without component remounting
  // (Normally components should remount with a new key when filters change)
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      const newLength = initialItems.length;
      // Only update if offsetRef doesn't match and we haven't loaded more items yet
      if (offsetRef.current !== newLength && items.length === newLength) {
        console.warn(
          `[ProgressiveFeed] initialItems prop changed. Updating offsetRef from ${offsetRef.current} to ${newLength}. Consider using a key prop to remount component instead.`
        );
        offsetRef.current = newLength;
      }
    }
  }, [initialItems, items.length]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!enableLazyLoading || !sentinelRef.current || !hasMore) {
      return;
    }
    // CRITICAL FIX: Stop loading immediately when scroll stops (regardless of item count)
    // User requested: "can you make sure that it doesn't load all of the posts right it stops if i dont scroll"
    // This prevents loading all posts when user is not scrolling
    if (isStopped && enableScrollStopDetection) {
      return; // Don't load if scroll stopped - wait for user to resume scrolling
    }

    // CRITICAL: Don't set up IntersectionObserver until initial load completes
    // This prevents race condition where observer fires before initial load finishes
    if (!initialLoadCompleteRef.current) {
      return; // Wait for initial load to complete
    }

    // PWA FIX: Adjust IntersectionObserver parameters for PWA
    // Larger rootMargin and lower threshold for more reliable triggering in PWA
    const adjustedRootMargin = isPWA
      ? `${loadMoreThreshold * 1.5}px` // 50% larger margin for PWA
      : `${loadMoreThreshold}px`;
    const adjustedThreshold = isPWA ? 0.05 : 0.1; // Lower threshold for PWA (more sensitive)

    const observer = new IntersectionObserver(
      (entries) => {
        // Double-check: Ensure initial load is complete AND not currently loading
        const canLoad =
          entries[0].isIntersecting &&
          initialLoadCompleteRef.current && // Initial load must be complete
          shouldLoadRef.current &&
          !loadingRef.current && // Primary check - ref is more reliable
          !isLoadingMore && // Secondary check - state
          loadMoreRef.current;

        if (canLoad && loadMoreRef.current) {
          loadMoreRef.current();
        }
      },
      {
        root: containerRef.current || null,
        rootMargin: adjustedRootMargin,
        threshold: adjustedThreshold,
      }
    );

    observer.observe(sentinelRef.current);

    // Check if sentinel is already visible (might be if there are only 2 items)
    const checkInitialVisibility = () => {
      if (sentinelRef.current && initialLoadCompleteRef.current) {
        const rect = sentinelRef.current.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

        // CRITICAL FIX: Respect scroll stop detection
        // Don't auto-load if scroll is stopped (user is not scrolling)
        if (isStopped && enableScrollStopDetection) {
          return; // Wait for user to resume scrolling
        }

        // Double-check: Ensure initial load is complete AND not currently loading
        const canLoad =
          isVisible &&
          initialLoadCompleteRef.current && // Initial load must be complete
          shouldLoadRef.current &&
          hasMore &&
          !loadingRef.current && // Primary check - ref is more reliable
          !isLoadingMore && // Secondary check - state
          loadMoreRef.current;

        if (canLoad) {
          // Use requestAnimationFrame to ensure observer is set up
          requestAnimationFrame(() => {
            // Re-check all conditions before calling (including scroll stop)
            if (
              initialLoadCompleteRef.current &&
              shouldLoadRef.current &&
              hasMore &&
              !loadingRef.current &&
              !isLoadingMore &&
              loadMoreRef.current &&
              // CRITICAL: Don't load if scroll is stopped
              !(isStopped && enableScrollStopDetection)
            ) {
              loadMoreRef.current();
            }
          });
        }
      }
    };

    // Check after DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(checkInitialVisibility); // Double RAF ensures layout
    });

    return () => {
      observer.disconnect();
    };
  }, [
    enableLazyLoading,
    hasMore,
    isStopped,
    enableScrollStopDetection,
    loadMoreThreshold,
    containerRef,
    items.length, // Re-check when items change (sentinel position might change)
    initialLoadCompleteRef, // Add to dependencies to ensure proper re-check
  ]);

  // Get items to render (virtual scrolling or all)
  const itemsToRender = useMemo(() => {
    if (enableVirtualScrolling && items.length > 50) {
      return items.slice(
        virtualScrolling.startIndex,
        virtualScrolling.endIndex + 1
      );
    }
    return items;
  }, [
    items,
    enableVirtualScrolling,
    virtualScrolling.startIndex,
    virtualScrolling.endIndex,
  ]);

  // Loading state
  const isLoading =
    externalLoading || isValidating || (items.length === 0 && !error);

  // Error display
  if (error && items.length === 0) {
    return (
      <div className="w-full py-8 text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            shouldLoadRef.current = true;
            loadMore();
          }}
          className="px-4 py-2 text-sm rounded-lg border border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!isLoading && items.length === 0) {
    return (
      <div className="w-full py-8 text-center">
        <p className="text-sm text-[var(--text)]/70">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="w-full"
    >
      {/* Items */}
      {enableVirtualScrolling && items.length > 50 ? (
        // Virtual scrolling mode
        <div
          style={{
            height: virtualScrolling.totalHeight,
            position: "relative",
          }}
        >
          {itemsToRender.map((item, index) => {
            const actualIndex = virtualScrolling.startIndex + index;
            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  top: virtualScrolling.getOffsetTop(actualIndex),
                  width: "100%",
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      ) : (
        // Normal mode (render all items with progressive animation)
        // Note: renderItem should return elements with keys, we don't wrap in Fragment
        <div className="feed-item-container">
          {itemsToRender.map((item, index) => (
            <div key={item.id} className="feed-item">
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton for next item */}
      {/* FIX: Only show skeleton if hasMore is true AND we're loading */}
      {hasMore && (isLoadingMore || !isStopped) && loadingComponent && (
        <div className="w-full">
          {/* Single skeleton for next item (progressive) */}
          {loadingComponent}
        </div>
      )}

      {/* "No more posts" message when feed ends */}
      {!hasMore && items.length > 0 && (
        <div className="w-full py-8 text-center">
          <p className="text-sm text-[var(--text)]/70">
            You're all caught up! No more posts to show.
          </p>
        </div>
      )}

      {/* Sentinel for intersection observer */}
      {enableLazyLoading && hasMore && (
        <div
          ref={(el) => {
            sentinelRef.current = el;
          }}
          style={{ height: "1px", width: "100%" }}
        />
      )}

      {/* Scroll stopped indicator (debug, can remove later) */}
      {enableScrollStopDetection && isStopped && hasMore && (
        <div className="text-xs text-center text-[var(--text)]/50 py-2">
          Scroll to load more
        </div>
      )}
    </div>
  );
}
