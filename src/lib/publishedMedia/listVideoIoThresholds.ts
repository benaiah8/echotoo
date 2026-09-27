/**
 * Dense IntersectionObserver thresholds for tall published video (PV3.7).
 * Eligibility still uses computeEffectiveIntersectionRatio, not raw ratio.
 */

/** 0, 0.05, …, 1.00 — enough low-end callbacks when boundH ≫ viewport. */
export const PUBLISHED_LIST_IO_THRESHOLDS: readonly number[] = Object.freeze(
  Array.from({ length: 21 }, (_, i) => Math.round((i / 20) * 100) / 100),
);
