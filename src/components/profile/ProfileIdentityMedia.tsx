import { useCallback, useMemo, useState, type ReactNode } from "react";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  profileIdentityInitial,
  resolveProfileIdentityMedia,
  type ProfileIdentityMediaSource,
} from "../../lib/profileIdentityMedia";

type Props = {
  source: ProfileIdentityMediaSource;
  mode: "primary" | "carousel";
  /** Carousel: controlled photo index (real photos only). */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  /** Carousel: dot indicators when photos.length > 1. Default true. */
  showIndicators?: boolean;
  className?: string;
  imageClassName?: string;
  /** When false, skip image fetch (e.g. off-screen deck slivers). Default true. */
  withPhoto?: boolean;
};

const PRESET_SHELL =
  "flex h-[46%] max-h-[11rem] w-[46%] max-w-[11rem] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/50";

const DEFAULT_PHOTO_IMG = "absolute inset-0 h-full w-full object-cover";
const DEFAULT_PRESET_IMG = "h-[86%] w-[86%] object-contain";

/**
 * Lightweight public identity media for social surfaces (People, Group Up, requests).
 * Not for Profile editing — use ProfilePhotoHero for owner Profile UI.
 */
export default function ProfileIdentityMedia({
  source,
  mode,
  activeIndex,
  onActiveIndexChange,
  showIndicators,
  className = "",
  imageClassName,
  withPhoto = true,
}: Props) {
  const resolved = useMemo(
    () => resolveProfileIdentityMedia(source),
    [source],
  );

  const photoCount = resolved.photos.length;
  const isControlled = activeIndex !== undefined;
  const [internalIndex, setInternalIndex] = useState(0);
  const index = isControlled ? activeIndex : internalIndex;

  const setIndex = useCallback(
    (next: number) => {
      if (photoCount <= 0) return;
      const wrapped =
        ((next % photoCount) + photoCount) % photoCount;
      if (isControlled) {
        onActiveIndexChange?.(wrapped);
      } else {
        setInternalIndex(wrapped);
      }
    },
    [photoCount, isControlled, onActiveIndexChange],
  );

  const safeIndex =
    photoCount > 0
      ? ((index % photoCount) + photoCount) % photoCount
      : 0;

  const showDots =
    mode === "carousel" &&
    photoCount > 1 &&
    (showIndicators ?? true);

  const handleTap = useCallback(() => {
    if (mode !== "carousel" || photoCount <= 1) return;
    setIndex(safeIndex + 1);
  }, [mode, photoCount, safeIndex, setIndex]);

  const initial = profileIdentityInitial(source);
  const photoImgClass = imageClassName ?? DEFAULT_PHOTO_IMG;

  let body: ReactNode;

  if (!withPhoto) {
    body = (
      <div className="absolute inset-0 bg-[var(--surface-2)]" aria-hidden />
    );
  } else if (resolved.kind === "photos" && photoCount > 0) {
    const path =
      mode === "primary"
        ? resolved.photos[0]
        : resolved.photos[safeIndex];
    const src = path ? avatarDisplayUrl(path) : undefined;
    body = src ? (
      <img
        src={src}
        alt=""
        className={photoImgClass}
        draggable={false}
        decoding="async"
      />
    ) : (
      <EmptyFallback initial={initial} />
    );
  } else if (resolved.kind === "echo" && resolved.echoPreset) {
    const src = avatarDisplayUrl(resolved.echoPreset);
    body = src ? (
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
        <div className={PRESET_SHELL}>
          <img
            src={src}
            alt=""
            className={imageClassName ?? DEFAULT_PRESET_IMG}
            draggable={false}
            decoding="async"
          />
        </div>
      </div>
    ) : (
      <EmptyFallback initial={initial} />
    );
  } else if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    const src = avatarDisplayUrl(resolved.primaryPhoto);
    body = src ? (
      <img
        src={src}
        alt=""
        className={photoImgClass}
        draggable={false}
        decoding="async"
      />
    ) : (
      <EmptyFallback initial={initial} />
    );
  } else {
    body = <EmptyFallback initial={initial} />;
  }

  const interactive =
    mode === "carousel" && photoCount > 1 && withPhoto;

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
      onClick={interactive ? handleTap : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTap();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Show next photo" : undefined}
    >
      {body}
      {showDots ? (
        <div
          className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex justify-center gap-1.5"
          aria-hidden
        >
          {resolved.photos.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-opacity ${
                i === safeIndex
                  ? "bg-white/90 opacity-100"
                  : "bg-white/50 opacity-70"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyFallback({ initial }: { initial: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)]">
      <div className="flex h-[38%] max-h-[9rem] w-[38%] max-w-[9rem] items-center justify-center rounded-full bg-[var(--surface)] text-xl font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)]/40">
        {initial}
      </div>
    </div>
  );
}
