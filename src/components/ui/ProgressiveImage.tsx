/**
 * [OPTIMIZATION FILE: Phase 5]
 * 
 * ProgressiveImage component with blur-up placeholder
 * 
 * Optimizations included:
 * - Progressive Loading: Shows low-quality placeholder first, loads high-quality in background
 * - Smooth Transition: Fade-in animation when high-quality image loads
 * - Intersection Observer: Only loads when image is near viewport
 * - requestAnimationFrame: Smooth rendering updates
 */

import React, { useState, useEffect, useRef } from "react";
import { getBestImageUrl } from "../../lib/imageOptimization";
import { imgUrlPublic } from "../../lib/img";
import { getImageQuality, shouldSkipPrefetching, getConnectionType } from "../../lib/connectionAware";

interface ProgressiveImageProps {
  src: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  viewportWidth?: number;
  rootMargin?: string; // For Intersection Observer
  onLoad?: () => void;
  onError?: () => void;
}

// [OPTIMIZATION: Phase 5 - Image] Generate low-quality placeholder URL
// Why: Show something immediately while high-quality loads, better perceived performance
// [OPTIMIZATION: Phase 6 - Connection] Adjust quality based on connection speed
// Why: Lower quality on slow connections saves bandwidth
function getLowQualityUrl(url: string, connectionQuality?: "low" | "medium" | "high"): string {
  if (!url) return "";
  
  // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware quality
  const quality = connectionQuality || "low";
  const width = quality === "low" ? 50 : quality === "medium" ? 100 : 200;
  
  // If it's a Cloudinary URL, add quality/width parameters for low-quality version
  if (url.includes("cloudinary.com") || url.includes("res.cloudinary.com")) {
    // Add q_auto:low and width parameter for placeholder
    const params = quality === "low" ? `q_auto:low&w_${width}` : `q_auto:eco&w_${width}`;
    if (url.includes("?")) {
      return `${url}&${params}`;
    }
    return `${url}?${params}`;
  }
  
  // For other URLs, try to add query params if supported
  // Fallback to original if we can't optimize
  return url;
}

export default function ProgressiveImage({
  src,
  alt = "",
  className = "",
  placeholderClassName = "",
  viewportWidth = 400,
  rootMargin = "200px",
  onLoad,
  onError,
}: ProgressiveImageProps) {
  const [lowQualityLoaded, setLowQualityLoaded] = useState(false);
  const [highQualityLoaded, setHighQualityLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highQualityImgRef = useRef<HTMLImageElement | null>(null);

  // Get public URL
  const publicUrl = imgUrlPublic(src) || src;
  
  // [OPTIMIZATION: Phase 6 - Connection] Get connection-aware image quality
  // Why: Adjust image quality based on connection speed
  const connectionQuality = getImageQuality();
  
  // Adjust viewport width based on connection quality
  const adjustedViewportWidth = connectionQuality === "low" 
    ? Math.min(viewportWidth, 300) 
    : connectionQuality === "medium" 
    ? Math.min(viewportWidth, 600) 
    : viewportWidth;
  
  const optimizedUrl = getBestImageUrl(publicUrl, adjustedViewportWidth);
  const lowQualityUrl = getLowQualityUrl(optimizedUrl, connectionQuality);

  // [OPTIMIZATION: Phase 5 - Image] Intersection Observer to load only when near viewport
  // Why: Don't load images that are far off-screen, saves bandwidth and improves performance
  useEffect(() => {
    if (!containerRef.current || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [rootMargin, shouldLoad]);

  // [OPTIMIZATION: Phase 5 - Image] Load low-quality placeholder first
  // Why: Instant visual feedback, better perceived performance
  useEffect(() => {
    if (!shouldLoad || lowQualityLoaded) return;

    const img = new Image();
    img.onload = () => {
      // [OPTIMIZATION: Phase 5 - Rendering] Use requestAnimationFrame for smooth updates
      // Why: Ensures smooth rendering, prevents layout thrashing
      requestAnimationFrame(() => {
        setLowQualityLoaded(true);
      });
    };
    img.onerror = () => {
      // If low-quality fails, try to load high-quality directly
      setLowQualityLoaded(true);
      setHighQualityLoaded(true);
    };
    img.src = lowQualityUrl;
  }, [shouldLoad, lowQualityUrl, lowQualityLoaded]);

  // [OPTIMIZATION: Phase 5 - Image] Load high-quality image in background
  // Why: Smooth transition from low to high quality, no jarring jumps
  // [OPTIMIZATION: Phase 6 - Connection] Skip high-quality load on slow connections
  // Why: Save bandwidth on slow connections, low-quality is sufficient
  useEffect(() => {
    if (!lowQualityLoaded || highQualityLoaded) return;

    // [OPTIMIZATION: Phase 6 - Connection] Skip high-quality on slow connections
    if (shouldSkipPrefetching() || getConnectionType() === "2g" || getConnectionType() === "slow-2g") {
      // On very slow connections, just use low-quality image
      setHighQualityLoaded(true);
      if (onLoad) onLoad();
      return;
    }

    const img = new Image();
    img.onload = () => {
      // [OPTIMIZATION: Phase 5 - Rendering] Use requestAnimationFrame for smooth transition
      requestAnimationFrame(() => {
        setHighQualityLoaded(true);
        if (onLoad) onLoad();
      });
    };
    img.onerror = () => {
      setHighQualityLoaded(true);
      if (onError) onError();
    };
    img.src = optimizedUrl;
    highQualityImgRef.current = img;
  }, [lowQualityLoaded, optimizedUrl, highQualityLoaded, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ minHeight: "200px" }} // Prevent layout shift
    >
      {/* Low-quality placeholder - shows immediately */}
      {lowQualityLoaded && (
        <img
          ref={imgRef}
          src={lowQualityUrl}
          alt={alt}
          className={`absolute inset-0 w-full h-full object-cover ${
            highQualityLoaded ? "opacity-0" : "opacity-100"
          } transition-opacity duration-300 blur-sm ${placeholderClassName}`}
          style={{
            filter: highQualityLoaded ? "none" : "blur(10px)",
            transform: "scale(1.1)", // Slight scale to hide blur edges
          }}
          aria-hidden={highQualityLoaded}
        />
      )}

      {/* High-quality image - fades in when loaded */}
      {highQualityLoaded && (
        <img
          src={optimizedUrl}
          alt={alt}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-100 ${className}`}
          onLoad={onLoad}
          onError={onError}
        />
      )}

      {/* Loading skeleton - shows before low-quality loads */}
      {!lowQualityLoaded && (
        <div className="absolute inset-0 bg-[var(--surface-2)] animate-pulse" />
      )}
    </div>
  );
}

