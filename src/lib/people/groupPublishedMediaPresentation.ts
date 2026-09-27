/**
 * Groups-owned published-media presentation helpers.
 *
 * Adapts Feed/Profile list rules (PublishedMediaSurface) for a FIXED People
 * card canvas. Does not alter Feed/Profile/Post Detail.
 *
 * Feed reference (PublishedMediaSurface list):
 * - single image → ProgressiveImage layout="natural" fit="contain"
 * - multi image → ProgressiveImage layout="fill" fit="contain" in shared frame
 * - frame chrome → black plate (`bg-black`)
 * - video → poster + play affordance (opens source Post Detail; no inline player)
 *
 * Groups adaptation:
 * - outer People card height is authoritative → never use natural/intrinsic
 *   height that would grow the card
 * - all stills use fill + contain inside the fixed canvas (preserve aspect,
 *   no stretch)
 */
import type { PublishedMediaItem } from "../publishedMedia";
import {
  isPublishedSingleImage,
  isPublishedVideoOnly,
} from "../publishedMedia";
import { publishedMediaVisualUrl } from "./groupSourceMedia";

/** ProgressiveImage layout inside the fixed Groups canvas (Feed multi rule). */
export const GROUP_PUBLISHED_IMAGE_LAYOUT = "fill" as const;

/** Always contain — never cover/crop or stretch inside Groups. */
export const GROUP_PUBLISHED_IMAGE_FIT = "contain" as const;

/** Same plate family as Feed `data-published-media-frame` (`bg-black`). */
export const GROUP_PUBLISHED_MEDIA_PLATE_BG = "bg-black";

export type GroupPublishedMediaKind =
  | "empty"
  | "single-image"
  | "multi-image"
  | "video-poster"
  | "mixed";

export function resolveGroupPublishedMediaKind(
  items: readonly PublishedMediaItem[],
): GroupPublishedMediaKind {
  if (items.length === 0) return "empty";
  if (isPublishedSingleImage(items)) return "single-image";
  if (isPublishedVideoOnly(items)) return "video-poster";
  if (items.length > 1) {
    const allImages = items.every((i) => i.kind === "image");
    return allImages ? "multi-image" : "mixed";
  }
  // Single video already handled; single non-image falls through to poster path.
  return items[0]?.kind === "video" ? "video-poster" : "single-image";
}

/**
 * Active slide visual URL — image url or video poster.
 * Video dimensions/status remain on the PublishedMediaItem for later playback.
 */
export function groupPublishedActiveVisual(
  items: readonly PublishedMediaItem[],
  activeIndex: number,
): {
  item: PublishedMediaItem | null;
  url: string | null;
  isVideo: boolean;
} {
  const count = items.length;
  if (count === 0) return { item: null, url: null, isVideo: false };
  const safe = Math.max(0, Math.min(count - 1, activeIndex));
  const item = items[safe] ?? null;
  return {
    item,
    url: publishedMediaVisualUrl(item),
    isVideo: item?.kind === "video",
  };
}

/**
 * Document that Groups never mounts an inner horizontal Swiper —
 * Embla owns horizontal drag; image tap + Prev/Next advance media index.
 */
export const GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER = false;

/** Visual frosted circle for Group media Prev/Next (px). */
export const GROUP_MEDIA_NAV_BTN_VISUAL_PX = 32;

/** Comfortable hit target for Group media Prev/Next (px). */
export const GROUP_MEDIA_NAV_BTN_HIT_PX = 40;

/** Equal bottom / side inset for the control row inside the media card (px). */
export const GROUP_MEDIA_NAV_INSET_PX = 12;

/**
 * Extra bottom clearance formerly used when People cards showed a scrubber.
 * Groups video is poster-only (no inline player/scrubber), so chrome uses the
 * same inset as images. Kept for documentation only.
 * @deprecated Do not reintroduce without a real bottom control collision.
 */
export const GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX = 0;

/** Wrap to previous media index (first → last). */
export function groupMediaPrevIndex(
  activeIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const safe = Math.max(0, Math.min(count - 1, activeIndex));
  return (safe - 1 + count) % count;
}

/** Wrap to next media index (last → first). */
export function groupMediaNextIndex(
  activeIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const safe = Math.max(0, Math.min(count - 1, activeIndex));
  return (safe + 1) % count;
}

/** Image tap-cycle advances; video owns its own tap (no index advance). */
export function groupMediaSurfaceTapAdvances(
  items: readonly PublishedMediaItem[],
  activeIndex: number,
): boolean {
  if (items.length <= 1) return false;
  const safe = Math.max(0, Math.min(items.length - 1, activeIndex));
  return items[safe]?.kind === "image";
}

/**
 * Pure fit assertion helper for tests: given canvas and source sizes,
 * contained destination must not exceed either canvas axis and must keep ratio.
 */
export function groupPublishedContainedSize(args: {
  canvasW: number;
  canvasH: number;
  sourceW: number;
  sourceH: number;
}): { width: number; height: number } {
  const { canvasW, canvasH, sourceW, sourceH } = args;
  if (
    !(canvasW > 0) ||
    !(canvasH > 0) ||
    !(sourceW > 0) ||
    !(sourceH > 0)
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(canvasW / sourceW, canvasH / sourceH);
  return {
    width: sourceW * scale,
    height: sourceH * scale,
  };
}
