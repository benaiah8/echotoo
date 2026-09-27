/**
 * Immersive published-media fullscreen chrome helpers.
 *
 * Layout helpers for PublishedMediaFullscreenViewer (close, thumbs, dots,
 * pagination insets). Detail and Fullscreen each mount in-tree
 * PublishedVideoPlayer instances — no persistent body video portal and no
 * global hosted video element.
 */

/** True when the post includes at least one published video. */
export function isPublishedVideoContaining(
  items: readonly { kind?: string }[],
): boolean {
  for (const item of items) {
    if (item.kind === "video") return true;
  }
  return false;
}

/**
 * Immersive fullscreen chrome (top-left close, top-right pagination, no bottom
 * thumbs) for every video-containing post.
 */
export function shouldUsePublishedImmersiveFullscreenChrome(options: {
  containsVideo: boolean;
}): boolean {
  return options.containsVideo;
}

/**
 * Bottom thumb strip + centered close.
 * Hidden for immersive video posts and video-only.
 * Image-only galleries keep the strip when slideCount > 1.
 */
export function shouldShowPublishedFullscreenThumbStrip(options: {
  immersiveChrome: boolean;
  videoOnlyFullscreen: boolean;
  slideCount: number;
}): boolean {
  if (options.videoOnlyFullscreen) return false;
  if (options.slideCount <= 1) return false;
  if (options.immersiveChrome) return false;
  return true;
}

/** Overlay indicators — video and image share the same top-right chrome. */
export function shouldShowPublishedFullscreenMixedVideoDots(options: {
  immersiveChrome: boolean;
  videoOnlyFullscreen: boolean;
  slideCount: number;
}): boolean {
  return (
    options.immersiveChrome &&
    !options.videoOnlyFullscreen &&
    options.slideCount > 1
  );
}

/** Top-left close for video-only and immersive (video-containing) fullscreen. */
export function shouldShowPublishedFullscreenTopClose(options: {
  videoOnlyFullscreen: boolean;
  immersiveChrome: boolean;
}): boolean {
  if (options.videoOnlyFullscreen) return true;
  return options.immersiveChrome;
}

/** Compact count instead of dots when the strip would overflow the mute cluster. */
export const PUBLISHED_FULLSCREEN_MIXED_PAGINATION_DOT_LIMIT = 8;

export function shouldUsePublishedFullscreenMixedMediaCount(
  slideCount: number,
): boolean {
  return slideCount > PUBLISHED_FULLSCREEN_MIXED_PAGINATION_DOT_LIMIT;
}

/**
 * Dots sit above the immersive scrubber (safe-area + 0.75rem + track/time).
 * Overlay dots use pointer-events: none so they cannot steal seek hits.
 */
export const PUBLISHED_FULLSCREEN_MIXED_VIDEO_DOTS_BOTTOM_CSS =
  "calc(max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem)) + 2.25rem)";

/** Former `gap-3` between stage and chrome (image-only thumb column). */
export const PUBLISHED_FULLSCREEN_MIXED_CHROME_GAP_PX = 12;

/** Close row: `h-10` + `pb-1`. */
export const PUBLISHED_FULLSCREEN_MIXED_CHROME_CLOSE_PX = 44;

/**
 * Thumb rail: `pt-1` + `h-12` + `pb` 8px. Safe-area is added in the CSS token.
 */
export const PUBLISHED_FULLSCREEN_MIXED_CHROME_RAIL_PX = 60;

export const PUBLISHED_FULLSCREEN_MIXED_CHROME_BODY_PX =
  PUBLISHED_FULLSCREEN_MIXED_CHROME_GAP_PX +
  PUBLISHED_FULLSCREEN_MIXED_CHROME_CLOSE_PX +
  PUBLISHED_FULLSCREEN_MIXED_CHROME_RAIL_PX;

/** Kept for layout reference; immersive mixed no longer mounts this rail. */
export const PUBLISHED_FULLSCREEN_MIXED_CHROME_HEIGHT_CSS = `calc(${PUBLISHED_FULLSCREEN_MIXED_CHROME_BODY_PX}px + var(--safe-area-bottom-layout, 0px))`;

/** Matches video-only close top inset (`--safe-area-top-layout` + 0.75rem). */
export const PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_TOP_CSS =
  "calc(var(--safe-area-top-layout, 0px) + 0.75rem)";

export const PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_LEFT_CSS =
  "max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))";

/** Align with mute (`VIDEO_FULLSCREEN_CONTROLS_TOP_CSS`). */
export const PUBLISHED_FULLSCREEN_MIXED_PAGINATION_TOP_CSS =
  "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))";

/**
 * Mute is 32px at `VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS`.
 * Pagination sits inward by 2.5rem so video/image chrome geometry stays identical.
 */
export const PUBLISHED_FULLSCREEN_MIXED_PAGINATION_RIGHT_CSS =
  "calc(max(0.5rem, calc(env(safe-area-inset-right, 0px) + 0.5rem)) + 2.5rem)";

/** Fullscreen mounts an in-tree player for every video slide. */
export function shouldMountFullscreenPublishedVideoPlayer(options: {
  itemKind: string;
}): boolean {
  return options.itemKind === "video";
}

let objectIdentitySeq = 0;
const objectIdentities = new WeakMap<object, number>();

/** Stable per-object token. A new number means a different JS/DOM object. */
export function publishedVideoObjectIdentity(obj: object): number {
  let id = objectIdentities.get(obj);
  if (id == null) {
    objectIdentitySeq += 1;
    id = objectIdentitySeq;
    objectIdentities.set(obj, id);
  }
  return id;
}
