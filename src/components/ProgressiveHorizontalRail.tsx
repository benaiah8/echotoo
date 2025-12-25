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

  // Container ref (the horizontal scroll container)
  containerRef?: React.RefObject<HTMLElement>;

  // Options
  visibleItems?: number; // Items visible without scrolling (default: 3)
  bufferSize?: number | "adaptive"; // Buffer items to load (default: 2)
  pageSize?: number; // Items to load per page (default: 4)
  maxItems?: number; // Maximum items to load (0 = unlimited)
  loadMoreThreshold?: number; // Pixels from right edge to trigger load (default: 200px)
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
  containerRef: externalContainerRef,
  visibleItems = 3,
  bufferSize = "adaptive",
  pageSize = 4,
  maxItems = 0,
  loadMoreThreshold = 200,
}: ProgressiveHorizontalRailProps<T>) {
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

  // Refs
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialOffset); // Initialize with calculated offset
  const shouldLoadRef = useRef(true);

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
    if (loadingRef.current || !hasMore || !shouldLoadRef.current) return;
    if (maxItems > 0 && items.length >= maxItems) {
      setHasMore(false);
      return;
    }

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const newItems = await loadItems(offsetRef.current, pageSize);

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
        if (setCachedItems) {
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("[ProgressiveHorizontalRail] Failed to load items:", err);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, items, loadItems, pageSize, maxItems, setCachedItems]);

  // Store loadMore in ref for use in other hooks
  loadMoreRef.current = loadMore;

  // Initial load - simplified: just load visible + buffer items
  useEffect(() => {
    if (items.length > 0) return; // Already loaded

    const loadInitial = async () => {
      loadingRef.current = true;
      setIsLoadingMore(true);

      try {
        // Use initialItems if provided, otherwise load
        if (initialItems && initialItems.length > 0) {
          setItems(initialItems);
          offsetRef.current = initialItems.length;
          // Don't set hasMore = false here - only set it when we actually try to load and get 0 items
          loadingRef.current = false;
          setIsLoadingMore(false);
          return;
        }

        // Load initial batch (visible + buffer)
        const loadedItems = await loadItems(0, initialLoadSize);
        offsetRef.current = loadedItems.length;

        setItems(loadedItems);

        // Update cache
        if (setCachedItems) {
          setCachedItems(loadedItems);
        }

        // Check if we have more items
        if (loadedItems.length < initialLoadSize) {
          setHasMore(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        console.error(
          "[ProgressiveHorizontalRail] Failed to load initial items:",
          err
        );
      } finally {
        loadingRef.current = false;
        setIsLoadingMore(false);
      }
    };

    loadInitial();
  }, [initialItems, initialLoadSize, loadItems, setCachedItems]); // Include dependencies

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

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="overflow-x-auto scroll-hide py-2"
    >
      <div className="flex gap-3 w-max rail-pad">
        {/* Render all items - renderItem should return elements with keys */}
        {items.map((item, index) => {
          const rendered = renderItem(item, index);
          // renderItem should return ReactNode with key already set
          // If it's a Fragment or element, it should have a key
          return rendered;
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
