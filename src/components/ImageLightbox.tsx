import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Zoom } from "swiper/modules";
import "swiper/swiper.css";
import "swiper/css/zoom";
import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
} from "../lib/lightboxSwipeDim";
import { acquirePullToRefreshBlock } from "../lib/pullToRefreshBlock";

/**
 * Full-screen avatar / single-image preview for profile pages.
 * Same public API as before: (src, alt, open, onClose) — only implementation changed.
 *
 * Stacks with MediaCarousel lightbox (same z-index tier).
 */
const AVATAR_LIGHTBOX_Z = 10050;

const ZOOM_OPTS = { maxRatio: 3, minRatio: 1, toggle: true } as const;

export default function ImageLightbox({
  src,
  alt = "",
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const swipeContentRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
    window.setTimeout(() => {
      closingRef.current = false;
    }, 160);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return acquirePullToRefreshBlock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finishClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, finishClose]);

  /** Vertical swipe-to-dismiss (aligned with MediaCarousel lightbox overlay). */
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
        applyLightboxSwipeContentStyle(swipeContentRef.current, diffY);
      }
    };

    const handleSwipeEnd = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const endY = e.changedTouches[0].clientY;
      const diffY = endY - swipeStartY;
      if (isVerticalSwipe && diffY > 100) {
        finishClose();
      } else {
        overlayEl.style.backgroundColor = "";
        clearLightboxSwipeContentStyle(swipeContentRef.current);
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
      clearLightboxSwipeContentStyle(swipeContentRef.current);
    };
  }, [open, finishClose, src]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closingRef.current) return;
      const t = e.target as HTMLElement;
      if (
        t.closest(".swiper-zoom-container") ||
        t.closest("[data-avatar-lightbox-close]")
      ) {
        return;
      }
      finishClose();
    },
    [finishClose]
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex flex-col bg-black/90"
      style={{
        zIndex: AVATAR_LIGHTBOX_Z,
        cursor: "zoom-out",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Photo: ${alt}` : "Profile photo"}
      onClick={handleBackdropClick}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
        <div
          ref={swipeContentRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col pt-[max(8px,env(safe-area-inset-top,0px))]"
          role="presentation"
        >
          <Swiper
            key={src}
            modules={[Zoom]}
            zoom={ZOOM_OPTS}
            slidesPerView={1}
            spaceBetween={0}
            speed={420}
            threshold={14}
            longSwipesRatio={0.32}
            resistanceRatio={0.75}
            className="avatar-lightbox-swiper h-full min-h-0 w-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full"
            style={{ height: "100%" }}
          >
            <SwiperSlide>
              <div className="flex h-full w-full items-center justify-center">
                <div className="swiper-zoom-container flex h-fit max-h-full w-fit max-w-full items-center justify-center">
                  <img
                    src={src}
                    alt={alt}
                    className="max-h-[min(82vh,calc(100dvh-env(safe-area-inset-top)-var(--safe-area-bottom-layout)-96px))] max-w-[95vw] object-contain select-none"
                    draggable={false}
                  />
                </div>
              </div>
            </SwiperSlide>
          </Swiper>
        </div>

        <div
          className="pointer-events-auto flex shrink-0 flex-col items-center px-3 pb-[max(12px,var(--safe-area-bottom-layout))]"
          role="presentation"
        >
          <button
            type="button"
            data-avatar-lightbox-close
            onClick={(e) => {
              e.stopPropagation();
              finishClose();
            }}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl leading-none text-white hover:bg-white/25"
          >
            ×
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
