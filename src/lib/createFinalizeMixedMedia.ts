import type { DraftMediaOrderItem } from "./createDraftMediaOrder";
import { clampFinalizeHeroMediaIndex } from "./createFinalizeHeroMedia";
import { VIDEO_SLIDE_GESTURE_THRESHOLD_PX } from "./createFinalizeVideoGestures";

/** Swiper `threshold` — matches video/image tap-vs-slide arbitration. */
export const MIXED_HERO_SWIPE_THRESHOLD_PX = VIDEO_SLIDE_GESTURE_THRESHOLD_PX;

export const MIXED_HERO_SWIPE_NO_SELECTOR =
  "[data-video-control],[data-swiper-no-swipe]";

export function shouldUseMixedHeroCarousel(hasVideo: boolean): boolean {
  return hasVideo;
}

export function shouldAllowMixedHeroSwipe(params: {
  dockExpanded: boolean;
  mediaDragActive: boolean;
  slideCount: number;
}): boolean {
  if (params.dockExpanded) return false;
  if (params.mediaDragActive) return false;
  return params.slideCount > 1;
}

export function adjacentSlideTranslateRange(
  startIndex: number,
  slideCount: number,
  slideWidth: number,
): { min: number; max: number } {
  if (slideWidth <= 0 || slideCount <= 0) return { min: 0, max: 0 };
  const start = Math.max(0, Math.min(slideCount - 1, startIndex));
  const nextIndex = Math.min(slideCount - 1, start + 1);
  const prevIndex = Math.max(0, start - 1);
  return {
    min: -nextIndex * slideWidth,
    max: -prevIndex * slideWidth,
  };
}

export function clampTranslateToAdjacent(
  translate: number,
  startIndex: number,
  slideCount: number,
  slideWidth: number,
): number {
  const { min, max } = adjacentSlideTranslateRange(
    startIndex,
    slideCount,
    slideWidth,
  );
  return Math.max(min, Math.min(max, translate));
}

/** One completed swipe commits at most the previous or next slide. */
export function clampCarouselCommitIndex(
  startIndex: number,
  proposedIndex: number,
  slideCount: number,
): number {
  const max = Math.max(0, slideCount - 1);
  const start = Math.max(0, Math.min(max, startIndex));
  if (proposedIndex === start) return start;
  const adjacent = proposedIndex > start ? start + 1 : start - 1;
  return Math.max(0, Math.min(max, adjacent));
}

export function resolveHeroIndexForClientId(
  mediaOrder: DraftMediaOrderItem[],
  clientId: string | null | undefined,
  fallbackIndex: number,
): number {
  if (clientId) {
    const idx = mediaOrder.findIndex((item) => item.clientId === clientId);
    if (idx >= 0) return idx;
  }
  return clampFinalizeHeroMediaIndex(fallbackIndex, mediaOrder.length);
}

export function mixedCarouselSlideIds(
  mediaOrder: DraftMediaOrderItem[],
): string[] {
  return mediaOrder.map((item) => item.clientId);
}
