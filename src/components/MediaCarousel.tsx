// Optimized media carousel: Swiper inline carousel, fullscreen lightbox with thumbnails
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";
import { imgUrlPublic } from "../lib/img";
import {
  usePublishedMultiMediaFrame,
  type PublishedMediaItem,
  type PublishedMultiMediaFramePolicy,
} from "../lib/publishedMedia";
import ProgressiveImage from "./ui/ProgressiveImage";
import MediaGalleryLightbox from "./MediaGalleryLightbox";

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
   * When false, hide overlay pagination (Create uses external dots).
   * Default true so Feed / Post Detail stay unchanged.
   */
  showDots?: boolean;
  /**
   * When false, inline autoplay never runs (e.g. persistent tab hidden via display:none, or profile sub-tab inactive).
   * Default true for detail/modal carousels that omit this prop.
   */
  hostVisible?: boolean;
  /**
   * Optional controlled slide (`images` index). Finalize media manager only.
   * Omit everywhere else — feed/detail stay uncontrolled.
   */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  /**
   * Feed/Profile list: `"stable-list"` locks the first established multi frame.
   * Detail/Create omit this (default geometry).
   */
  framePolicy?: PublishedMultiMediaFramePolicy;
  /**
   * Feed `image_count` when known — reserves multi frame before full gallery hydrates.
   */
  expectedMediaCount?: number;
};

type SlideItem = { src: string; originalIndex: number };

