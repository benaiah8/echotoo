/**
 * ProgressiveImage — blur-up placeholder with optional natural (intrinsic) layout.
 *
 * Default layout (fill): absolute cover children + minHeight 200px (existing callers).
 * layout="natural": final image in document flow (width 100%, height auto, object-contain).
 * Pass 2E: session URL readiness skips blank/pulse when the same resolved URL already loaded.
 */

import React, { useState, useEffect, useRef } from "react";
import { getBestImageUrl } from "../../lib/imageOptimization";
import { imgUrlPublic } from "../../lib/img";
import { isLocalPreviewUrl } from "../../lib/localPreviewUrl";
import {
  getImageQuality,
  shouldSkipPrefetching,
  getConnectionType,
} from "../../lib/connectionAware";
import {
  getPublishedImageAspectRatio,
  rememberPublishedImageAspectRatio,
} from "../../lib/publishedMedia/publishedImageAspectRatioCache";
import {
  forgetProgressiveImageUrlReady,
  isProgressiveImageUrlReady,
  rememberProgressiveImageUrlReady,
} from "../../lib/progressiveImageReadinessCache";

export type ProgressiveImageLayout = "fill" | "natural";

interface ProgressiveImageProps {
  src: string;
  alt?: string;
  className?: string;
  viewportWidth?: number;
  rootMargin?: string;
  /** When true, load immediately without waiting for IntersectionObserver */
  priority?: boolean;
  /**
   * fill (default): absolute children + minHeight 200px.
   * natural: intrinsic ratio — final image in normal flow (published single-image).
   */
  layout?: ProgressiveImageLayout;
  /**
   * Object-fit for fill layout only (default cover — existing callers).
   * Multi published media uses contain inside the shared frame.
   */
  fit?: "cover" | "contain";
  /**
   * Fill-layout wrapper minHeight. Default "200px" (legacy).
   * Pass false when parent already supplies a fixed shared frame height.
   */
  fillMinHeight?: string | false;
  /** Fired with decoded bitmap size (natural layout / optional callers). */
  onNaturalSize?: (width: number, height: number) => void;
  onLoad?: () => void;
  onError?: () => void;
}

function getLowQualityUrl(
  url: string,
  connectionQuality?: "low" | "medium" | "high",
): string {
  if (!url) return "";

  if (isLocalPreviewUrl(url)) return url;

  if (!imgUrlPublic(url)) return "";

  const quality = connectionQuality || "low";
  const width = quality === "low" ? 50 : quality === "medium" ? 100 : 200;

  if (url.includes("cloudinary.com") || url.includes("res.cloudinary.com")) {
    const params =
      quality === "low" ? `q_auto:low&w_${width}` : `q_auto:eco&w_${width}`;
    if (url.includes("?")) {
      return `${url}&${params}`;
    }
    return `${url}?${params}`;
  }

  return url;
}

function reportNaturalSize(
  img: HTMLImageElement,
  src: string,
  onNaturalSize?: (width: number, height: number) => void,
): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!(w > 0) || !(h > 0)) return;
  rememberPublishedImageAspectRatio(src, w, h);
  onNaturalSize?.(w, h);
}

function resolveProgressiveUrls(
  src: string,
  viewportWidth: number,
): {
  publicUrl: string | null;
  optimizedUrl: string;
  lowQualityUrl: string;
} {
  const publicUrl = imgUrlPublic(src);
  if (!publicUrl) {
    return { publicUrl: null, optimizedUrl: "", lowQualityUrl: "" };
  }
  const connectionQuality = getImageQuality();
  const adjustedViewportWidth =
    connectionQuality === "low"
      ? Math.min(viewportWidth, 300)
      : connectionQuality === "medium"
        ? Math.min(viewportWidth, 600)
        : viewportWidth;
  const optimizedUrl = getBestImageUrl(publicUrl, adjustedViewportWidth);
  const lowQualityUrl = getLowQualityUrl(optimizedUrl, connectionQuality);
  return { publicUrl, optimizedUrl, lowQualityUrl };
}

