/**
 * Discover feed photo swipe — pure axis lock, track math, snap decisions.
 * Duo Embla / tap-cycle stay out of this module.
 */

export const DISCOVER_PHOTO_SWIPE_AXIS_LOCK_PX = 10;
export const DISCOVER_PHOTO_SWIPE_COMMIT_PX = 48;
/** Fraction of viewport width that also commits a slide (with commitPx). */
export const DISCOVER_PHOTO_SWIPE_COMMIT_RATIO = 0.28;
export const DISCOVER_PHOTO_SWIPE_SETTLE_MS = 220;

export type DiscoverPhotoSwipeAxis = "undecided" | "horizontal" | "vertical";
export type DiscoverPhotoSwipeSnap = "prev" | "next" | "stay";

export function resolveDiscoverPhotoSwipeAxis(
  dx: number,
  dy: number,
  lockPx: number = DISCOVER_PHOTO_SWIPE_AXIS_LOCK_PX
): DiscoverPhotoSwipeAxis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < lockPx && ay < lockPx) return "undecided";
  return ax > ay ? "horizontal" : "vertical";
}

export function discoverPhotoSwipeNeighborIndices(
  currentIndex: number,
  photoCount: number
): { prev: number; current: number; next: number } {
  if (photoCount <= 0) {
    return { prev: 0, current: 0, next: 0 };
  }
  const current =
    ((currentIndex % photoCount) + photoCount) % photoCount;
  return {
    prev: (current - 1 + photoCount) % photoCount,
    current,
    next: (current + 1) % photoCount,
  };
}

/** Settled 3-slot track centers the current photo (slot 1). */
export function discoverPhotoSwipeTrackTranslatePx(params: {
  slotWidthPx: number;
  dragPx: number;
  centerSlot?: number;
}): number {
  const center = params.centerSlot ?? 1;
  return -center * params.slotWidthPx + params.dragPx;
}

/**
 * Commit next/prev from released drag. Short / vertical / diagonal → stay.
 * Swipe left (dragPx < 0) → next; swipe right → previous.
 */
export function resolveDiscoverPhotoSwipeSnap(params: {
  dragPx: number;
  dy: number;
  axis: DiscoverPhotoSwipeAxis;
  slotWidthPx: number;
  commitPx?: number;
  commitRatio?: number;
}): DiscoverPhotoSwipeSnap {
  const {
    dragPx,
    dy,
    axis,
    slotWidthPx,
    commitPx = DISCOVER_PHOTO_SWIPE_COMMIT_PX,
    commitRatio = DISCOVER_PHOTO_SWIPE_COMMIT_RATIO,
  } = params;
  if (axis !== "horizontal") return "stay";
  const ax = Math.abs(dragPx);
  const ay = Math.abs(dy);
  if (ax <= ay) return "stay";
  const threshold = Math.max(
    commitPx,
    Math.round(slotWidthPx * commitRatio)
  );
  if (ax < threshold) return "stay";
  return dragPx < 0 ? "next" : "prev";
}

/**
 * Swipe left (dx < 0) → next; swipe right (dx > 0) → previous.
 * Returns null when the gesture must not change photos. Wraps like former tap-cycle.
 */
export function resolveDiscoverPhotoSwipeNextIndex(params: {
  dx: number;
  dy: number;
  axis: DiscoverPhotoSwipeAxis;
  photoCount: number;
  currentIndex: number;
  commitPx?: number;
  slotWidthPx?: number;
}): number | null {
  const {
    dx,
    dy,
    axis,
    photoCount,
    currentIndex,
    commitPx = DISCOVER_PHOTO_SWIPE_COMMIT_PX,
    slotWidthPx = 0,
  } = params;
  if (photoCount <= 1) return null;
  const snap = resolveDiscoverPhotoSwipeSnap({
    dragPx: dx,
    dy,
    axis,
    slotWidthPx,
    commitPx,
  });
  if (snap === "stay") return null;
  const delta = snap === "next" ? 1 : -1;
  return ((currentIndex + delta) % photoCount + photoCount) % photoCount;
}
