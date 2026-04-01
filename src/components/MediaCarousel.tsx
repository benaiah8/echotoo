// Optimized media carousel: Swiper inline carousel, fullscreen lightbox with thumbnails
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Zoom } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";
import "swiper/css/zoom";
import { imgUrlPublic } from "../lib/img";
import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
} from "../lib/lightboxSwipeDim";
import { acquirePullToRefreshBlock } from "../lib/pullToRefreshBlock";
import ProgressiveImage from "./ui/ProgressiveImage";

type Props = {
  images: string[];
  maxHeight?: string; // e.g. "60vh"
  className?: string;
  fit?: "cover" | "contain"; // default = "contain"
  enableLightbox?: boolean;
  /** Enable autoplay slideshow (feed/profile cards only; not detail/preview) */
  autoplay?: boolean;
  /**
   * When false, dots are position indicators only (no tap-to-jump). Preview create flow uses this.
   */
  interactiveDots?: boolean;
  /**
   * When false, inline autoplay never runs (e.g. persistent tab hidden via display:none, or profile sub-tab inactive).
   * Default true for detail/modal carousels that omit this prop.
   */
  hostVisible?: boolean;
};

type SlideItem = { src: string; originalIndex: number };

const AUTOPLAY_DELAY_MS = 3000;

/** Above PostDetailModal (z-50), drawers (z-100), FrostedCenterModal (z-200), Modal/Dropdown (z-9999). */
const LIGHTBOX_PORTAL_Z = 10050;

/** Inline slides: no Swiper Zoom (feed scroll + pinch stay sane); lightbox keeps Zoom. */
const SLIDE_INNER =
  "media-carousel-slide-inner h-full w-full max-h-full grid place-items-center";

