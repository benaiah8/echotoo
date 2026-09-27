/**
 * Post Detail published carousel — initial slide + hydration index sync (Pass 2C).
 * Pure helpers so Swiper React index and pagination stay aligned without timeouts.
 */

import { remapPublishedMediaActiveIndex } from "./remapPublishedMediaActiveIndex";

export function resolvePublishedCarouselInitialIndex(
  items: readonly { key: string }[],
  initialMediaKey?: string | null,
): number {
  if (!initialMediaKey || items.length === 0) return 0;
  const found = items.findIndex((item) => item.key === initialMediaKey);
  return found >= 0 ? found : 0;
}

/**
 * After membership/order changes: prefer unfinished initialMediaKey, else remap by key.
 * Does not mark the initial key as applied — caller marks only after Swiper reaches the slide.
 */
export function resolvePublishedCarouselIndexAfterItemsChange(options: {
  initialMediaKey?: string | null;
  appliedKey: string | null;
  previousKey: string | null | undefined;
  previousIndex: number;
  nextItems: readonly { key: string }[];
}): number {
  const {
    initialMediaKey,
    appliedKey,
    previousKey,
    previousIndex,
    nextItems,
  } = options;
  const nextKeys = nextItems.map((item) => item.key);
  if (
    initialMediaKey &&
    appliedKey !== initialMediaKey &&
    nextKeys.includes(initialMediaKey)
  ) {
    return resolvePublishedCarouselInitialIndex(nextItems, initialMediaKey);
  }
  return remapPublishedMediaActiveIndex({
    previousKey,
    previousIndex,
    nextKeys,
  });
}

/**
 * Gate onSlideChange while initial positioning is incomplete so Swiper's
 * mount-time activeIndex 0 cannot overwrite the intended React/pagination index.
 */
export function shouldAcceptPublishedCarouselSlideChange(options: {
  initialMediaKey?: string | null;
  appliedKey: string | null;
  swiperActiveIndex: number;
  targetIndex: number;
}): { accept: boolean; markApplied: boolean } {
  const { initialMediaKey, appliedKey, swiperActiveIndex, targetIndex } =
    options;
  if (!initialMediaKey || appliedKey === initialMediaKey) {
    return { accept: true, markApplied: false };
  }
  if (swiperActiveIndex === targetIndex) {
    return { accept: true, markApplied: true };
  }
  return { accept: false, markApplied: false };
}

/** Mark initial key applied only when Swiper is on the intended slide. */
export function markPublishedCarouselInitialKeyApplied(options: {
  initialMediaKey?: string | null;
  appliedKey: string | null;
  swiperActiveIndex: number;
  items: readonly { key: string }[];
}): string | null {
  const { initialMediaKey, appliedKey, swiperActiveIndex, items } = options;
  if (!initialMediaKey) return appliedKey;
  if (appliedKey === initialMediaKey) return appliedKey;
  if (!items.some((item) => item.key === initialMediaKey)) return appliedKey;
  const target = resolvePublishedCarouselInitialIndex(items, initialMediaKey);
  if (swiperActiveIndex !== target) return appliedKey;
  return initialMediaKey;
}
