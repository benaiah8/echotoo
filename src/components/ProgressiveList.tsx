/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Progressive List Component
 *
 * Simpler version of ProgressiveFeed for lists (RSVP, followers, comments, notifications).
 * Progressive rendering with lazy loading and scroll stop detection.
 *
 * Features:
 * - Shows first batch immediately
 * - Streams remaining items one-by-one
 * - Stops loading when user stops scrolling
 * - Virtual scrolling for long lists (optional)
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useStaleWhileRevalidate } from "../hooks/useStaleWhileRevalidate";
import { useScrollStopDetection } from "../hooks/useScrollStopDetection";
import { useVirtualScrolling } from "../hooks/useVirtualScrolling";
import { useAdaptiveBuffer } from "../hooks/useAdaptiveBuffer";

export interface ProgressiveListProps<T> {
  // Data loading
  loadItems: (offset: number, limit: number) => Promise<T[]>;
  renderItem: (item: T, index: number) => React.ReactNode;

  // Initial data (for immediate display)
  initialItems?: T[];

  // Caching
  getCachedItems?: () => T[] | null;
  setCachedItems?: (items: T[]) => void;

  // Virtual scrolling
  enableVirtualScrolling?: boolean;
  itemHeight?: number; // Required if virtual scrolling enabled
  bufferSize?: number | "adaptive";

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

  // Container
  containerRef?: React.RefObject<HTMLElement>;

  // Options
  pageSize?: number; // Items to load per page (default: 10)
  maxItems?: number; // Maximum items to load (0 = unlimited)
  initialBatchSize?: number; // Items to show immediately (default: pageSize)
}

/**
 * Progressive List Component
 *
 * @example
 * ```tsx
 * <ProgressiveList
 *   loadItems={(offset, limit) => getRSVPUsers(postId, { offset, limit })}
 *   renderItem={(user, index) => <UserItem key={user.id} user={user} />}
 *   initialItems={cachedUsers}
 *   getCachedItems={() => getCachedRSVPUsers(postId)}
 *   setCachedItems={(users) => setCachedRSVPUsers(postId, users)}
 *   enableVirtualScrolling={users.length > 50}
 *   itemHeight={60}
 *   loadingComponent={<UserSkeleton />}
 * />
 * ```
 */
export default function ProgressiveList<T extends { id: string }>({
  loadItems,
  renderItem,
  initialItems,
  getCachedItems,
  setCachedItems,
  enableVirtualScrolling = false,
  itemHeight = 60,
  bufferSize = "adaptive",
  enableLazyLoading = true,
  loadMoreThreshold = 200,
  enableScrollStopDetection = true,
  scrollStopDelay = 2000,
  loading: externalLoading = false,
  error: externalError = null,
  emptyMessage = "No items to display",
  loadingComponent,
  containerRef: externalContainerRef,
  pageSize = 10,
  maxItems = 0,
  initialBatchSize,
}: ProgressiveListProps<T>) {
  // Internal state
  const [items, setItems] = useState<T[]>(() => {
    // Initialize with cached items or initial items
    if (initialItems && initialItems.length > 0) {
      return initialItems;
    }
    if (getCachedItems) {
      const cached = getCachedItems();
      if (cached && cached.length > 0) {
        return cached;
      }
    }
    return [];
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(externalError);

  // Refs
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const shouldLoadRef = useRef(true);

  // Adaptive buffer
  const { bufferSize: adaptiveBufferSize } = useAdaptiveBuffer({
    minBuffer: 1,
    maxBuffer: 2, // Smaller buffer for lists
    enableConnectionAware: true,
    enableScrollSpeedAware: false, // Don't adjust based on scroll speed for lists
  });

  // Determine actual buffer size
  const actualBufferSize = useMemo(() => {
    if (bufferSize === "adaptive") {
      return adaptiveBufferSize;
    }
    return bufferSize;
  }, [bufferSize, adaptiveBufferSize]);

  // Virtual scrolling
  const virtualScrolling = useVirtualScrolling({
    itemCount: items.length,
    itemHeight,
    container: containerRef.current || window,
    bufferSize: actualBufferSize,
    enabled: enableVirtualScrolling && items.length > 50,
  });

  // Scroll stop detection
  const { isStopped } = useScrollStopDetection({
    container: containerRef.current || window,
    delay: scrollStopDelay,
    enabled: enableScrollStopDetection,
    onScrollStop: () => {
      shouldLoadRef.current = false;
    },
    onScrollResume: () => {
      shouldLoadRef.current = true;
      // Resume loading if we have more items
      if (hasMore && !loadingRef.current) {
        loadMore();
      }
    },
  });

  // Load more items
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
          // Avoid duplicates
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueNewItems = newItems.filter(
            (item) => !existingIds.has(item.id)
          );
          return [...prev, ...uniqueNewItems];
        });
        offsetRef.current += newItems.length;

        // Update cache
        if (setCachedItems) {
          setCachedItems([...items, ...newItems]);
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
      console.error("[ProgressiveList] Failed to load items:", err);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, items, loadItems, pageSize, maxItems, setCachedItems]);

  // Initial load using SWR
  const initialSize = initialBatchSize || pageSize;
  const { data: swrData, isValidating } = useStaleWhileRevalidate({
    loadFresh: async () => {
      const freshItems = await loadItems(0, initialSize);
      offsetRef.current = freshItems.length;
      return freshItems;
    },
    getCached: getCachedItems,
    setCached: setCachedItems,
    revalidateOnMount: true,
    enabled: items.length === 0, // Only use SWR if no items loaded yet
  });

  // Update items when SWR data arrives
  useEffect(() => {
    if (swrData && items.length === 0) {
      setItems(swrData);
      offsetRef.current = swrData.length;
      if (swrData.length < initialSize) {
        setHasMore(false);
      }
    }
  }, [swrData, initialSize]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!enableLazyLoading || !sentinelRef.current || !hasMore) return;
    if (isStopped && enableScrollStopDetection) return; // Don't load if scroll stopped

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && shouldLoadRef.current) {
          loadMore();
        }
      },
      {
        root: containerRef.current || null,
        rootMargin: `${loadMoreThreshold}px`,
        threshold: 0.1,
      }
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [
    enableLazyLoading,
    hasMore,
    isStopped,
    enableScrollStopDetection,
    loadMoreThreshold,
    loadMore,
    containerRef,
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
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="w-full">
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
        // Normal mode (render all items)
        <div>
          {itemsToRender.map((item, index) => (
            <React.Fragment key={item.id}>
              {renderItem(item, index)}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Loading skeleton for next item */}
      {(isLoadingMore || (hasMore && !isStopped)) && loadingComponent && (
        <div className="w-full">
          {/* Single skeleton for next item (progressive) */}
          {loadingComponent}
        </div>
      )}

      {/* Sentinel for intersection observer */}
      {enableLazyLoading && hasMore && (
        <div ref={sentinelRef} style={{ height: "1px", width: "100%" }} />
      )}
    </div>
  );
}

