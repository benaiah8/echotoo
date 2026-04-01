/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Progressive Horizontal Rail Component
 *
 * Progressive loading for horizontal scrolling rails (hangouts).
 * Loads visible + buffer items initially, then loads more as user scrolls horizontally.
 *
 * Features:
 * - Shows first 3-4 visible items + 2-3 buffer items immediately
 * - Loads more as user scrolls horizontally
 * - Stops loading when horizontal scroll stops
 * - If fast enough, loads new items; if not, shows last 1-2 from previous rail first
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useScrollStopDetection } from "../hooks/useScrollStopDetection";
import { useAdaptiveBuffer } from "../hooks/useAdaptiveBuffer";
import { onPostChanged } from "../lib/postEvents";
import { applyPostPatch } from "../lib/applyPostPatch";
import { logFetchStart } from "../lib/tabVisibilityDebug";

export interface ProgressiveHorizontalRailProps<T> {
  // Data loading
  loadItems: (offset: number, limit: number) => Promise<T[]>;
  renderItem: (item: T, index: number) => React.ReactNode;

  // Initial data (for immediate display)
  initialItems?: T[];

  // Caching
  getCachedItems?: () => T[] | null;
  setCachedItems?: (items: T[]) => void;

  // Loading states
  loading?: boolean;
  error?: string | null;

  // Loading skeleton component
  loadingComponent?: React.ReactNode;

  // Empty state
  emptyComponent?: React.ReactNode; // Component to show when items.length === 0 and not loading

  // Filter metadata (for separator and visual distinction)
  filteredCount?: number; // Number of filtered items (items at index < filteredCount are filtered)
  hasActiveFilters?: boolean; // Whether filters are active (for conditional rendering)

  // Container ref (the horizontal scroll container)
  containerRef?: React.RefObject<HTMLElement>;

  // Options
  visibleItems?: number; // Items visible without scrolling (default: 3)
  bufferSize?: number | "adaptive"; // Buffer items to load (default: 2)
  pageSize?: number; // Items to load per page (default: 4)
  maxItems?: number; // Maximum items to load (0 = unlimited)
  loadMoreThreshold?: number; // Pixels from right edge to trigger load (default: 200px)
  /** When false (e.g. Home tab hidden on /u/me), initial-load effect does not run */
  isVisible?: boolean;
  /** [DEBUG] Tab id for visibility logging */
  tabId?: string;
}

/**
 * Progressive Horizontal Rail Component
 *
 * @example
 * ```tsx
 * <ProgressiveHorizontalRail
 *   loadItems={(offset, limit) => getHangouts({ offset, limit })}
 *   renderItem={(hangout, index) => <Hangout key={hangout.id} {...hangout} />}
 *   initialItems={cachedHangouts}
 *   previousRailItems={lastRailItems}
 *   visibleItems={3}
 *   bufferSize={2}
 * />
 * ```
 */
