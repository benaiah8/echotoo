/**
 * Mixed published media fullscreen overlay (images + video).
 * React full-viewport overlay — not browser Fullscreen API as the container.
 * Order matches Post Detail exactly (image ↔ video ↔ image).
 *
 * In-tree PublishedVideoPlayer per video slide. Detail ↔ Fullscreen playback
 * uses explicit snapshot handoffs (no body-level video portal). Feed ↔ Detail
 * snapshot handoff exists in code but physical continuity remains deferred.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Zoom } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";
import "swiper/css/zoom";

import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
  snapBackLightboxSwipeContentStyle,
} from "../lib/lightboxSwipeDim";
import { acquirePullToRefreshBlock } from "../lib/pullToRefreshBlock";
import { useOverlayBackgroundScrollLock } from "../hooks/useOverlayBackgroundScrollLock";
import { imgUrlPublic } from "../lib/img";
import {
  adjacentSlideTranslateRange,
  clampCarouselCommitIndex,
  clampTranslateToAdjacent,
  MIXED_HERO_SWIPE_THRESHOLD_PX,
} from "../lib/createFinalizeMixedMedia";
import {
  PUBLISHED_MEDIA_SWIPE_NO_SELECTOR,
  armPublishedFullscreenDismissTapSuppress,
  isPublishedFullscreenBackdropDismissTarget,
  isPublishedFullscreenVerticalDismissBlockedTarget,
  isPublishedFullscreenVideoOnlyItems,
  resolvePublishedFullscreenThumbSrc,
  shouldClosePublishedFullscreenVerticalDismiss,
  shouldMountFullscreenPublishedVideoPlayer,
  shouldShowPublishedFullscreenThumbStrip,
  shouldShowPublishedFullscreenMixedVideoDots,
  shouldShowPublishedFullscreenTopClose,
  shouldUsePublishedImmersiveFullscreenChrome,
  isPublishedVideoContaining,
  shouldUsePublishedFullscreenMixedMediaCount,
  resolvePublishedFullscreenAxisLock,
  nextManualVideoRotateDeg,
  shouldShowPublishedFullscreenVideoRotateControl,
  PUBLISHED_FULLSCREEN_MIXED_VIDEO_DOTS_BOTTOM_CSS,
  PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_TOP_CSS,
  PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_LEFT_CSS,
  PUBLISHED_FULLSCREEN_MIXED_PAGINATION_TOP_CSS,
  PUBLISHED_FULLSCREEN_MIXED_PAGINATION_RIGHT_CSS,
  type PublishedMediaItem,
  type PublishedVideoPlaybackSnapshot,
  type ManualVideoRotateDeg,
} from "../lib/publishedMedia";
import { usePostDetailDismiss } from "../context/PostDetailDismissContext";
import {
  enterPublishedImmersiveStatusBar,
  exitPublishedImmersiveStatusBar,
} from "../lib/publishedImmersiveStatusBar";
import { MEDIA_GALLERY_LIGHTBOX_Z } from "./MediaGalleryLightbox";
import PublishedVideoPlayer from "./detail/PublishedVideoPlayer";

const ZOOM_OPTS = { maxRatio: 3, minRatio: 1, toggle: true } as const;

/** Proven Create-parity slide sizing — one viewport = one slide. */
const FULLSCREEN_SWIPER_CLASS =
  "published-fullscreen-swiper h-full min-h-0 w-full [&_.swiper-wrapper]:h-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full [&_.swiper-slide]:w-full [&_.swiper-slide]:min-w-full [&_.swiper-slide]:shrink-0";

export type PublishedMediaFullscreenViewerProps = {
  items: PublishedMediaItem[];
  open: boolean;
  /** Stable media key (`video:{id}` / `image:{...}`). */
  initialMediaKey: string;
  onClose: (
    activeMediaKey: string,
    playbackSnapshot?: PublishedVideoPlaybackSnapshot | null,
  ) => void;
  onVideoUpdated?: (
    next: Extract<PublishedMediaItem, { kind: "video" }>,
  ) => void;
  /** Detail → fullscreen playback restore. */
  entryPlaybackHandoff?: PublishedVideoPlaybackSnapshot | null;
  onEntryPlaybackHandoffConsumed?: (generation: number) => void;
};