const AUTOPLAY_DELAY_MS = 3000;

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
  showDots = true,
  hostVisible = true,
  activeIndex,
  onActiveIndexChange,
  framePolicy = "default",
  expectedMediaCount,
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

  const syncInlineIndex = useCallback(
    (swiper: SwiperType) => {
      setIndex(swiper.realIndex);
      if (!onActiveIndexChange) return;
      const original =
        slideItems[swiper.realIndex]?.originalIndex ?? swiper.realIndex;
      onActiveIndexChange(original);
    },
    [onActiveIndexChange, slideItems]
  );

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

  useEffect(() => {
    if (typeof activeIndex !== "number" || slideCount === 0) return;
    const slideIdx = slideItems.findIndex((s) => s.originalIndex === activeIndex);
    const target =
      slideIdx >= 0
        ? slideIdx
        : Math.max(0, Math.min(slideCount - 1, activeIndex));
    setIndex((prev) => (prev === target ? prev : target));
    const swiper = swiperRef.current;
    if (!swiper || slideCount <= 1) return;
    if (swiper.realIndex === target) return;
    if (swiper.params.loop && typeof swiper.slideToLoop === "function") {
      swiper.slideToLoop(target);
    } else {
      swiper.slideTo(target);
    }
  }, [activeIndex, slideCount, slideItems]);

  const imgFit =
    fit === "cover"
      ? "w-full h-full object-cover"
      : "w-full h-full object-contain";
  /** Create/Detail heroes fill a parent stage — do not impose aspect-ratio identity. */
  const fillParentStage =
    maxHeight === "100%" || /\bh-full\b/.test(className);
  const expectedCount =
    typeof expectedMediaCount === "number" &&
    Number.isFinite(expectedMediaCount) &&
    expectedMediaCount > 0
      ? Math.floor(expectedMediaCount)
      : 0;
  const forceMultiFrame =
    framePolicy === "stable-list" &&
    !fillParentStage &&
    expectedCount > 1 &&
    slideCount <= 1;
  /** PV3.6: one image always intrinsic — unless list reserved multi via image_count. */
  const singleImageNatural = slideCount === 1 && !forceMultiFrame;
  const multiSlideFrame = slideCount > 1 || forceMultiFrame;
  const applyMultiContentFrame = multiSlideFrame && !fillParentStage;
  const imgClass = singleImageNatural
    ? "w-full h-auto object-contain select-none max-w-full"
    : `${imgFit} select-none max-h-full max-w-full`;

  const legacyMediaItems = useMemo((): PublishedMediaItem[] => {
    return slideItems.map((s) => ({
      kind: "image" as const,
      key: `image:${s.src}`,
      url: s.src,
    }));
  }, [slideItems]);

  const { multiFrameStyle, reportImageNaturalSize } =
    usePublishedMultiMediaFrame(legacyMediaItems, {
      policy: framePolicy,
      forceMulti: forceMultiFrame,
    });

  const frame =
    "relative isolate rounded-2xl border border-[var(--border)] overflow-hidden";

  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);

  const closeLightbox = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    setTimeout(() => {
      closingRef.current = false;
    }, 150);
  }, []);

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
      <div
        ref={containerRef}
        className={`${frame} ${className}`}
        style={
          singleImageNatural
            ? undefined
            : applyMultiContentFrame && multiFrameStyle
              ? multiFrameStyle
              : { height: maxHeight }
        }
        data-media-carousel-single={singleImageNatural ? "true" : undefined}
        data-media-carousel-multi={multiSlideFrame ? "true" : undefined}
      >
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
          style={
            singleImageNatural
              ? { height: "auto" }
              : applyMultiContentFrame && multiFrameStyle
                ? { height: "100%" }
                : { height: maxHeight }
          }
          className={
            singleImageNatural
              ? "relative z-0 w-full [&_.swiper-wrapper]:h-auto [&_.swiper-slide]:h-auto"
              : "relative z-0 h-full w-full [&_.swiper-wrapper]:h-full [&_.swiper-slide]:h-full"
          }
        >
          {slideItems.map(({ src, originalIndex }, slideIdx) => {
            const imageUrl = imgUrlPublic(src);
            if (!imageUrl) {
              if (src && src.startsWith("data:image/")) {
                return (
                  <SwiperSlide key={`o-${originalIndex}`}>
                    <div className="min-w-full h-full bg-[var(--surface)] grid place-items-center">
                      <div
                        className={
                          singleImageNatural
                            ? "media-carousel-slide-inner w-full grid place-items-center"
                            : SLIDE_INNER
                        }
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
                          className={imgClass}
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
                <div
                  className={
                    singleImageNatural
                      ? "min-w-full w-full bg-[var(--surface)] grid place-items-center"
                      : "min-w-full h-full bg-[var(--surface)] grid place-items-center"
                  }
                >
                  <div
                    className={
                      singleImageNatural
                        ? "media-carousel-slide-inner w-full grid place-items-center"
                        : SLIDE_INNER
                    }
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
                      layout={singleImageNatural ? "natural" : "fill"}
                      fit={
                        singleImageNatural
                          ? "contain"
                          : multiSlideFrame
                            ? "cover"
                            : fit === "contain"
                              ? "contain"
                              : "cover"
                      }
                      fillMinHeight={
                        singleImageNatural || applyMultiContentFrame
                          ? false
                          : "200px"
                      }
                      className={
                        singleImageNatural
                          ? "w-full max-w-full select-none"
                          : imgClass
                      }
                      viewportWidth={800}
                      rootMargin="400px"
                      priority={isPrioritySlide}
                      onError={() => handleImageError(originalIndex)}
                      onNaturalSize={
                        applyMultiContentFrame
                          ? (w, h) =>
                              reportImageNaturalSize(`image:${src}`, w, h)
                          : undefined
                      }
                    />
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {showDots && multiSlide && (
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

      {enableLightbox ? (
        <MediaGalleryLightbox
          images={slideItems.map((s) => s.src)}
          open={open}
          activeIndex={index}
          onActiveIndexChange={(i) => {
            setIndex(i);
            const swiper = swiperRef.current;
            if (swiper && swiper.activeIndex !== i) {
              swiper.slideTo(i, 0);
            }
          }}
          onClose={closeLightbox}
        />
      ) : null}
    </>
  );
}
