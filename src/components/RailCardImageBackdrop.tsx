import React, { useEffect } from "react";
import { getBestImageUrl } from "../lib/imageOptimization";

type Props = {
  coverUrl: string;
  onImageError?: () => void;
  /**
   * Compact thumb for message cards: blurred fill + sharp foreground cover.
   * Default keeps full-bleed rail backdrop (Hangout rails unchanged).
   */
  compact?: boolean;
  className?: string;
};

/** Full-bleed cover + frosted scrim for rail cards; image shows through blurred overlay. */
export default function RailCardImageBackdrop({
  coverUrl,
  onImageError,
  compact = false,
  className,
}: Props) {
  const src = getBestImageUrl(coverUrl, compact ? 160 : 240);

  useEffect(() => {
    if (!src) onImageError?.();
  }, [src, onImageError]);

  if (!src) return null;

  if (compact) {
    return (
      <span
        className={`relative block h-full w-full overflow-hidden rounded-[inherit] ${className ?? ""}`.trim()}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover object-center blur-md"
          loading="lazy"
          decoding="async"
          onError={() => onImageError?.()}
        />
        <span
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: "var(--rail-card-image-scrim)" }}
        />
        <img
          src={src}
          alt=""
          className="relative z-[2] h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          onError={() => onImageError?.()}
        />
      </span>
    );
  }

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] ${className ?? ""}`.trim()}
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