function resolveImageSrc(src: string): string | null {
  if (!src) return null;
  const publicUrl = imgUrlPublic(src);
  if (publicUrl) return publicUrl;
  if (src.startsWith("data:image/")) return src;
  return null;
}

function indexForMediaKey(
  items: PublishedMediaItem[],
  mediaKey: string,
): number {
  const found = items.findIndex((item) => item.key === mediaKey);
  return found >= 0 ? found : 0;
}

function mediaOrderSignature(items: PublishedMediaItem[]): string {
  return items.map((item) => item.key).join("|");
}

function VideoThumbFallback() {
  return (
    <span
      className="grid h-full w-full place-items-center bg-white/10 text-white/80"
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7L8 5z" />
      </svg>
    </span>
  );
}

function FullscreenThumbStrip({
  items,
  activeIndex,
  scrollIndex,
  onSelect,
}: {
  items: PublishedMediaItem[];
  activeIndex: number;
  /** Settled index — auto-scroll only when slide settles. */
  scrollIndex: number;
  onSelect: (index: number) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const thumb = rail.querySelector<HTMLElement>(
      `[data-published-fullscreen-thumb-index="${scrollIndex}"]`,
    );
    if (!thumb) return;
    thumb.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [scrollIndex]);

  if (items.length <= 1) return null;

  return (
    <div
      ref={railRef}
      data-published-fullscreen-thumbs
      data-lightbox-thumbs
      className="flex flex-shrink-0 justify-center gap-1.5 overflow-x-auto scroll-hide px-3 pt-1 pb-[calc(var(--safe-area-bottom-layout)+8px)]"
      style={{ minHeight: 52 }}
    >
      {items.map((item, slideIdx) => {
        const active = slideIdx === activeIndex;
        const kind = resolvePublishedFullscreenThumbSrc(
          item.kind === "image"
            ? { kind: "image", url: item.url }
            : { kind: "video", posterUrl: item.posterUrl },
        );
        const imageUrl =
          kind === "image" && item.kind === "image"
            ? resolveImageSrc(item.url)
            : kind === "video-poster" && item.kind === "video" && item.posterUrl
              ? resolveImageSrc(item.posterUrl)
              : null;

        return (
          <button
            key={`fs-thumb-${item.key}`}
            type="button"
            data-published-fullscreen-thumb-index={slideIdx}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(slideIdx);
            }}
            className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded-md transition-all ${
              active
                ? "opacity-100 ring-2 ring-white"
                : "opacity-60 hover:opacity-90"
            }`}
            aria-label={`Go to media ${slideIdx + 1}`}
            aria-current={active ? "true" : undefined}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <VideoThumbFallback />
            )}
          </button>
        );
      })}
    </div>
  );
}

function FullscreenPaginationDots({
  count,
  activeIndex,
  placement,
}: {
  count: number;
  activeIndex: number;
  placement: "top-right" | "bottom";
}) {
  const useCount = shouldUsePublishedFullscreenMixedMediaCount(count);
  return (
    <div
      className={
        placement === "top-right"
          ? "pointer-events-none absolute z-[2] flex items-center gap-1.5"
          : "pointer-events-none absolute left-1/2 z-[2] flex -translate-x-1/2 items-center gap-1.5"
      }
      style={
        placement === "top-right"
          ? {
              top: PUBLISHED_FULLSCREEN_MIXED_PAGINATION_TOP_CSS,
              right: PUBLISHED_FULLSCREEN_MIXED_PAGINATION_RIGHT_CSS,
            }
          : { bottom: PUBLISHED_FULLSCREEN_MIXED_VIDEO_DOTS_BOTTOM_CSS }
      }
      data-published-fullscreen-dots
      aria-hidden
    >
      {useCount ? (
        <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {activeIndex + 1}/{count}
        </span>
      ) : (
        Array.from({ length: count }, (_, i) => {
          const active = i === activeIndex;
          return (
            <span
              key={`fs-dot-${i}`}
              className={`h-1.5 rounded-full transition-all ${
                active ? "w-4 bg-white" : "w-2 bg-white/50"
              }`}
            />
          );
        })
      )}
    </div>
  );
}

/** Safe click isolation only — never touch/pointer move/end (Swiper document handlers). */
function stopClickPropagation(e: { stopPropagation: () => void }): void {
  e.stopPropagation();
}

export default function PublishedMediaFullscreenViewer({
  items,
  open,
  initialMediaKey,
  onClose,
  onVideoUpdated,
  entryPlaybackHandoff = null,
  onEntryPlaybackHandoffConsumed,
}: PublishedMediaFullscreenViewerProps) {
  const closingRef = useRef(false);
  const swiperRef = useRef<SwiperType | null>(null);
  const swipeContentRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const swipeStartIndexRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const committedIndexRef = useRef(0);
  const positionedOpenKeyRef = useRef<string | null>(null);
  const lastOrderSigRef = useRef("");
  /** Suppress backdrop click that follows a vertical dismiss gesture. */
  const suppressBackdropClickUntilRef = useRef(0);
  const thumbSlideToIndexRef = useRef<number | null>(null);
  const fsPlaybackCaptureRef = useRef<
    ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null
  >(null);
  const entryPlaybackHandoffRef = useRef(entryPlaybackHandoff);
  entryPlaybackHandoffRef.current = entryPlaybackHandoff;

  const postDetailDismiss = usePostDetailDismiss();
  const registerPublishedMediaFullscreenClose =
    postDetailDismiss?.registerPublishedMediaFullscreenClose;

  const startIndex = indexForMediaKey(items, initialMediaKey);
  const [mediaItems, setMediaItems] = useState(items);
  /** UI index (may update during transition). */
  const [index, setIndex] = useState(startIndex);
  /** Committed index — drives video isActive / thumbs / HLS (after transition end). */
  const [committedIndex, setCommittedIndex] = useState(startIndex);
  /** Temporary viewing rotation for the active fullscreen video only. */
  const [manualVideoRotateDeg, setManualVideoRotateDeg] =
    useState<ManualVideoRotateDeg>(0);

  committedIndexRef.current = committedIndex;

  useEffect(() => {
    setMediaItems(items);
  }, [items]);

  // Position only on open / intentional initialMediaKey change — not status patches.
  useEffect(() => {
    if (!open) {
      positionedOpenKeyRef.current = null;
      lastOrderSigRef.current = "";
      return;
    }
    if (mediaItems.length === 0) return;
    const orderSig = mediaOrderSignature(mediaItems);
    const positionKey = `${initialMediaKey}::${orderSig}`;
    // Same open target + same membership/order → ignore status/poster object churn.
    if (positionedOpenKeyRef.current === positionKey) return;

    positionedOpenKeyRef.current = positionKey;
    lastOrderSigRef.current = orderSig;
    const next = indexForMediaKey(mediaItems, initialMediaKey);
    setIndex(next);
    setCommittedIndex(next);
    const s = swiperRef.current;
    if (s) {
      if (s.activeIndex !== next) {
        s.slideTo(next, 0);
      }
      try {
        s.update();
      } catch {
        /* ignore */
      }
    }
  }, [open, initialMediaKey, mediaItems]);

  useEffect(() => {
    if (!open) return;
    const updateSwiper = () => {
      const s = swiperRef.current;
      if (!s) return;
      try {
        s.update();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", updateSwiper);
    window.addEventListener("orientationchange", updateSwiper);
    return () => {
      window.removeEventListener("resize", updateSwiper);
      window.removeEventListener("orientationchange", updateSwiper);
    };
  }, [open]);

  const slideCount = mediaItems.length;
  const activeKey = mediaItems[committedIndex]?.key ?? initialMediaKey;
  const activeIsVideo = mediaItems[committedIndex]?.kind === "video";
  const videoOnlyFullscreen = isPublishedFullscreenVideoOnlyItems(mediaItems);
  const immersiveChrome = shouldUsePublishedImmersiveFullscreenChrome({
    containsVideo: isPublishedVideoContaining(mediaItems),
  });
  const immersiveChromeRef = useRef(immersiveChrome);
  immersiveChromeRef.current = immersiveChrome;

  // Reset manual content rotation when FS closes, session remounts, or active media changes.
  useEffect(() => {
    if (!open) {
      setManualVideoRotateDeg(0);
      return;
    }
    setManualVideoRotateDeg(0);
  }, [open, activeKey]);

  const showVideoRotateControl = shouldShowPublishedFullscreenVideoRotateControl(
    { open, activeIsVideo },
  );

  const handleRequestContentRotate = useCallback(() => {
    setManualVideoRotateDeg((prev) => nextManualVideoRotateDeg(prev));
  }, []);

  const resetVerticalDismissVisual = useCallback(() => {
    const overlayEl = overlayRef.current;
    if (overlayEl) {
      overlayEl.style.backgroundColor = "";
      overlayEl.style.transition = "";
    }
    clearLightboxSwipeContentStyle(swipeContentRef.current);
  }, []);

  const closeViewer = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    resetVerticalDismissVisual();
    const key =
      mediaItems[committedIndexRef.current]?.key ?? activeKey;
    // Capture FS playback before unmount / inactive tearDown.
    const generation =
      entryPlaybackHandoffRef.current?.generation != null
        ? entryPlaybackHandoffRef.current.generation + 1
        : Date.now();
    const snap = fsPlaybackCaptureRef.current?.(generation) ?? null;
    onCloseRef.current(
      key,
      snap && snap.mediaKey === key ? snap : null,
    );
    window.setTimeout(() => {
      closingRef.current = false;
    }, 150);
  }, [activeKey, mediaItems, resetVerticalDismissVisual]);

  const registerFsPlaybackCapture = useCallback(
    (
      capture: ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null,
    ) => {
      fsPlaybackCaptureRef.current = capture;
    },
    [],
  );

  const goToIndex = useCallback(
    (i: number) => {
      if (closingRef.current || !open) return;
      const clamped = Math.max(0, Math.min(slideCount - 1, i));
      setIndex(clamped);
      thumbSlideToIndexRef.current = clamped;
      const s = swiperRef.current;
      if (s && s.activeIndex !== clamped) {
        s.slideTo(clamped, 280);
      }
    },
    [open, slideCount],
  );

  useEffect(() => {
    if (!open || thumbSlideToIndexRef.current === null) return;
    const targetIndex = thumbSlideToIndexRef.current;
    thumbSlideToIndexRef.current = null;
    const s = swiperRef.current;
    if (s && s.activeIndex !== targetIndex) {
      s.slideTo(targetIndex, 280);
    }
  }, [open, index]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (closingRef.current) return;
      if (Date.now() < suppressBackdropClickUntilRef.current) return;
      if (!isPublishedFullscreenBackdropDismissTarget(e.target)) return;
      closeViewer();
    },
    [closeViewer],
  );

  useEffect(() => {
    if (!open) {
      registerPublishedMediaFullscreenClose?.(null);
      return;
    }
    registerPublishedMediaFullscreenClose?.(() => {
      closeViewer();
    });
    return () => {
      registerPublishedMediaFullscreenClose?.(null);
    };
  }, [closeViewer, open, registerPublishedMediaFullscreenClose]);

  const handleVideoUpdated = useCallback(
    (next: Extract<PublishedMediaItem, { kind: "video" }>) => {
      setMediaItems((prev) =>
        prev.map((item) =>
          item.kind === "video" && item.mediaId === next.mediaId ? next : item,
        ),
      );
      onVideoUpdated?.(next);
    },
    [onVideoUpdated],
  );

  useOverlayBackgroundScrollLock(open);

  useEffect(() => {
    if (!open) return;
    return acquirePullToRefreshBlock();
  }, [open]);

  /**
   * Native status-bar hide/restore for immersive (video-containing) sessions.
   * Owned solely by open + immersive chrome — not per-slide kind, not playback.
   */
  useEffect(() => {
    if (!open || !immersiveChrome) return;
    enterPublishedImmersiveStatusBar();
    return () => {
      exitPublishedImmersiveStatusBar();
    };
  }, [open, immersiveChrome]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeViewer();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, closeViewer]);

  // Fullscreen gestures (in-tree players — no body-level video host):
  // - Video-only / immersive video: overlay vertical dismiss; Swiper owns horizontal.
  // - Image-only: overlay 2D dismiss + native Swiper / zoom.
  useLayoutEffect(() => {
    if (!open) return;
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    const immersive = immersiveChromeRef.current;
    const videoOnly = isPublishedFullscreenVideoOnlyItems(mediaItems);
    const immersiveVideoSurface = () =>
      immersive &&
      !videoOnly &&
      mediaItems[committedIndexRef.current]?.kind === "video";
    const dismissPolicy =
      videoOnly || immersiveVideoSurface() ? "video-only-surface" : "default";

    let swipeStartY = 0;
    let swipeStartX = 0;
    let isVerticalSwipe = false;
    let axis: "undecided" | "horizontal" | "vertical" = "undecided";
    let tracking = false;

    const swipeContentEl = () => swipeContentRef.current;

    const resetGesture = () => {
      swipeStartY = 0;
      swipeStartX = 0;
      isVerticalSwipe = false;
      axis = "undecided";
      tracking = false;
      resetVerticalDismissVisual();
    };

    const activeSlideIsVideo = () =>
      mediaItems[committedIndexRef.current]?.kind === "video";

    const handleSwipeStart = (e: TouchEvent) => {
      if (activeSlideIsVideo() && !videoOnly && !immersive) {
        resetGesture();
        return;
      }
      if (
        isPublishedFullscreenVerticalDismissBlockedTarget(
          e.target,
          dismissPolicy,
        )
      ) {
        resetGesture();
        return;
      }
      const zoomed = overlayEl.querySelector(
        ".swiper-slide-active .swiper-zoom-container.swiper-zoom-container-zoomed",
      );
      if (zoomed) {
        resetGesture();
        return;
      }
      swipeStartY = e.touches[0].clientY;
      swipeStartX = e.touches[0].clientX;
      isVerticalSwipe = false;
      axis = "undecided";
      tracking = true;
      const swiper = swiperRef.current;
      swipeStartIndexRef.current = swiper?.activeIndex ?? committedIndexRef.current;
    };

    const handleSwipeMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (activeSlideIsVideo() && !videoOnly && !immersive) {
        resetGesture();
        return;
      }
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const signedDx = currentX - swipeStartX;
      const diffY = currentY - swipeStartY;
      const diffX = Math.abs(signedDx);
      if (axis === "undecided") {
        axis = resolvePublishedFullscreenAxisLock({
          diffX: signedDx,
          diffY,
          thresholdPx: LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
        });
        if (axis === "undecided") return;
      }
      // Horizontal takeover: clear overlay dismiss so native Swiper owns the rest.
      if (axis === "horizontal") {
        isVerticalSwipe = false;
        resetVerticalDismissVisual();
        swipeStartY = 0;
        tracking = false;
        return;
      }
      if (diffY > LIGHTBOX_SWIPE_VERTICAL_THRESHOLD && diffY > diffX) {
        if (!isVerticalSwipe) {
          armPublishedFullscreenDismissTapSuppress();
        }
        isVerticalSwipe = true;
        overlayEl.style.backgroundColor = lightboxSwipeBackdropRgba(diffY);
        applyLightboxSwipeContentStyle(swipeContentEl(), diffY);
      }
    };

    const handleSwipeEndEvent = (e: TouchEvent) => {
      if (!tracking) {
        resetGesture();
        return;
      }
      if (activeSlideIsVideo() && !videoOnly && !immersive) {
        resetGesture();
        return;
      }
      const endY = e.changedTouches[0]?.clientY ?? swipeStartY;
      const diffY = endY - swipeStartY;
      const shouldClose = shouldClosePublishedFullscreenVerticalDismiss({
        isVerticalSwipe,
        diffY,
      });
      if (isVerticalSwipe) {
        armPublishedFullscreenDismissTapSuppress();
        suppressBackdropClickUntilRef.current = Date.now() + 350;
      }
      if (shouldClose) {
        resetGesture();
        closeViewer();
        return;
      }
      if (isVerticalSwipe) {
        swipeStartY = 0;
        swipeStartX = 0;
        isVerticalSwipe = false;
        axis = "undecided";
        snapBackLightboxSwipeContentStyle(swipeContentEl(), overlayEl);
        return;
      }
      resetGesture();
    };

    const handleSwipeCancel = () => {
      resetGesture();
    };

    overlayEl.addEventListener("touchstart", handleSwipeStart, {
      passive: true,
    });
    overlayEl.addEventListener("touchmove", handleSwipeMove, {
      passive: true,
    });
    overlayEl.addEventListener("touchend", handleSwipeEndEvent, {
      passive: true,
    });
    overlayEl.addEventListener("touchcancel", handleSwipeCancel, {
      passive: true,
    });

    return () => {
      overlayEl.removeEventListener("touchstart", handleSwipeStart);
      overlayEl.removeEventListener("touchmove", handleSwipeMove);
      overlayEl.removeEventListener("touchend", handleSwipeEndEvent);
      overlayEl.removeEventListener("touchcancel", handleSwipeCancel);
      resetGesture();
    };
  }, [
    closeViewer,
    mediaItems,
    open,
    resetVerticalDismissVisual,
    slideCount,
    activeIsVideo,
  ]);

  if (!open || slideCount === 0 || typeof document === "undefined") {
    return null;
  }

  const verticalDismissMode = videoOnlyFullscreen
    ? "video-only"
    : immersiveChrome && activeIsVideo
      ? "immersive-video"
      : activeIsVideo
        ? "disabled"
        : "image-only";
  const showTopClose = shouldShowPublishedFullscreenTopClose({
    videoOnlyFullscreen,
    immersiveChrome,
  });
  const showThumbStrip = shouldShowPublishedFullscreenThumbStrip({
    immersiveChrome,
    videoOnlyFullscreen,
    slideCount,
  });
  const showMixedVideoDots = shouldShowPublishedFullscreenMixedVideoDots({
    immersiveChrome,
    videoOnlyFullscreen,
    slideCount,
  });

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex flex-col bg-black/90"
      style={{
        zIndex: MEDIA_GALLERY_LIGHTBOX_Z,
        cursor: "zoom-out",
      }}
      role="presentation"
      data-published-media-fullscreen-viewer
      data-published-fullscreen-immersive={
        immersiveChrome ? "true" : undefined
      }
      data-active-media-key={activeKey}
      data-active-kind={activeIsVideo ? "video" : "image"}
      data-manual-video-rotate={
        activeIsVideo && manualVideoRotateDeg !== 0
          ? String(manualVideoRotateDeg)
          : undefined
      }
      data-vertical-dismiss={verticalDismissMode}
      data-published-fullscreen-video-only={
        videoOnlyFullscreen ? "true" : undefined
      }
      data-swiper-event-isolation="click-only"
      onClick={handleBackdropClick}
    >
      {showTopClose ? (
        <button
          type="button"
          data-lightbox-close
          data-published-fullscreen-top-close={
            videoOnlyFullscreen ? "" : undefined
          }
          data-published-fullscreen-mixed-close={
            !videoOnlyFullscreen ? "" : undefined
          }
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeViewer();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label="Close"
          className="pointer-events-auto absolute z-[2] grid h-10 w-10 place-items-center rounded-full bg-black/45 text-xl leading-none text-white backdrop-blur-sm hover:bg-black/60"
          style={{
            top: videoOnlyFullscreen
              ? "calc(var(--safe-area-top-layout, 0px) + 0.75rem)"
              : PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_TOP_CSS,
            left: PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_LEFT_CSS,
          }}
        >
          ×
        </button>
      ) : null}
      {showMixedVideoDots ? (
        <FullscreenPaginationDots
          count={slideCount}
          activeIndex={index}
          placement="top-right"
        />
      ) : null}
      <div
        className={
          immersiveChrome
            ? "flex min-h-0 w-full flex-1 flex-col"
            : "flex min-h-0 w-full flex-1 flex-col gap-3"
        }
      >
        <div
          ref={swipeContentRef}
          className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
          role="presentation"
          data-published-fullscreen-stage
        >
          <Swiper
            modules={[Zoom]}
            zoom={ZOOM_OPTS}
            slidesPerView={1}
            slidesPerGroup={1}
            spaceBetween={0}
            speed={380}
            threshold={MIXED_HERO_SWIPE_THRESHOLD_PX}
            followFinger
            resistance
            watchOverflow
            initialSlide={Math.min(startIndex, slideCount - 1)}
            noSwiping
            noSwipingSelector={PUBLISHED_MEDIA_SWIPE_NO_SELECTOR}
            touchStartPreventDefault={false}
            preventClicks={false}
            preventClicksPropagation={false}
            className={FULLSCREEN_SWIPER_CLASS}
            style={{ height: "100%", width: "100%" }}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
              const target = Math.min(startIndex, slideCount - 1);
              if (swiper.activeIndex !== target) {
                swiper.slideTo(target, 0);
              }
              // One-time measure after open layout.
              requestAnimationFrame(() => {
                try {
                  swiper.update();
                } catch {
                  /* ignore */
                }
              });
            }}
            onTouchStart={(swiper) => {
              swipeStartIndexRef.current = swiper.activeIndex;
            }}
            onSliderMove={(swiper) => {
              const start = swipeStartIndexRef.current;
              const width = swiper.width || 1;
              const next = clampTranslateToAdjacent(
                swiper.translate,
                start,
                slideCount,
                width,
              );
              if (next !== swiper.translate) {
                swiper.setTranslate(next);
              }
            }}
            onTouchEnd={(swiper) => {
              const clamped = clampCarouselCommitIndex(
                swipeStartIndexRef.current,
                swiper.activeIndex,
                slideCount,
              );
              if (clamped !== swiper.activeIndex) {
                swiper.slideTo(clamped);
              }
            }}
            onSlideChange={(s) => setIndex(s.activeIndex)}
            onSlideChangeTransitionEnd={(s) => {
              setCommittedIndex(s.activeIndex);
              setIndex(s.activeIndex);
            }}
          >
            {mediaItems.map((item, i) => (
              <SwiperSlide
                key={item.key}
                className="!box-border !h-full !min-w-full !w-full shrink-0 bg-black"
              >
                {item.kind === "image" ? (
                  <div
                    className="flex h-full w-full min-w-full items-center justify-center overflow-hidden bg-black"
                    data-published-media-zoom
                  >
                    <div className="swiper-zoom-container flex h-fit max-h-full w-fit max-w-full items-center justify-center">
                      {(() => {
                        const imageUrl = resolveImageSrc(item.url);
                        if (!imageUrl) return null;
                        return (
                          <img
                            src={imageUrl}
                            alt=""
                            className="max-h-full max-w-full select-none object-contain"
                            draggable={false}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ) : shouldMountFullscreenPublishedVideoPlayer({
                    itemKind: item.kind,
                  }) ? (
                  <div className="h-full w-full min-w-full bg-black">
                    <PublishedVideoPlayer
                      item={item}
                      isActive={i === committedIndex}
                      mode="fullscreen"
                      showExpandControl={false}
                      onVideoUpdated={handleVideoUpdated}
                      contentRotateDeg={
                        i === committedIndex ? manualVideoRotateDeg : 0
                      }
                      onRequestContentRotate={
                        i === committedIndex && showVideoRotateControl
                          ? handleRequestContentRotate
                          : undefined
                      }
                      registerPlaybackCapture={
                        i === committedIndex
                          ? registerFsPlaybackCapture
                          : undefined
                      }
                      playbackHandoff={
                        open &&
                        entryPlaybackHandoff?.mediaKey === item.key &&
                        i === committedIndex
                          ? entryPlaybackHandoff
                          : null
                      }
                      onPlaybackHandoffConsumed={
                        onEntryPlaybackHandoffConsumed
                      }
                    />
                  </div>
                ) : null}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {!videoOnlyFullscreen && showThumbStrip ? (
          <div
            className="pointer-events-auto flex flex-shrink-0 flex-col"
            onClick={stopClickPropagation}
          >
            <div className="flex justify-center px-3 pb-1">
              <button
                type="button"
                data-lightbox-close
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeViewer();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl leading-none text-white hover:bg-white/25"
              >
                ×
              </button>
            </div>
            <FullscreenThumbStrip
              items={mediaItems}
              activeIndex={index}
              scrollIndex={committedIndex}
              onSelect={goToIndex}
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Exported for tests. */
export { indexForMediaKey, adjacentSlideTranslateRange, mediaOrderSignature };
