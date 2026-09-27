import type { DraftMediaOrderItem } from "./createDraftMediaOrder";

/** @deprecated Legacy pinned-first constant; prefer {@link resolveHeroMediaItem}. */
export const FINALIZE_HERO_VIDEO_INDEX = 0;

export function countFinalizeHeroMediaItems(
  imageCount: number,
  hasVideo: boolean,
): number {
  return (hasVideo ? 1 : 0) + imageCount;
}

export function countFinalizeHeroMediaItemsFromOrder(
  mediaOrder: DraftMediaOrderItem[],
): number {
  return mediaOrder.length;
}

export function clampFinalizeHeroMediaIndex(
  index: number,
  itemCount: number,
): number;
export function clampFinalizeHeroMediaIndex(
  index: number,
  imageCount: number,
  hasVideo: boolean,
): number;
export function clampFinalizeHeroMediaIndex(
  index: number,
  countOrImages: number,
  hasVideo?: boolean,
): number {
  const itemCount =
    hasVideo === undefined
      ? countOrImages
      : countFinalizeHeroMediaItems(countOrImages, hasVideo);
  const max = Math.max(0, itemCount - 1);
  return Math.max(0, Math.min(index, max));
}

export function shouldMountFinalizeHeroRegion(
  galleryLength: number,
  hasActiveVideo: boolean,
): boolean {
  return galleryLength > 0 || hasActiveVideo;
}

export function resolveHeroMediaItem(
  mediaOrder: DraftMediaOrderItem[],
  heroIndex: number,
): DraftMediaOrderItem | null {
  return mediaOrder[heroIndex] ?? null;
}

export function isVideoHeroAtIndex(
  mediaOrder: DraftMediaOrderItem[],
  heroIndex: number,
): boolean {
  return mediaOrder[heroIndex]?.kind === "video";
}

export function resolveHeroImageStorageUrl(
  mediaOrder: DraftMediaOrderItem[],
  heroIndex: number,
): string | null {
  const item = mediaOrder[heroIndex];
  return item?.kind === "image" ? item.url : null;
}

/** Slot-0 gallery index for a storage URL (matches `activities[0].images` order). */
export function slot0GalleryIndexForStorageUrl(
  slot0Images: string[],
  storageUrl: string,
): number {
  return slot0Images.indexOf(storageUrl);
}

/**
 * @deprecated Prefer {@link isVideoHeroAtIndex} with `mediaOrder`.
 * Legacy boolean overload: true only when video is pinned at index 0.
 */
export function isFinalizeVideoHeroIndex(
  heroIndex: number,
  mediaOrderOrLegacyHasVideo: DraftMediaOrderItem[] | boolean,
): boolean {
  if (Array.isArray(mediaOrderOrLegacyHasVideo)) {
    return isVideoHeroAtIndex(mediaOrderOrLegacyHasVideo, heroIndex);
  }
  return mediaOrderOrLegacyHasVideo && heroIndex === FINALIZE_HERO_VIDEO_INDEX;
}

/** @deprecated Prefer {@link resolveHeroImageStorageUrl}. */
export function finalizeHeroIndexToImageIndex(
  heroIndex: number,
  hasVideo: boolean,
): number | null {
  if (isFinalizeVideoHeroIndex(heroIndex, hasVideo)) return null;
  return hasVideo ? heroIndex - 1 : heroIndex;
}

/** @deprecated Prefer direct mediaOrder index for mixed posts. */
export function imageIndexToFinalizeHeroIndex(
  imageIndex: number,
  hasVideo: boolean,
): number {
  return hasVideo ? imageIndex + 1 : imageIndex;
}

/** @deprecated Use `mediaOrder.length` for slot-0 mixed offset. */
export function finalizeHeroMediaOffset(
  slot0MediaCountOrLegacyHasVideo: number | boolean,
): number {
  if (typeof slot0MediaCountOrLegacyHasVideo === "boolean") {
    return slot0MediaCountOrLegacyHasVideo ? 1 : 0;
  }
  return slot0MediaCountOrLegacyHasVideo;
}

export function remapHeroIndexAfterMediaMove(
  selectedIndex: number,
  fromIndex: number,
  toIndex: number,
): number {
  if (selectedIndex === fromIndex) return toIndex;
  if (fromIndex < toIndex && selectedIndex > fromIndex && selectedIndex <= toIndex) {
    return selectedIndex - 1;
  }
  if (fromIndex > toIndex && selectedIndex >= toIndex && selectedIndex < fromIndex) {
    return selectedIndex + 1;
  }
  return selectedIndex;
}

export function remapHeroIndexAfterMediaRemove(
  selectedIndex: number,
  removedIndex: number,
  nextCount: number,
): number {
  if (nextCount <= 0) return 0;
  if (selectedIndex < removedIndex) return selectedIndex;
  if (selectedIndex > removedIndex) {
    return Math.min(selectedIndex - 1, nextCount - 1);
  }
  return Math.min(removedIndex, nextCount - 1);
}

/** @deprecated Use {@link remapHeroIndexAfterMediaMove}. */
export function remapHeroIndexAfterImageMove(
  selectedHeroIndex: number,
  imageFrom: number,
  imageTo: number,
  hasVideo: boolean,
): number {
  if (isFinalizeVideoHeroIndex(selectedHeroIndex, hasVideo)) {
    return FINALIZE_HERO_VIDEO_INDEX;
  }
  const offset = hasVideo ? 1 : 0;
  const selectedImage = selectedHeroIndex - offset;
  if (selectedImage < 0) return selectedHeroIndex;
  let next = selectedImage;
  if (selectedImage === imageFrom) next = imageTo;
  else if (
    imageFrom < imageTo &&
    selectedImage > imageFrom &&
    selectedImage <= imageTo
  ) {
    next = selectedImage - 1;
  } else if (
    imageFrom > imageTo &&
    selectedImage >= imageTo &&
    selectedImage < imageFrom
  ) {
    next = selectedImage + 1;
  }
  return next + offset;
}

/** @deprecated Use {@link remapHeroIndexAfterMediaRemove}. */
export function remapHeroIndexAfterImageRemove(
  selectedHeroIndex: number,
  removedHeroIndex: number,
  nextHeroCount: number,
): number {
  return remapHeroIndexAfterMediaRemove(
    selectedHeroIndex,
    removedHeroIndex,
    nextHeroCount,
  );
}

/** @deprecated Use {@link remapHeroIndexAfterMediaRemove}. */
export function heroIndexAfterVideoRemoval(
  previousHeroIndex: number,
  imageCount: number,
): number {
  if (imageCount <= 0) return 0;
  const withoutVideo = previousHeroIndex <= 0 ? 0 : previousHeroIndex - 1;
  return clampFinalizeHeroMediaIndex(withoutVideo, imageCount, false);
}

export function isFinalizeVideoTileDraggable(): boolean {
  return true;
}

export const FINALIZE_HERO_VIDEO_OBJECT_FIT = "contain" as const;
