/**
 * Fullscreen multi-image gallery lightbox (zoom / swipe / thumbs).
 * Used by MediaCarousel (feed/profile image cards).
 * Published Detail mixed media uses PublishedMediaFullscreenViewer (PV2B).
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
} from "../lib/lightboxSwipeDim";
import { acquirePullToRefreshBlock } from "../lib/pullToRefreshBlock";
import { useOverlayBackgroundScrollLock } from "../hooks/useOverlayBackgroundScrollLock";
import { imgUrlPublic } from "../lib/img";

/** Above PostDetailModal (z-50), drawers, FrostedCenterModal, Modal/Dropdown. */
export const MEDIA_GALLERY_LIGHTBOX_Z = 10050;

const ZOOM_OPTS = { maxRatio: 3, minRatio: 1, toggle: true } as const;

export type MediaGalleryLightboxProps = {
  /** Image sources (public URLs or storage paths / data URLs). */
  images: string[];
  open: boolean;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
};

function resolveSrc(src: string): string | null {
  if (!src) return null;
  const publicUrl = imgUrlPublic(src);
  if (publicUrl) return publicUrl;
  if (src.startsWith("data:image/")) return src;
  return null;
}

export default function MediaGalleryLightbox({
  images,
  open,
  activeIndex,
  onActiveIndexChange,
  onClose,
}: MediaGalleryLightboxProps) {
  const closingRef = useRef(false);
  const lightboxSwiperRef = useRef<SwiperType | null>(null);
  const lightboxSlideToIndexRef = useRef<number | null>(null);
  const lightboxSwipeContentRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;

  const slideCount = images.length;

  const closeLightbox = useCallback(() => {
    closingRef.current = true;
    openRef.current = false;
    onCloseRef.current();
  }, []);

  // Re-arm only when the lightbox opens (not on every activeIndex change).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      closingRef.current = false;
      openRef.current = true;
    }
    wasOpenRef.current = open;
  }, [open]);

  const lightboxGoTo = useCallback(
    (i: number) => {
      if (closingRef.current || !openRef.current) return;
      const clamped = Math.max(0, Math.min(slideCount - 1, i));
      onActiveIndexChangeRef.current(clamped);
      lightboxSlideToIndexRef.current = clamped;
    },
    [slideCount],
  );

  const handleLightboxBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closingRef.current) return;
      const t = e.target as HTMLElement;
      if (
        t.closest(".swiper-zoom-container") ||
        t.closest("[data-lightbox-thumbs]") ||
        t.closest("[data-lightbox-close]")
      ) {
        return;
      }
      closeLightbox();
    },
    [closeLightbox],
  );

  useOverlayBackgroundScrollLock(open);

  useEffect(() => {
    if (!open) return;
    return acquirePullToRefreshBlock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeLightbox();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, closeLightbox]);

  useEffect(() => {
    if (!open || lightboxSlideToIndexRef.current === null) return;
    const targetIndex = lightboxSlideToIndexRef.current;
    lightboxSlideToIndexRef.current = null;
    const s = lightboxSwiperRef.current;
    if (s && s.activeIndex !== targetIndex) {
      s.slideTo(targetIndex, 280);
    }
  }, [open, activeIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;

    let swipeStartY = 0;
    let swipeStartX = 0;
    let isVerticalSwipe = false;

    const handleSwipeStart = (e: TouchEvent) => {
      swipeStartY = e.touches[0].clientY;
      swipeStartX = e.touches[0].clientX;
      isVerticalSwipe = false;
    };

    const handleSwipeMove = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - swipeStartY;
      const diffX = Math.abs(currentX - swipeStartX);
      if (diffY > LIGHTBOX_SWIPE_VERTICAL_THRESHOLD && diffY > diffX) {
        isVerticalSwipe = true;
        overlayEl.style.backgroundColor = lightboxSwipeBackdropRgba(diffY);
        applyLightboxSwipeContentStyle(
          lightboxSwipeContentRef.current,
          diffY,
        );
      }
    };

    const handleSwipeEnd = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const endY = e.changedTouches[0].clientY;
      const diffY = endY - swipeStartY;
      if (isVerticalSwipe && diffY > 100) {
        closeLightbox();
      } else {
        overlayEl.style.backgroundColor = "";
        clearLightboxSwipeContentStyle(lightboxSwipeContentRef.current);
      }
      swipeStartY = 0;
      swipeStartX = 0;
      isVerticalSwipe = false;
    };

    overlayEl.addEventListener("touchstart", handleSwipeStart, {
      passive: true,
    });
    overlayEl.addEventListener("touchmove", handleSwipeMove, { passive: true });
    overlayEl.addEventListener("touchend", handleSwipeEnd, { passive: true });

    return () => {
      overlayEl.removeEventListener("touchstart", handleSwipeStart);
      overlayEl.removeEventListener("touchmove", handleSwipeMove);
      overlayEl.removeEventListener("touchend", handleSwipeEnd);
      overlayEl.style.backgroundColor = "";
      clearLightboxSwipeContentStyle(lightboxSwipeContentRef.current);
    };
  }, [open, closeLightbox]);

  if (!open || slideCount === 0 || typeof document === "undefined") {
    return null;
  }

  const startIndex = Math.min(
    Math.max(0, activeIndex),
    Math.max(0, slideCount - 1),
  );

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex flex-col bg-black/90"
      style={{
        zIndex: MEDIA_GALLERY_LIGHTBOX_Z,
        cursor: "zoom-out",
      }}
      role="presentation"
      data-media-gallery-lightbox
      onClick={handleLightboxBackdropClick}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
        <div
          ref={lightboxSwipeContentRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          role="presentation"
        >
          <Swiper
            modules={[Zoom]}
            zoom={ZOOM_OPTS}
            slidesPerView={1}
            spaceBetween={0}
            speed={420}
            threshold={14}
            longSwipesRatio={0.32}
            resistanceRatio={0.75}
            initialSlide={startIndex}
            className="media-lightbox-swiper h-full min-h-0 w-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full"
            style={{ height: "100%" }}
            onSwiper={(swiper) => {
              lightboxSwiperRef.current = swiper;
              if (slideCount > 0) {
                swiper.slideTo(startIndex, 0);
              }
            }}
            onSlideChange={(s) => {
              // Ignore teardown / close-time slide events (often activeIndex 0).
              if (closingRef.current || !openRef.current) return;
              onActiveIndexChangeRef.current(s.activeIndex);
            }}
          >
            {images.map((src, slideIdx) => {
              const imageUrl = resolveSrc(src);
              if (!imageUrl) return null;
              return (
                <SwiperSlide key={`lb-${slideIdx}-${imageUrl.slice(-48)}`}>
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="swiper-zoom-container flex h-fit max-h-full w-fit max-w-full items-center justify-center">
                      <img
                        src={imageUrl}
                        alt=""
                        className="max-h-full max-w-full object-contain select-none"
                        draggable={false}
                      />
                    </div>
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        </div>

        <div className="pointer-events-auto flex flex-shrink-0 flex-col">
          <div className="flex justify-center px-3 pb-1">
            <button
              type="button"
              data-lightbox-close
              onPointerDown={(e) => {
                // Close on pointerdown so the residual click after portal
                // unmount cannot hit the page underneath (Mine photo cycle).
                e.preventDefault();
                e.stopPropagation();
                closeLightbox();
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
          <div
            data-lightbox-thumbs
            className="flex flex-shrink-0 justify-center gap-1.5 overflow-x-auto scroll-hide px-3 pt-1 pb-[calc(var(--safe-area-bottom-layout)+8px)]"
            style={{ minHeight: 52 }}
          >
            {images.map((src, slideIdx) => {
              const thumbSrc = resolveSrc(src);
              if (!thumbSrc) return null;
              const active = slideIdx === activeIndex;
              return (
                <button
                  key={`thumb-${slideIdx}-${thumbSrc.slice(-32)}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    lightboxGoTo(slideIdx);
                  }}
                  className={`flex-shrink-0 w-12 h-12 overflow-hidden transition-all ${
                    active
                      ? "ring-2 ring-white opacity-100"
                      : "opacity-50 hover:opacity-70"
                  }`}
                  aria-label={`View image ${slideIdx + 1}`}
                  aria-current={active ? "true" : undefined}
                >
                  <img
                    src={thumbSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
