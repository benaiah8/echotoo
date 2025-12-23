/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Virtual Scrolling hook
 *
 * Calculates visible items based on scroll position and renders only visible + buffer items.
 * Optimizes performance for long lists by not rendering items outside viewport.
 *
 * Use Cases:
 * - Long lists (100+ items)
 * - Comments threads
 * - Followers lists
 * - RSVP lists with many users
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface UseVirtualScrollingOptions {
  // Total number of items
  itemCount: number;

  // Height of each item (pixels)
  itemHeight: number;

  // Container element (default: window)
  container?: HTMLElement | Window | null;

  // Buffer size (items to render outside viewport)
  bufferSize?: number; // Default: 2

  // Options
  enabled?: boolean; // Whether virtual scrolling is enabled
  overscan?: number; // Additional items to render (default: 0)
}

export interface UseVirtualScrollingResult {
  // Visible range
  startIndex: number;
  endIndex: number;
  visibleCount: number;

  // Scroll info
  scrollTop: number;
  totalHeight: number;

  // Helper functions
  getOffsetTop: (index: number) => number; // Get top offset for item at index
  scrollToIndex: (index: number) => void; // Scroll to item at index
}

/**
 * Virtual Scrolling hook
 *
 * @example
 * ```tsx
 * const { startIndex, endIndex, visibleCount } = useVirtualScrolling({
 *   itemCount: posts.length,
 *   itemHeight: 400, // Post height in pixels
 *   bufferSize: 2,
 * });
 *
 * // Render only visible items
 * {posts.slice(startIndex, endIndex + 1).map((post, idx) => (
 *   <Post key={post.id} post={post} index={startIndex + idx} />
 * ))}
 * ```
 */
export function useVirtualScrolling(
  options: UseVirtualScrollingOptions
): UseVirtualScrollingResult {
  const {
    itemCount,
    itemHeight,
    container = typeof window !== "undefined" ? window : null,
    bufferSize = 2,
    enabled = true,
    overscan = 0,
  } = options;

  // State
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Refs
  const containerRef = useRef<HTMLElement | Window | null>(container);
  const rafRef = useRef<number | null>(null);

  // Update container ref
  useEffect(() => {
    containerRef.current = container;
  }, [container]);

  // Get container dimensions
  const getContainerDimensions = useCallback(() => {
    if (!containerRef.current) return { height: 0, scrollTop: 0 };

    if (containerRef.current === window) {
      return {
        height: window.innerHeight,
        scrollTop: window.scrollY || window.pageYOffset || 0,
      };
    } else if (containerRef.current instanceof HTMLElement) {
      return {
        height: containerRef.current.clientHeight,
        scrollTop: containerRef.current.scrollTop,
      };
    }

    return { height: 0, scrollTop: 0 };
  }, []);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    if (!enabled || itemCount === 0) {
      return { start: 0, end: itemCount - 1 };
    }

    const { height, scrollTop: currentScrollTop } = getContainerDimensions();

    // Calculate visible range
    const start = Math.floor(currentScrollTop / itemHeight);
    const end = Math.min(
      itemCount - 1,
      Math.ceil((currentScrollTop + height) / itemHeight)
    );

    // Add buffer
    const bufferedStart = Math.max(0, start - bufferSize - overscan);
    const bufferedEnd = Math.min(itemCount - 1, end + bufferSize + overscan);

    return {
      start: bufferedStart,
      end: bufferedEnd,
    };
  }, [
    enabled,
    itemCount,
    itemHeight,
    bufferSize,
    overscan,
    getContainerDimensions,
  ]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    if (!enabled || !containerRef.current) return;

    // Use requestAnimationFrame for smooth updates
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const { height, scrollTop: currentScrollTop } = getContainerDimensions();
      setScrollTop(currentScrollTop);
      setContainerHeight(height);
    });
  }, [enabled, getContainerDimensions]);

  // Setup scroll listener
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    // Initialize dimensions
    const { height, scrollTop: currentScrollTop } = getContainerDimensions();
    setScrollTop(currentScrollTop);
    setContainerHeight(height);

    // Add scroll listener
    containerRef.current.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    // Handle resize
    const handleResize = () => {
      const { height: newHeight } = getContainerDimensions();
      setContainerHeight(newHeight);
    };

    if (containerRef.current === window) {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener("scroll", handleScroll);
      }
      if (containerRef.current === window) {
        window.removeEventListener("resize", handleResize);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled, handleScroll, getContainerDimensions]);

  // Get offset top for item
  const getOffsetTop = useCallback(
    (index: number) => {
      return index * itemHeight;
    },
    [itemHeight]
  );

  // Scroll to index
  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current) return;

      const offsetTop = getOffsetTop(index);

      if (containerRef.current === window) {
        window.scrollTo({ top: offsetTop, behavior: "smooth" });
      } else if (containerRef.current instanceof HTMLElement) {
        containerRef.current.scrollTo({ top: offsetTop, behavior: "smooth" });
      }
    },
    [getOffsetTop]
  );

  // Calculate total height
  const totalHeight = itemCount * itemHeight;

  return {
    startIndex: visibleRange.start,
    endIndex: visibleRange.end,
    visibleCount: visibleRange.end - visibleRange.start + 1,
    scrollTop,
    totalHeight,
    getOffsetTop,
    scrollToIndex,
  };
}