/** LI1D.1 — plain <img> for blob:/capacitor:/file:/Capacitor localhost previews. */
function LocalSessionPreviewImage({
  src,
  alt = "",
  className = "",
  layout = "fill",
  fit = "cover",
  fillMinHeight = "200px",
  onNaturalSize,
  onLoad,
  onError,
}: ProgressiveImageProps) {
  if (layout === "natural") {
    const knownRatio = getPublishedImageAspectRatio(src);
    return (
      <div
        className={`relative w-full overflow-hidden ${className}`}
        data-progressive-layout="natural"
        style={
          knownRatio != null
            ? { aspectRatio: `${knownRatio}` }
            : { width: "100%" }
        }
      >
        <img
          src={src}
          alt={alt}
          className="block h-auto w-full object-contain"
          draggable={false}
          onLoad={(e) => {
            reportNaturalSize(e.currentTarget, src, onNaturalSize);
            onLoad?.();
          }}
          onError={onError}
        />
      </div>
    );
  }

  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={
        fillMinHeight === false ? undefined : { minHeight: fillMinHeight }
      }
    >
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${fitClass}`}
        draggable={false}
        onLoad={(e) => {
          reportNaturalSize(e.currentTarget, src, onNaturalSize);
          onLoad?.();
        }}
        onError={onError}
      />
    </div>
  );
}

function ProgressiveRemoteImage({
  src,
  alt = "",
  className = "",
  viewportWidth = 400,
  rootMargin = "200px",
  priority = false,
  layout = "fill",
  fit = "cover",
  fillMinHeight = "200px",
  onNaturalSize,
  onLoad,
  onError,
}: ProgressiveImageProps) {
  const natural = layout === "natural";
  const knownNaturalRatio = natural
    ? getPublishedImageAspectRatio(src)
    : null;
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  const { publicUrl, optimizedUrl, lowQualityUrl } = resolveProgressiveUrls(
    src,
    viewportWidth,
  );

  const highReadyInitial = isProgressiveImageUrlReady(optimizedUrl);
  const lowReadyInitial =
    highReadyInitial || isProgressiveImageUrlReady(lowQualityUrl);

  const [lowQualityLoaded, setLowQualityLoaded] = useState(lowReadyInitial);
  const [highQualityLoaded, setHighQualityLoaded] = useState(highReadyInitial);
  const [shouldLoad, setShouldLoad] = useState(
    () => !!priority || lowReadyInitial || highReadyInitial,
  );
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

  // URL / variant change: adopt readiness for the new resolved URLs (never keep stale paint).
  useEffect(() => {
    const highReady = isProgressiveImageUrlReady(optimizedUrl);
    const lowReady = highReady || isProgressiveImageUrlReady(lowQualityUrl);
    setHighQualityLoaded(highReady);
    setLowQualityLoaded(lowReady);
    if (priority || lowReady || highReady) {
      setShouldLoad(true);
    }
  }, [optimizedUrl, lowQualityUrl, priority]);

  useEffect(() => {
    if (priority && !shouldLoad) setShouldLoad(true);
  }, [priority, shouldLoad]);

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
      },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [rootMargin, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || lowQualityLoaded) return;
    if (!lowQualityUrl) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      rememberProgressiveImageUrlReady(lowQualityUrl);
      requestAnimationFrame(() => {
        if (cancelled) return;
        setLowQualityLoaded(true);
      });
    };
    img.onerror = () => {
      if (cancelled) return;
      // Do not cache failures — advance past LQ stage only for this mount.
      setLowQualityLoaded(true);
      setHighQualityLoaded(true);
    };
    img.src = lowQualityUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [shouldLoad, lowQualityUrl, lowQualityLoaded]);

  useEffect(() => {
    if (!lowQualityLoaded || highQualityLoaded) return;
    if (!optimizedUrl) return;

    if (
      shouldSkipPrefetching() ||
      getConnectionType() === "2g" ||
      getConnectionType() === "slow-2g"
    ) {
      // Stay on LQ for this mount — do not mark HQ URL ready.
      setHighQualityLoaded(true);
      onLoadRef.current?.();
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      rememberProgressiveImageUrlReady(optimizedUrl);
      requestAnimationFrame(() => {
        if (cancelled) return;
        setHighQualityLoaded(true);
        onLoadRef.current?.();
      });
    };
    img.onerror = () => {
      if (cancelled) return;
      forgetProgressiveImageUrlReady(optimizedUrl);
      setHighQualityLoaded(true);
      onErrorRef.current?.();
    };
    img.src = optimizedUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [
    lowQualityLoaded,
    optimizedUrl,
    highQualityLoaded,
  ]);

  if (!publicUrl) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={
          natural
            ? knownNaturalRatio != null
              ? { width: "100%", aspectRatio: `${knownNaturalRatio}` }
              : { width: "100%" }
            : fillMinHeight === false
              ? undefined
              : { minHeight: fillMinHeight }
        }
      >
        <div
          className={
            natural
              ? "w-full animate-pulse bg-[var(--surface-2)]"
              : "absolute inset-0 animate-pulse bg-[var(--surface-2)]"
          }
          style={
            natural && knownNaturalRatio != null
              ? { aspectRatio: `${knownNaturalRatio}` }
              : natural
                ? { aspectRatio: "1 / 1" }
                : undefined
          }
        />
      </div>
    );
  }

  const handleDisplayedHighError = () => {
    forgetProgressiveImageUrlReady(optimizedUrl);
    setHighQualityLoaded(false);
    setLowQualityLoaded(isProgressiveImageUrlReady(lowQualityUrl));
    onErrorRef.current?.();
  };

  if (natural) {
    const flowSrc = highQualityLoaded
      ? optimizedUrl
      : lowQualityLoaded
        ? lowQualityUrl
        : "";
    return (
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden ${className}`}
        data-progressive-layout="natural"
        data-progressive-ready={highQualityLoaded ? "high" : lowQualityLoaded ? "low" : "none"}
        style={
          knownNaturalRatio != null
            ? { width: "100%", aspectRatio: `${knownNaturalRatio}` }
            : { width: "100%" }
        }
      >
        {!flowSrc ? (
          <div
            className="w-full animate-pulse bg-[var(--surface-2)]"
            style={
              knownNaturalRatio != null
                ? { aspectRatio: `${knownNaturalRatio}` }
                : { aspectRatio: "1 / 1" }
            }
            aria-hidden
            data-progressive-placeholder={
              knownNaturalRatio != null ? "known-ratio" : "square"
            }
          />
        ) : (
          <img
            ref={imgRef}
            src={flowSrc}
            alt={alt}
            className="block h-auto w-full object-contain"
            draggable={false}
            onLoad={(e) => {
              if (flowSrc === optimizedUrl) {
                rememberProgressiveImageUrlReady(optimizedUrl);
              } else if (flowSrc === lowQualityUrl) {
                rememberProgressiveImageUrlReady(lowQualityUrl);
              }
              reportNaturalSize(e.currentTarget, src, onNaturalSize);
              if (highQualityLoaded) onLoadRef.current?.();
            }}
            onError={
              flowSrc === optimizedUrl ? handleDisplayedHighError : onError
            }
          />
        )}
        {lowQualityLoaded && !highQualityLoaded ? (
          <img
            src={lowQualityUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-100 blur-sm"
            style={{ transform: "scale(1.02)" }}
            aria-hidden
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={
        fillMinHeight === false ? undefined : { minHeight: fillMinHeight }
      }
      data-progressive-layout="fill"
      data-progressive-fit={fit}
      data-progressive-ready={highQualityLoaded ? "high" : lowQualityLoaded ? "low" : "none"}
    >
      {lowQualityLoaded && (
        <img
          ref={imgRef}
          src={lowQualityUrl}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${fitClass} ${
            highQualityLoaded ? "opacity-0" : "opacity-100"
          } transition-opacity duration-300 blur-sm`}
          style={{
            filter: highQualityLoaded ? "none" : "blur(10px)",
            transform: "scale(1.1)",
          }}
          aria-hidden={highQualityLoaded}
          onLoad={() => {
            rememberProgressiveImageUrlReady(lowQualityUrl);
          }}
        />
      )}

      {highQualityLoaded && (
        <img
          src={optimizedUrl}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${fitClass} transition-opacity duration-300 opacity-100`}
          onLoad={(e) => {
            rememberProgressiveImageUrlReady(optimizedUrl);
            reportNaturalSize(e.currentTarget, src, onNaturalSize);
            onLoadRef.current?.();
          }}
          onError={handleDisplayedHighError}
        />
      )}

      {!lowQualityLoaded && (
        <div className="absolute inset-0 animate-pulse bg-[var(--surface-2)]" />
      )}
    </div>
  );
}

/**
 * Progressive remote images, or direct local session preview (LI1D.1).
 * Hook-safe: branches to separate components so hook counts stay stable.
 */
export default function ProgressiveImage(props: ProgressiveImageProps) {
  if (isLocalPreviewUrl(props.src)) {
    return <LocalSessionPreviewImage {...props} />;
  }
  return <ProgressiveRemoteImage {...props} />;
}
