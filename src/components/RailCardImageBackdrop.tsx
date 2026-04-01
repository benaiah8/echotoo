import React, { useEffect } from "react";
import { getBestImageUrl } from "../lib/imageOptimization";

type Props = {
  coverUrl: string;
  onImageError?: () => void;
};

/** Full-bleed cover + frosted scrim for rail cards; image shows through blurred overlay. */
export default function RailCardImageBackdrop({
  coverUrl,
  onImageError,
}: Props) {
  const src = getBestImageUrl(coverUrl, 240);

  useEffect(() => {
    if (!src) onImageError?.();
  }, [src, onImageError]);

  if (!src) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
      >
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full min-h-full min-w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          onError={() => onImageError?.()}
        />
      </div>
      {/* Theme-aware dark / light scrim for readable text */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
        style={{ background: "var(--rail-card-image-scrim)" }}
      />
      {/* Frosted layer — blurs image + scrim for glass look */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] rounded-[inherit] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]"
        style={{
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        }}
      />
    </>
  );
}