export default function MediaCarousel({
  images,
  maxHeight = "50vh",
  className = "",
  fit = "cover",
  enableLightbox = false,
  autoplay = false,
  interactiveDots = true,
  hostVisible = true,
}: Props) {
  const swiperRef = useRef<SwiperType | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const handleImageError = (originalIndex: number) => {
    console.warn(
      `MediaCarousel: Image ${originalIndex} failed to load:`,
      images[originalIndex]
    );
    setFailedImages((prev) => new Set([...prev, originalIndex]));
  };

  /** Slides use stable originalIndex keys; failed loads use the same index space as `images`. */
  const slideItems: SlideItem[] = useMemo(() => {
    const out: SlideItem[] = [];
    images.forEach((src, originalIndex) => {
      if (failedImages.has(originalIndex)) return;
      const url = imgUrlPublic(src);
      if (url) {
        out.push({ src, originalIndex });
        return;
      }
      if (src?.startsWith?.("data:image/")) {
        out.push({ src, originalIndex });
      }
    });
    return out;
  }, [images, failedImages]);

  const slideCount = slideItems.length;
  const shouldAutoplay = autoplay && slideCount > 1;
  /** Swiper loop needs enough duplicates; 2-slide autoplay uses rewind instead (no loop warnings). */
  const slideshowLoop = shouldAutoplay && slideCount >= 3;
  const slideshowRewind = shouldAutoplay && slideCount === 2;
  const multiSlide = slideCount > 1;

  const inlineSwiperModules = useMemo(
    () => (shouldAutoplay ? [Autoplay] : []),
    [shouldAutoplay]
  );

  const zoomOptions = useMemo(
    () => ({ maxRatio: 3, minRatio: 1, toggle: true }),
    []
  );

  const syncInlineIndex = useCallback((swiper: SwiperType) => {
    setIndex(swiper.realIndex);
  }, []);

  const goTo = (slideIdx: number) => {
    const swiper = swiperRef.current;
    if (!swiper || slideCount <= 1) return;
    const clamped = Math.max(0, Math.min(slideCount - 1, slideIdx));
    if (swiper.params.loop && typeof swiper.slideToLoop === "function") {
      swiper.slideToLoop(clamped);
    } else {
      swiper.slideTo(clamped);
    }
  };

  useEffect(() => {
    setIndex((prev) => (slideCount === 0 ? 0 : Math.min(prev, slideCount - 1)));
  }, [slideCount]);

  const imgFit =
    fit === "cover"
      ? "w-full h-full object-cover"
      : "w-full h-full object-contain";

  const frame =
    "relative isolate rounded-2xl border border-[var(--border)] overflow-hidden";

  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);
  const lightboxSwiperRef = useRef<SwiperType | null>(null);
  const lightboxSlideToIndexRef = useRef<number | null>(null);
  const lightboxSwipeContentRef = useRef<HTMLDivElement | null>(null);

  const lightboxGoTo = (i: number) => {
    const clamped = Math.max(0, Math.min(slideCount - 1, i));
    setIndex(clamped);
    lightboxSlideToIndexRef.current = clamped;
  };

  const closeLightbox = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    setTimeout(() => {
      closingRef.current = false;
    }, 150);
  }, []);

  /** Tap outside the image (letterbox / chrome) closes; pinch/double-tap zoom stays on .swiper-zoom-container only. */
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
    [closeLightbox]
  );

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
    if (!open || !enableLightbox) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, enableLightbox]);

  useEffect(() => {
    if (!open || !enableLightbox) return;
    return acquirePullToRefreshBlock();
  }, [open, enableLightbox]);

  useEffect(() => {
    if (!open || lightboxSlideToIndexRef.current === null) return;
    const targetIndex = lightboxSlideToIndexRef.current;
    lightboxSlideToIndexRef.current = null;
    const s = lightboxSwiperRef.current;
    if (s && s.activeIndex !== targetIndex) {
      s.slideTo(targetIndex, 280);
    }
  }, [open, index]);

  const [swiperReady, setSwiperReady] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [docVisible, setDocVisible] = useState(() =>
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true
  );

  useEffect(() => {
    if (!shouldAutoplay) setSwiperReady(false);
  }, [shouldAutoplay]);

  useEffect(() => {
    const onVis = () =>
      setDocVisible(
        typeof document !== "undefined" &&
          document.visibilityState === "visible"
      );
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const swiperModeKey = shouldAutoplay
    ? slideshowLoop
      ? "loop"
      : slideshowRewind
      ? "rew2"
      : "ap"
    : "man";

  const swiperInstanceKey = `${swiperModeKey}-${slideCount}`;

  useEffect(() => {
    setIndex(0);
  }, [swiperInstanceKey]);

  useEffect(() => {
    setInViewport(false);
  }, [swiperInstanceKey]);

  const allowPlayback =
    shouldAutoplay && hostVisible && docVisible && inViewport;

  useEffect(() => {
    if (!shouldAutoplay || !swiperReady) return;
    const swiper = swiperRef.current;
    if (!swiper?.autoplay) return;
    if (allowPlayback) swiper.autoplay.start();
    else swiper.autoplay.stop();
  }, [allowPlayback, shouldAutoplay, swiperReady, swiperInstanceKey]);

  useEffect(() => {
    if (!shouldAutoplay || !containerRef.current || !swiperReady) return;
    const el = containerRef.current;

    const syncFromRect = () => {
      const rect = el.getBoundingClientRect();
      const near = rect.top < window.innerHeight + 50 && rect.bottom > -50;
      setInViewport(near);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        setInViewport(!!e?.isIntersecting);
      },
      { root: null, rootMargin: "50px", threshold: 0.01 }
    );
    observer.observe(el);
    requestAnimationFrame(syncFromRect);

    return () => observer.disconnect();
  }, [shouldAutoplay, swiperReady, swiperInstanceKey]);

  const nonAutoplayRewind = !shouldAutoplay && multiSlide;

  return (
    <>
      <div ref={containerRef} className={`${frame} ${className}`}>
        <Swiper
          key={swiperInstanceKey}
          modules={inlineSwiperModules}
          autoplay={
            shouldAutoplay
              ? {
                  delay: AUTOPLAY_DELAY_MS,
                  pauseOnMouseEnter: false,
                  disableOnInteraction: true,
                }
              : false
          }
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            if (shouldAutoplay) {
              setSwiperReady(true);
            }
          }}
          onSlideChange={syncInlineIndex}
          onRealIndexChange={syncInlineIndex}
          loop={slideshowLoop}
          rewind={slideshowRewind || nonAutoplayRewind}
          slidesPerView={1}
          spaceBetween={0}
          speed={380}
          threshold={12}
          longSwipesRatio={0.35}
          preventClicks={true}
          preventClicksPropagation={false}
          touchAngle={45}
          touchReleaseOnEdges={true}
          nested={true}
          watchOverflow={true}
          style={{ height: maxHeight }}
          className="relative z-0 w-full"
        >
          {slideItems.map(({ src, originalIndex }, slideIdx) => {
            const imageUrl = imgUrlPublic(src);
            if (!imageUrl) {
              if (src && src.startsWith("data:image/")) {
                return (
                  <SwiperSlide key={`o-${originalIndex}`}>
                    <div className="min-w-full h-full bg-[var(--surface)] grid place-items-center">
                      <div
                        className={SLIDE_INNER}
                        onClick={() => {
                          if (enableLightbox && !closingRef.current) {
                            setOpen(true);
                          }
                        }}
                        style={{
                          cursor: enableLightbox ? "zoom-in" : "default",
                        }}
                      >
                        <img
                          src={src}
                          alt=""
                          className={`${imgFit} select-none max-h-full max-w-full`}
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                          onError={() => handleImageError(originalIndex)}
                        />
                      </div>
                    </div>
                  </SwiperSlide>
                );
              }
              return null;
            }

            const isPrioritySlide =
              slideIdx === index ||
              slideIdx === index - 1 ||
              slideIdx === index + 1;
            return (
              <SwiperSlide key={`o-${originalIndex}`}>
                <div className="min-w-full h-full bg-[var(--surface)] grid place-items-center">
                  <div
                    className={SLIDE_INNER}
                    onClick={() => {
                      if (enableLightbox && !closingRef.current) {
                        setOpen(true);
                      }
                    }}
                    style={{
                      cursor: enableLightbox ? "zoom-in" : "default",
                    }}
                    aria-label={enableLightbox ? "View full size" : undefined}
                  >
                    <ProgressiveImage
                      src={imageUrl}
                      alt=""
                      className={`${imgFit} select-none max-h-full max-w-full`}
                      viewportWidth={800}
                      rootMargin="400px"
                      priority={isPrioritySlide}
                      onError={() => handleImageError(originalIndex)}
                    />
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {multiSlide && (
          <div
            className={`pointer-events-none absolute bottom-2 left-0 right-0 z-20 flex items-center justify-center gap-1.5 ${
              interactiveDots ? "[&>button]:pointer-events-auto" : ""
            }`}
            aria-hidden={interactiveDots ? undefined : true}
          >
            {slideItems.map(({ originalIndex }, slideIdx) =>
              interactiveDots ? (
                <button
                  key={`dot-${originalIndex}`}
                  type="button"
                  onClick={() => goTo(slideIdx)}
                  className={`h-2 rounded-full transition ${
                    slideIdx === index
                      ? "bg-[var(--text)] w-4"
                      : "bg-[var(--text)]/50 w-2"
                  }`}
                  aria-label={`Go to image ${slideIdx + 1}`}
                />
              ) : (
                <span
                  key={`dot-${originalIndex}`}
                  className={`h-2 rounded-full transition ${
                    slideIdx === index
                      ? "bg-[var(--text)] w-4"
                      : "bg-[var(--text)]/50 w-2"
                  }`}
                />
              )
            )}
          </div>
        )}
      </div>

      {enableLightbox &&
        open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 flex flex-col bg-black/90"
            style={{
              zIndex: LIGHTBOX_PORTAL_Z,
              cursor: "zoom-out",
            }}
            role="presentation"
            onClick={handleLightboxBackdropClick}
            ref={(overlayEl) => {
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

                if (
                  diffY > LIGHTBOX_SWIPE_VERTICAL_THRESHOLD &&
                  diffY > diffX
                ) {
                  isVerticalSwipe = true;
                  overlayEl.style.backgroundColor =
                    lightboxSwipeBackdropRgba(diffY);
                  applyLightboxSwipeContentStyle(
                    lightboxSwipeContentRef.current,
                    diffY
                  );
                }
              };

              const handleSwipeEnd = (e: TouchEvent) => {
                if (!swipeStartY) return;

                const endY = e.changedTouches[0].clientY;
                const diffY = endY - swipeStartY;

                if (isVerticalSwipe && diffY > 100) {
                  if (!closingRef.current) {
                    closingRef.current = true;
                    setOpen(false);
                    setTimeout(() => {
                      closingRef.current = false;
                    }, 150);
                  }
                } else {
                  overlayEl.style.backgroundColor = "";
                  clearLightboxSwipeContentStyle(
                    lightboxSwipeContentRef.current
                  );
                }

                swipeStartY = 0;
                swipeStartX = 0;
                isVerticalSwipe = false;
              };

              overlayEl.addEventListener("touchstart", handleSwipeStart, {
                passive: true,
              });
              overlayEl.addEventListener("touchmove", handleSwipeMove, {
                passive: true,
              });
              overlayEl.addEventListener("touchend", handleSwipeEnd, {
                passive: true,
              });

              return () => {
                overlayEl.removeEventListener("touchstart", handleSwipeStart);
                overlayEl.removeEventListener("touchmove", handleSwipeMove);
                overlayEl.removeEventListener("touchend", handleSwipeEnd);
                overlayEl.style.backgroundColor = "";
                clearLightboxSwipeContentStyle(lightboxSwipeContentRef.current);
              };
            }}
          >
            <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
              <div
                ref={lightboxSwipeContentRef}
                className="flex min-h-0 min-w-0 flex-1 flex-col"
                role="presentation"
              >
                <Swiper
                  modules={[Zoom]}
                  zoom={zoomOptions}
                  slidesPerView={1}
                  spaceBetween={0}
                  speed={420}
                  threshold={14}
                  longSwipesRatio={0.32}
                  resistanceRatio={0.75}
                  initialSlide={Math.min(
                    Math.max(0, index),
                    Math.max(0, slideCount - 1)
                  )}
                  className="media-lightbox-swiper h-full min-h-0 w-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full"
                  style={{ height: "100%" }}
                  onSwiper={(swiper) => {
                    lightboxSwiperRef.current = swiper;
                    if (slideCount > 0) {
                      const start = Math.min(
                        Math.max(0, index),
                        slideCount - 1
                      );
                      swiper.slideTo(start, 0);
                    }
                  }}
                  onSlideChange={(s) => setIndex(s.activeIndex)}
                >
                  {slideItems.map(({ src, originalIndex }, slideIdx) => {
                    const imageUrl = imgUrlPublic(src);
                    if (!imageUrl) {
                      if (src && src.startsWith("data:image/")) {
                        return (
                          <SwiperSlide key={`lb-o-${originalIndex}`}>
                            <div className="flex h-full w-full items-center justify-center">
                              <div className="swiper-zoom-container flex h-fit max-h-full w-fit max-w-full items-center justify-center">
                                <img
                                  src={src}
                                  alt=""
                                  className="max-h-full max-w-full object-contain select-none"
                                  draggable={false}
                                />
                              </div>
                            </div>
                          </SwiperSlide>
                        );
                      }
                      return null;
                    }
                    return (
                      <SwiperSlide key={`lb-o-${originalIndex}`}>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      closeLightbox();
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
                  {slideItems.map(({ src, originalIndex }, slideIdx) => {
                    const thumbUrl = imgUrlPublic(src);
                    if (!thumbUrl && !src?.startsWith?.("data:image/"))
                      return null;
                    const thumbSrc = thumbUrl || src;
                    const active = slideIdx === index;
                    return (
                      <button
                        key={`thumb-${originalIndex}`}
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
          document.body
        )}
    </>
  );
}
