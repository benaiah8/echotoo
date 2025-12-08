// PERF: Optimized media carousel with image optimization
import { useEffect, useRef, useState } from "react";
import { optimizeImageUrl } from "../lib/imageOptimization";
import { imgUrlPublic } from "../lib/img";

type Props = {
  images: string[];
  maxHeight?: string; // e.g. "60vh"
  className?: string;
  fit?: "cover" | "contain"; // default = "contain"
  enableLightbox?: boolean; // NEW
};

// PERF: Use our centralized image optimization
const optimize = (
  url: string,
  size: "small" | "medium" | "large" = "medium"
) => {
  return optimizeImageUrl(url, size, 80) || url;
};

export default function MediaCarousel({
  images,
  maxHeight = "50vh",
  className = "",
  fit = "cover",
  enableLightbox = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<HTMLDivElement[]>([]);
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set()); // Track failed images

  // Handle image load errors
  const handleImageError = (imageIndex: number) => {
    console.warn(
      `MediaCarousel: Image ${imageIndex} failed to load:`,
      images[imageIndex]
    );
    setFailedImages((prev) => new Set([...prev, imageIndex]));
  };

  // Filter out failed images for display
  const validImages = images.filter((_, i) => !failedImages.has(i));

  // keep refs in sync with images
  slideRefs.current = [];
  const setSlideRef = (el: HTMLDivElement | null, i: number) => {
    if (!el) return;
    slideRefs.current[i] = el;
  };

  // --- dots: most-visible slide via IO (same logic, unmodified) ---
  useEffect(() => {
    const root = trackRef.current;
    if (!root || slideRefs.current.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best = { i: 0, r: 0 };
        for (const e of entries) {
          const iAttr = (e.target as HTMLElement).dataset.index;
          const i = iAttr ? parseInt(iAttr, 10) : 0;
          if (e.intersectionRatio > best.r)
            best = { i, r: e.intersectionRatio };
        }
        setIndex((prev) => (best.r > 0 ? best.i : prev));
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    slideRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [images.length]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(images.length - 1, i));
    setIndex(clamped);
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const imgFit =
    fit === "cover"
      ? "w-full h-full object-cover"
      : "w-full h-full object-contain";

  // frame
  const frame =
    "relative rounded-2xl border border-[var(--border)] overflow-hidden";

  // --- lightbox state (minimal) ---
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Inline rail (feed/detail) */}
      <div className={`${frame} ${className}`}>
        <div
          ref={trackRef}
          className="w-full h-full flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-hide"
          style={{ height: maxHeight, touchAction: "pan-y pan-x" }}
        >
          {images.map((src, i) => {
            // Skip failed images
            if (failedImages.has(i)) return null;

            const imageUrl = imgUrlPublic(src);
            if (!imageUrl) {
              // If imgUrlPublic returns undefined, check if it's a valid base64 data URL
              if (src && src.startsWith("data:image/")) {
                // Use the base64 data URL directly
                return (
                  <div
                    key={i}
                    data-index={i}
                    ref={(el) => setSlideRef(el, i)}
                    className="min-w-full h-full snap-start bg-[var(--surface)] grid place-items-center"
                  >
                    <img
                      src={src}
                      alt=""
                      className={`${imgFit} select-none`}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      onClick={() => enableLightbox && setOpen(true)}
                      onError={() => handleImageError(i)}
                      style={{ cursor: enableLightbox ? "zoom-in" : "default" }}
                    />
                  </div>
                );
              }

              console.warn(
                `MediaCarousel: Invalid image URL for index ${i}:`,
                src
              );
              return null;
            }

            return (
              <div
                key={i}
                data-index={i}
                ref={(el) => setSlideRef(el, i)}
                className="min-w-full h-full snap-start bg-[var(--surface)] grid place-items-center"
              >
                <img
                  src={imageUrl}
                  alt=""
                  className={`${imgFit} select-none`}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onClick={() => enableLightbox && setOpen(true)}
                  onError={() => handleImageError(i)}
                  style={{ cursor: enableLightbox ? "zoom-in" : "default" }}
                />
              </div>
            );
          })}
        </div>

        {validImages.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition ${
                  i === index
                    ? "bg-[var(--text)] w-4"
                    : "bg-[var(--text)]/40 w-2"
                }`}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox overlay (swipe, no arrows) */}
      {enableLightbox && open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90"
          onClick={() => setOpen(false)}
          style={{ cursor: "zoom-out" }}
        >
          <div
            className="relative w-full h-full flex overflow-x-auto snap-x snap-mandatory scroll-hide"
            style={{ touchAction: "pan-y pan-x" }}
            onClick={(e) => e.stopPropagation()}
            ref={(el) => {
              if (!el) return;
              // center to current index when opening
              el.scrollLeft = index * el.clientWidth;
              // keep dots in sync while swiping in the lightbox
              const onScroll = () => {
                const i = Math.round(el.scrollLeft / (el.clientWidth || 1));
                if (i !== index) setIndex(i);
              };
              el.addEventListener("scroll", onScroll, { passive: true });
              // cleanup
              return () => el.removeEventListener("scroll", onScroll);
            }}
          >
            {validImages.map((src, i) => {
              const imageUrl = imgUrlPublic(src);
              if (!imageUrl) {
                // If imgUrlPublic returns undefined, check if it's a valid base64 data URL
                if (src && src.startsWith("data:image/")) {
                  return (
                    <div
                      key={i}
                      className="min-w-full h-full snap-start grid place-items-center"
                    >
                      <img
                        src={src}
                        alt=""
                        className="max-w-full max-h-full object-contain select-none"
                        draggable={false}
                      />
                    </div>
                  );
                }
                return null;
              }

              return (
                <div
                  key={i}
                  className="min-w-full h-full snap-start grid place-items-center"
                >
                  <img
                    src={imageUrl}
                    alt=""
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                  />
                </div>
              );
            })}
          </div>

          {/* dots in overlay */}
          {validImages.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-1.5">
              {validImages.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition ${
                    i === index ? "bg-white w-4" : "bg-white/40 w-2"
                  }`}
                />
              ))}
            </div>
          )}

          {/* close button */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white grid place-items-center"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
