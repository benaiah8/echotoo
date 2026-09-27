/**
 * Published fullscreen vertical-dismiss + backdrop-tap target rules (Pass 2D + 3C).
 */

/** Keep in sync with `PUBLISHED_MEDIA_SWIPE_NO_SELECTOR` in publishedMedia/index. */
const PUBLISHED_FULLSCREEN_NO_SWIPE_SELECTOR =
  "[data-video-control],[data-swiper-no-swipe],[data-video-scrubber]";

type ClosestHost = {
  closest: (selectors: string) => unknown;
};

function asClosestHost(target: EventTarget | null): ClosestHost | null {
  if (target && typeof (target as unknown as ClosestHost).closest === "function") {
    return target as unknown as ClosestHost;
  }
  return null;
}

/**
 * `default` — Pass 2D: block the entire video player (mixed / image-adjacent).
 * `video-only-surface` — Pass 3C: allow non-control video surface; block controls only.
 */
export type PublishedFullscreenVerticalDismissPolicy =
  | "default"
  | "video-only-surface";

/** True when the event target must not start vertical dismiss. */
export function isPublishedFullscreenVerticalDismissBlockedTarget(
  target: EventTarget | null,
  policy: PublishedFullscreenVerticalDismissPolicy = "default",
): boolean {
  const t = asClosestHost(target);
  if (!t) return false;
  const controlBlocked = Boolean(
    t.closest(PUBLISHED_FULLSCREEN_NO_SWIPE_SELECTOR) ||
      t.closest("[data-published-fullscreen-thumbs]") ||
      t.closest("[data-lightbox-close]") ||
      // Zoomed only — unzoomed `.swiper-zoom-container` / zoom wrappers are allowed.
      t.closest(".swiper-zoom-container-zoomed"),
  );
  if (controlBlocked) return true;
  if (policy === "video-only-surface") {
    // Allow gesture surface / player chrome exterior; controls already blocked above.
    return false;
  }
  return Boolean(t.closest("[data-published-video-player]"));
}

/** True when empty backdrop (not media / thumbs / controls) was clicked. */
export function isPublishedFullscreenBackdropDismissTarget(
  target: EventTarget | null,
): boolean {
  const t = asClosestHost(target);
  if (!t) return false;
  if (
    t.closest(".swiper-zoom-container") ||
    t.closest("[data-published-media-zoom]") ||
    t.closest("[data-published-video-player]") ||
    t.closest("[data-published-fullscreen-thumbs]") ||
    t.closest("[data-lightbox-close]") ||
    t.closest(PUBLISHED_FULLSCREEN_NO_SWIPE_SELECTOR)
  ) {
    return false;
  }
  return true;
}

export function shouldClosePublishedFullscreenVerticalDismiss(options: {
  isVerticalSwipe: boolean;
  diffY: number;
  thresholdPx?: number;
}): boolean {
  const threshold = options.thresholdPx ?? 100;
  return options.isVerticalSwipe && options.diffY > threshold;
}

export type PublishedFullscreenAxisLock = "undecided" | "horizontal" | "vertical";

/** Lock after the existing lightbox threshold so one sequence cannot own both axes. */
export function resolvePublishedFullscreenAxisLock(options: {
  diffX: number;
  diffY: number;
  thresholdPx?: number;
}): PublishedFullscreenAxisLock {
  const threshold = options.thresholdPx ?? 12;
  const absX = Math.abs(options.diffX);
  const absY = Math.abs(options.diffY);
  if (absX <= threshold && absY <= threshold) return "undecided";
  if (absX > absY) return "horizontal";
  return "vertical";
}

export function resolvePublishedFullscreenDismissPolicy(options: {
  videoOnly: boolean;
  persistMixedVideo: boolean;
}): PublishedFullscreenVerticalDismissPolicy {
  if (options.videoOnly || options.persistMixedVideo) return "video-only-surface";
  return "default";
}

/** Pass 2D: flag-off mixed video still cannot vertical-dismiss. */
export function shouldBlockLegacyMixedVideoVerticalDismiss(options: {
  persistSession: boolean;
  videoOnly: boolean;
  activeSlideIsVideo: boolean;
}): boolean {
  return (
    options.activeSlideIsVideo &&
    !options.videoOnly &&
    !options.persistSession
  );
}

export function resolvePublishedFullscreenThumbSrc(item: {
  kind: "image" | "video";
  url?: string;
  posterUrl?: string | null;
}): "image" | "video-poster" | "video-fallback" {
  if (item.kind === "image") return "image";
  if (item.posterUrl && String(item.posterUrl).trim()) return "video-poster";
  return "video-fallback";
}

/** True when items are a single published video (Pass 3C scope). */
export function isPublishedFullscreenVideoOnlyItems(
  items: readonly { kind?: string }[] | null | undefined,
): boolean {
  return Boolean(
    items && items.length === 1 && items[0]?.kind === "video",
  );
}

/**
 * Pass 3C: when fullscreen claims vertical dismiss, suppress the video surface
 * play/pause tap that may still resolve from the same pointer session.
 */
let suppressVideoSurfaceTapUntilMs = 0;

export function armPublishedFullscreenDismissTapSuppress(
  durationMs = 400,
): void {
  const next = Date.now() + Math.max(0, durationMs);
  if (next > suppressVideoSurfaceTapUntilMs) {
    suppressVideoSurfaceTapUntilMs = next;
  }
}

export function shouldSuppressPublishedVideoSurfaceTap(): boolean {
  return Date.now() < suppressVideoSurfaceTapUntilMs;
}

/** Test helper. */
export function __resetPublishedFullscreenDismissTapSuppressForTests(): void {
  suppressVideoSurfaceTapUntilMs = 0;
}