export default function ProgressiveHorizontalRail<T extends { id: string }>({
  loadItems,
  renderItem,
  initialItems,
  getCachedItems,
  setCachedItems,
  loading: externalLoading = false,
  error: externalError = null,
  loadingComponent,
  emptyComponent,
  filteredCount,
  hasActiveFilters = false,
  containerRef: externalContainerRef,
  visibleItems = 3,
  bufferSize = "adaptive",
  pageSize = 4,
  maxItems = 0,
  loadMoreThreshold = 200,
  isVisible = true,
  tabId = "unknown",
}: ProgressiveHorizontalRailProps<T>) {
  // [FIX] Only use initialItems prop for initial state
  // Do NOT call getCachedItems() during render - it causes re-render loops
  // getCachedItems() is created with useCallback and gets new reference on every render
  // Calling it during render causes component to re-render when cache populates
  const initialItemsArray = useMemo(() => {
    if (initialItems && initialItems.length > 0) {
      // Deduplicate by ID to prevent duplicate keys
      return Array.from(
        new Map(initialItems.map((item) => [item.id, item])).values()
      );
    }
    return [];
  }, []); // Empty deps - only run on mount, ignore initialItems changes

  const initialOffset = initialItemsArray.length;

  // Internal state
  const [items, setItems] = useState<T[]>(initialItemsArray);

  // [POST EVENTS] Patch rail items on save/like/follow so cards update immediately
  useEffect(() => {
    const cleanup = onPostChanged((e) => {
      const { postId, patch } = e.detail;
      setItems((prev) => {
        const next = prev.map((item) =>
          item.id !== postId
            ? item
            : (applyPostPatch(item as Record<string, unknown>, patch) as T)
        );
        if (setCachedItems && next.some((n, i) => n !== prev[i])) {
          setTimeout(() => {
            if (aliveRef.current) setCachedItems(next);
          }, 0);
        }
        return next;
      });
    });
    return cleanup;
  }, [setCachedItems]);
  // [FIX] Initialize isLoadingMore to true if we have no initial items
  // This ensures skeleton shows immediately instead of blank screen
  const [isLoadingMore, setIsLoadingMore] = useState(
    initialItemsArray.length === 0
  );
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(externalError);

  // Refs
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialOffset); // Initialize with calculated offset
  const shouldLoadRef = useRef(true);
  /** False after unmount — in-flight loads must not write cache/state (stale vs home refresh purge). */
  const aliveRef = useRef(true);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Adaptive buffer
  const { bufferSize: adaptiveBufferSize, isWiFi } = useAdaptiveBuffer({
    minBuffer: 2,
    maxBuffer: 3,
    enableConnectionAware: true,
    enableScrollSpeedAware: false, // Don't adjust based on scroll speed for horizontal
  });

  // Determine actual buffer size
  const actualBufferSize = useMemo(() => {
    if (bufferSize === "adaptive") {
      return adaptiveBufferSize;
    }
    return bufferSize;
  }, [bufferSize, adaptiveBufferSize]);

  // Initial load size (visible + buffer)
  const initialLoadSize = visibleItems + actualBufferSize;

  // Horizontal scroll stop detection
  // Note: We need to wait for containerRef to be set
  const containerElement = containerRef.current;
  const { isStopped } = useScrollStopDetection({
    container: containerElement || null,
    delay: 1500, // Shorter delay for horizontal (1.5s)
    enabled: !!containerElement,
    onScrollStop: () => {
      shouldLoadRef.current = false;
    },
    onScrollResume: () => {
      shouldLoadRef.current = true;
      // Resume loading if we have more items
      if (hasMore && !loadingRef.current && loadMoreRef.current) {
        loadMoreRef.current();
      }
    },
  });

  // Load more items (defined before hooks that use it)
  const loadMoreRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const loadMore = useCallback(async () => {
    if (!isVisible) return;
    if (loadingRef.current || !hasMore || !shouldLoadRef.current) return;
    if (maxItems > 0 && items.length >= maxItems) {
      setHasMore(false);
      return;
    }

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      logFetchStart("ProgressiveHorizontalRail", tabId, isVisible, undefined);
      const newItems = await loadItems(offsetRef.current, pageSize);

      if (!aliveRef.current || !isVisibleRef.current) return;

      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => {
          // Avoid duplicates - use Map to ensure uniqueness
          const itemsMap = new Map<string, T>();
          // Add existing items
          prev.forEach((item) => {
            itemsMap.set(item.id, item);
          });
          // Add new items (will overwrite duplicates if any)
          newItems.forEach((item) => {
            itemsMap.set(item.id, item);
          });
          return Array.from(itemsMap.values());
        });
        offsetRef.current += newItems.length;

        // Update cache with deduplicated items
        if (setCachedItems && aliveRef.current) {
          const cachedItems = getCachedItems?.() || [];
          const itemsMap = new Map<string, T>();
          // Add previous cached items
          cachedItems.forEach((item) => itemsMap.set(item.id, item));
          // Add new items (will overwrite duplicates)
          newItems.forEach((item) => itemsMap.set(item.id, item));
          setCachedItems(Array.from(itemsMap.values()));
        }

        // Check if we've reached max items
        if (maxItems > 0 && items.length + newItems.length >= maxItems) {
          setHasMore(false);
        } else if (newItems.length < pageSize) {
          setHasMore(false);
        }
      }
    } catch (err) {
      if (!aliveRef.current) return;
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("[ProgressiveHorizontalRail] Failed to load items:", err);
    } finally {
      loadingRef.current = false;
      if (aliveRef.current) setIsLoadingMore(false);
    }
  }, [
    hasMore,
    items,
    loadItems,
    pageSize,
    maxItems,
    setCachedItems,
    getCachedItems,
    isVisible,
    tabId,
  ]);

  // Store loadMore in ref for use in other hooks
  loadMoreRef.current = loadMore;

  // [FIX] Initial load - check cache ONCE on mount (or when isVisible turns true), not during render
  // When isVisible is false (e.g. Home tab hidden on /u/me), skip to avoid duplicate get_feed_with_related_data
  useEffect(() => {
    if (!isVisible) return;
    if (items.length > 0) return; // Already have items from initialItems prop

    let cancelled = false;

    const loadInitial = async () => {
      loadingRef.current = true;
      setIsLoadingMore(true);

      try {
        // Step 1: Check cache ONCE on mount (not during render)
        // This prevents re-render loops when getCachedItems reference changes
        if (getCachedItems) {
          const cached = getCachedItems();
          if (cancelled || !aliveRef.current) return;
          if (cached && cached.length > 0) {
            // Deduplicate by ID
            const deduplicated = Array.from(
              new Map(cached.map((item) => [item.id, item])).values()
            );
            if (cancelled || !aliveRef.current) return;
            setItems(deduplicated);
            offsetRef.current = deduplicated.length;
            if (setCachedItems && aliveRef.current) {
              setCachedItems(deduplicated);
            }
            loadingRef.current = false;
            if (aliveRef.current) setIsLoadingMore(false);
            return;
          }
        }

        // Step 2: Use initialItems if provided (shouldn't happen, already checked)
        if (initialItems && initialItems.length > 0) {
          const deduplicated = Array.from(
            new Map(initialItems.map((item) => [item.id, item])).values()
          );
          if (cancelled || !aliveRef.current) return;
          setItems(deduplicated);
          offsetRef.current = deduplicated.length;
          loadingRef.current = false;
          if (aliveRef.current) setIsLoadingMore(false);
          return;
        }

        // Step 3: No cache, load from API
        logFetchStart("ProgressiveHorizontalRail", tabId, isVisible, undefined);
        const loadedItems = await loadItems(0, initialLoadSize);
        if (cancelled || !aliveRef.current) return;
        offsetRef.current = loadedItems.length;

        // Deduplicate by ID
        const deduplicated = Array.from(
          new Map(loadedItems.map((item) => [item.id, item])).values()
        );
        setItems(deduplicated);

        // Update cache
        if (setCachedItems && aliveRef.current) {
          setCachedItems(deduplicated);
        }

        // Check if we have more items
        if (deduplicated.length < initialLoadSize) {
          setHasMore(false);
        }
      } catch (err) {
        if (!cancelled && aliveRef.current) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          console.error(
            "[ProgressiveHorizontalRail] Failed to load initial items:",
            err
          );
        }
      } finally {
        loadingRef.current = false;
        if (!cancelled && aliveRef.current) setIsLoadingMore(false);
      }
    };

    loadInitial();
    // Re-run when isVisible turns true (e.g. user navigates to Home) so we load then
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  // Intersection Observer for horizontal lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!sentinelRef.current || !hasMore || !container) return;
    if (isStopped) return; // Don't load if scroll stopped

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          shouldLoadRef.current &&
          loadMoreRef.current
        ) {
          loadMoreRef.current();
        }
      },
      {
        root: container,
        rootMargin: `0px ${loadMoreThreshold}px 0px 0px`, // Trigger when near right edge
        threshold: 0.1,
      }
    );

    observer.observe(sentinelRef.current);

    // Check if sentinel is already visible and trigger load if needed
    // This handles the case where initialItems are loaded and sentinel is already in viewport
    const checkInitialVisibility = () => {
      if (sentinelRef.current && container) {
        const rect = sentinelRef.current.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // Check if sentinel is visible (within container bounds + threshold)
        const isVisible =
          rect.left < containerRect.right + loadMoreThreshold &&
          rect.right > containerRect.left &&
          rect.top < containerRect.bottom &&
          rect.bottom > containerRect.top;

        if (
          isVisible &&
          shouldLoadRef.current &&
          hasMore &&
          !loadingRef.current &&
          loadMoreRef.current
        ) {
          // Use requestAnimationFrame for better timing
          requestAnimationFrame(() => {
            if (
              shouldLoadRef.current &&
              hasMore &&
              !loadingRef.current &&
              loadMoreRef.current
            ) {
              loadMoreRef.current();
            }
          });
        }
      }
    };

    // Check after DOM is ready using requestAnimationFrame
    requestAnimationFrame(() => {
      requestAnimationFrame(checkInitialVisibility); // Double RAF ensures layout is complete
    });

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isStopped, loadMoreThreshold, containerRef, items.length]); // Added items.length to re-check when items change

  // Loading state
  const isLoading = externalLoading || (items.length === 0 && !error);

  // Error display
  if (error && items.length === 0) {
    return (
      <div className="w-full py-4 text-center">
        <p className="text-sm text-red-400 mb-2">{error}</p>
        <button
          onClick={() => {
            setError(null);
            shouldLoadRef.current = true;
            loadMore();
          }}
          className="px-3 py-1.5 text-xs rounded-lg border border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state: Only show if completely empty AND no filters (or filters returned nothing AND no fallback)
  // If filteredCount === 0, we show empty card + unfiltered items, so don't return early
  if (
    !isLoading &&
    items.length === 0 &&
    emptyComponent &&
    filteredCount !== 0
  ) {
    return (
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="overflow-x-auto scroll-hide py-2"
      >
        <div className="flex gap-3 w-max rail-pad">{emptyComponent}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="overflow-x-auto scroll-hide py-2"
    >
      <div className="flex gap-3 w-max rail-pad">
        {/* [ENHANCEMENT: Empty State] Show empty card as first item when filteredCount === 0 */}
        {filteredCount === 0 && emptyComponent && (
          <div className="shrink-0">{emptyComponent}</div>
        )}

        {/* Render all items - renderItem should return elements with keys */}
        {items.map((item, index) => {
          const rendered = renderItem(item, index);
          // renderItem should return ReactNode with key already set
          // If it's a Fragment or element, it should have a key

          // Render separator after last filtered item (if we have both filtered and unfiltered)
          const shouldShowSeparator =
            hasActiveFilters &&
            filteredCount !== undefined &&
            filteredCount > 0 &&
            index === filteredCount - 1 &&
            filteredCount < items.length;

          return (
            <React.Fragment key={item.id}>
              {rendered}
              {shouldShowSeparator && (
                <div
                  className="w-px h-full bg-blue-500/50 mx-2 shrink-0"
                  aria-hidden="true"
                  style={{ minHeight: "208px" }} // Match Hangout card height (date strip + author + caption + footer)
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Loading skeleton for next item */}
        {(isLoadingMore || (hasMore && !isStopped)) && loadingComponent && (
          <div className="shrink-0">{loadingComponent}</div>
        )}

        {/* Sentinel for intersection observer (invisible element at the end) */}
        {hasMore && (
          <div
            ref={sentinelRef}
            style={{ width: "1px", height: "1px", flexShrink: 0 }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
