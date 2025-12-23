/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Adaptive Buffer hook
 *
 * Adapts buffer size based on connection speed, device type, and scroll speed.
 * Mobile-optimized with smaller buffers to save memory and egress.
 *
 * Use Cases:
 * - Progressive rendering
 * - Virtual scrolling
 * - Lazy loading
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useMobileNetworkDetection } from "./useMobileNetworkDetection";

export interface UseAdaptiveBufferOptions {
  // Base buffer size
  minBuffer?: number; // Default: 1 (mobile-optimized)
  maxBuffer?: number; // Default: 3 (mobile-optimized)

  // Multipliers
  connectionMultiplier?: number; // Multiply buffer based on connection (default: 1.5 for WiFi)
  scrollSpeedMultiplier?: number; // Multiply buffer based on scroll speed (default: 1.2 for fast scroll)

  // Options
  enableConnectionAware?: boolean; // Whether to adjust based on connection
  enableScrollSpeedAware?: boolean; // Whether to adjust based on scroll speed
  isMobile?: boolean; // Whether device is mobile (auto-detect if not provided)

  // Scroll speed detection
  scrollSpeedWindow?: number; // Time window to calculate scroll speed (ms, default: 500)
  fastScrollThreshold?: number; // Scroll speed to consider "fast" (pixels/ms, default: 2)
}

export interface UseAdaptiveBufferResult {
  bufferSize: number;
  isMobile: boolean;
  isWiFi: boolean;
  isCellular: boolean;
  scrollSpeed: number;
}

/**
 * Detect if device is mobile
 */
function detectMobile(): boolean {
  if (typeof window === "undefined") return false;

  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches)
  );
}

/**
 * Adaptive Buffer hook
 *
 * @example
 * ```tsx
 * const { bufferSize } = useAdaptiveBuffer({
 *   minBuffer: 1,
 *   maxBuffer: 3,
 *   enableConnectionAware: true,
 *   enableScrollSpeedAware: true,
 * });
 *
 * // Use bufferSize for virtual scrolling or progressive loading
 * const visibleEnd = visibleStart + visibleCount + bufferSize;
 * ```
 */
export function useAdaptiveBuffer(
  options: UseAdaptiveBufferOptions = {}
): UseAdaptiveBufferResult {
  const {
    minBuffer = 1, // Mobile-optimized: smaller default
    maxBuffer = 3, // Mobile-optimized: smaller max
    connectionMultiplier = 1.5, // WiFi gets 1.5x buffer
    scrollSpeedMultiplier = 1.2, // Fast scroll gets 1.2x buffer
    enableConnectionAware = true,
    enableScrollSpeedAware = true,
    isMobile: providedIsMobile,
    scrollSpeedWindow = 500,
    fastScrollThreshold = 2, // pixels per millisecond
  } = options;

  // Detect mobile
  const [isMobile, setIsMobile] = useState(() => {
    return providedIsMobile !== undefined ? providedIsMobile : detectMobile();
  });

  // Scroll speed tracking
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const scrollPositionsRef = useRef<Array<{ time: number; position: number }>>(
    []
  );
  const calculateBufferRef = useRef<(() => void) | undefined>(undefined);

  // Mobile network detection (get network info first, but don't use in callback yet)
  const networkDetection = useMobileNetworkDetection();

  // Calculate buffer function (defined before useState to use in initializer)
  const calculateBuffer = useCallback(() => {
    let baseBuffer = isMobile ? minBuffer : minBuffer + 1; // Slightly larger on desktop

    // Connection-aware adjustment
    if (enableConnectionAware) {
      if (networkDetection.isWiFi) {
        baseBuffer = Math.ceil(baseBuffer * connectionMultiplier);
      } else if (networkDetection.isCellular) {
        // Keep base buffer on cellular (conservative)
        baseBuffer = minBuffer;
      }
    }

    // Scroll speed adjustment
    if (enableScrollSpeedAware && scrollSpeed > fastScrollThreshold) {
      baseBuffer = Math.ceil(baseBuffer * scrollSpeedMultiplier);
    }

    // Clamp to min/max
    const newBuffer = Math.max(minBuffer, Math.min(maxBuffer, baseBuffer));
    setBufferSize(newBuffer);
  }, [
    isMobile,
    networkDetection.isWiFi,
    networkDetection.isCellular,
    scrollSpeed,
    minBuffer,
    maxBuffer,
    connectionMultiplier,
    scrollSpeedMultiplier,
    enableConnectionAware,
    enableScrollSpeedAware,
    fastScrollThreshold,
  ]);

  // Store calculateBuffer in ref
  calculateBufferRef.current = calculateBuffer;

  // Initial buffer calculation
  const [bufferSize, setBufferSize] = useState(() => {
    const initialIsMobile =
      providedIsMobile !== undefined ? providedIsMobile : detectMobile();
    let baseBuffer = initialIsMobile ? minBuffer : minBuffer + 1;
    if (enableConnectionAware) {
      // Initial connection check (will be updated by useMobileNetworkDetection)
      const connectionInfo = (navigator as any).connection;
      const isInitialWiFi = connectionInfo?.downlink > 10;
      if (isInitialWiFi) {
        baseBuffer = Math.ceil(baseBuffer * connectionMultiplier);
      }
    }
    return Math.max(minBuffer, Math.min(maxBuffer, baseBuffer));
  });

  // Destructure network detection for return value
  const { isWiFi, isCellular } = networkDetection;

  // Track scroll speed
  useEffect(() => {
    if (!enableScrollSpeedAware) return;

    let lastPosition = window.scrollY;
    let lastTime = Date.now();

    const handleScroll = () => {
      const currentPosition = window.scrollY;
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTime;
      const deltaPosition = Math.abs(currentPosition - lastPosition);

      if (deltaTime > 0) {
        const speed = deltaPosition / deltaTime; // pixels per millisecond

        // Update scroll positions history
        scrollPositionsRef.current.push({
          time: currentTime,
          position: currentPosition,
        });

        // Remove old positions outside window
        const cutoffTime = currentTime - scrollSpeedWindow;
        scrollPositionsRef.current = scrollPositionsRef.current.filter(
          (entry) => entry.time > cutoffTime
        );

        // Calculate average speed over window
        if (scrollPositionsRef.current.length > 1) {
          const first = scrollPositionsRef.current[0];
          const last =
            scrollPositionsRef.current[scrollPositionsRef.current.length - 1];
          const totalDelta = Math.abs(last.position - first.position);
          const totalTime = last.time - first.time;
          const avgSpeed = totalTime > 0 ? totalDelta / totalTime : 0;

          setScrollSpeed(avgSpeed);
        } else {
          setScrollSpeed(speed);
        }
      }

      lastPosition = currentPosition;
      lastTime = currentTime;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [enableScrollSpeedAware, scrollSpeedWindow]);

  // Recalculate buffer when dependencies change
  useEffect(() => {
    calculateBuffer();
  }, [calculateBuffer]);

  // Update mobile detection on resize
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile =
        providedIsMobile !== undefined ? providedIsMobile : detectMobile();
      setIsMobile(newIsMobile);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [providedIsMobile]);

  return {
    bufferSize,
    isMobile,
    isWiFi,
    isCellular,
    scrollSpeed,
  };
}

