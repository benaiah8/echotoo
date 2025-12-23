/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Scroll Stop Detection hook
 *
 * Detects when user stops scrolling and triggers callback.
 * Useful for stopping data loading when user stops scrolling to save egress.
 *
 * Use Cases:
 * - Stop loading when user stops scrolling
 * - Save egress
 * - Resume loading when scrolling resumes
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseScrollStopDetectionOptions {
  // Scroll container (default: window)
  container?: HTMLElement | Window | null;

  // Delay before considering scroll stopped (ms)
  delay?: number; // Default: 2000ms (2 seconds)

  // Debounce scroll events (ms)
  debounceMs?: number; // Default: 100ms

  // Callbacks
  onScrollStop?: () => void;
  onScrollResume?: () => void;

  // Options
  enabled?: boolean; // Whether detection is enabled
  threshold?: number; // Minimum scroll distance to trigger (pixels)
}

export interface UseScrollStopDetectionResult {
  isScrolling: boolean;
  isStopped: boolean;
  scrollPosition: number;
  reset: () => void; // Reset detection state
}

/**
 * Scroll Stop Detection hook
 *
 * @example
 * ```tsx
 * const { isStopped, isScrolling } = useScrollStopDetection({
 *   delay: 2000,
 *   onScrollStop: () => {
 *     console.log("User stopped scrolling");
 *     stopLoading();
 *   },
 *   onScrollResume: () => {
 *     console.log("User resumed scrolling");
 *     resumeLoading();
 *   },
 * });
 * ```
 */
export function useScrollStopDetection(
  options: UseScrollStopDetectionOptions = {}
): UseScrollStopDetectionResult {
  const {
    container = typeof window !== "undefined" ? window : null,
    delay = 2000,
    debounceMs = 100,
    onScrollStop,
    onScrollResume,
    enabled = true,
    threshold = 0,
  } = options;

  // State
  const [isScrolling, setIsScrolling] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Refs
  const scrollStopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollPositionRef = useRef(0);
  const wasScrollingRef = useRef(false);

  // Get scroll position
  const getScrollPosition = useCallback(() => {
    if (!container) return 0;

    if (container === window) {
      return window.scrollY || window.pageYOffset || 0;
    } else if (container instanceof HTMLElement) {
      return container.scrollTop;
    }

    return 0;
  }, [container]);

  // Handle scroll stop
  const handleScrollStop = useCallback(() => {
    setIsScrolling(false);
    setIsStopped(true);
    onScrollStop?.();
  }, [onScrollStop]);

  // Handle scroll resume
  const handleScrollResume = useCallback(() => {
    if (wasScrollingRef.current && isStopped) {
      setIsStopped(false);
      onScrollResume?.();
    }
    wasScrollingRef.current = true;
    setIsScrolling(true);
  }, [isStopped, onScrollResume]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    if (!enabled || !container) return;

    const currentPosition = getScrollPosition();
    const scrollDelta = Math.abs(
      currentPosition - lastScrollPositionRef.current
    );

    // Check if scroll distance meets threshold
    if (scrollDelta < threshold) {
      return; // Ignore small scroll movements
    }

    // Update position
    lastScrollPositionRef.current = currentPosition;
    setScrollPosition(currentPosition);

    // Clear existing timers
    if (scrollStopTimerRef.current) {
      clearTimeout(scrollStopTimerRef.current);
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce scroll events
    debounceTimerRef.current = setTimeout(() => {
      handleScrollResume();

      // Set timer for scroll stop
      scrollStopTimerRef.current = setTimeout(() => {
        handleScrollStop();
      }, delay);
    }, debounceMs);
  }, [
    enabled,
    container,
    getScrollPosition,
    threshold,
    delay,
    debounceMs,
    handleScrollResume,
    handleScrollStop,
  ]);

  // Setup scroll listener
  useEffect(() => {
    if (!enabled || !container) return;

    // Initialize position
    lastScrollPositionRef.current = getScrollPosition();
    setScrollPosition(lastScrollPositionRef.current);

    // Add scroll listener
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollStopTimerRef.current) {
        clearTimeout(scrollStopTimerRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, container, handleScroll, getScrollPosition]);

  // Reset function
  const reset = useCallback(() => {
    setIsScrolling(false);
    setIsStopped(false);
    wasScrollingRef.current = false;
    if (scrollStopTimerRef.current) {
      clearTimeout(scrollStopTimerRef.current);
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    isScrolling,
    isStopped,
    scrollPosition,
    reset,
  };
}

