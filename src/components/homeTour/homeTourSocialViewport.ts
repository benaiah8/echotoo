/**
 * Duo/Group Home Tour: safe-band geometry + lock-aware document scroll.
 * Interaction wiring stays in HomeTour; this module is pure positioning math
 * plus the canonical scroll-under-lock call.
 */

import { scrollDocumentByWhileLocked } from "../../lib/backgroundScrollLock";

/** Top pad below Home chrome for Duo/Group usable band. */
export const SOCIAL_VIEWPORT_TOP_PAD_PX = 16;
/** Clearance above `#bottom-tab` for Duo/Group row (16–24px). */
export const SOCIAL_BOTTOM_TAB_CLEARANCE_PX = 20;

export type SocialSafeViewport = {
  top: number;
  bottom: number;
  tabTop: number;
};

export type SocialPositionResult = {
  /** True when a document scroll delta was applied. */
  didScroll: boolean;
  /** Applied delta (0 when geometry was already acceptable). */
  delta: number;
};

/**
 * Unobscured feed band: below Home chrome, above `#bottom-tab` + clearance.
 */
export function readSocialSafeViewport(): SocialSafeViewport {
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const chrome =
    (document.querySelector(
      '[data-tour-target="home-search-filters"]'
    ) as HTMLElement | null) ??
    (document.querySelector(
      '[data-tour-target="home-filters"]'
    ) as HTMLElement | null);
  const chromeBottom = chrome
    ? chrome.getBoundingClientRect().bottom
    : 72 + SOCIAL_VIEWPORT_TOP_PAD_PX;

  const tab = document.getElementById("bottom-tab");
  const tabTop = tab ? tab.getBoundingClientRect().top : vh - 72;

  return {
    top: Math.max(8, chromeBottom + SOCIAL_VIEWPORT_TOP_PAD_PX),
    bottom: Math.max(120, tabTop - SOCIAL_BOTTOM_TAB_CLEARANCE_PX),
    tabTop,
  };
}

export function readSocialMeasureElement(
  clusterEl: Element,
  stepId: string
): Element {
  const pillSel =
    stepId === "duo"
      ? '[data-social-pill="duo"]'
      : stepId === "group"
        ? '[data-social-pill="group"]'
        : null;
  return (
    (pillSel ? clusterEl.querySelector(pillSel) : null) ?? clusterEl
  );
}

/**
 * Compute vertical delta to place the control near the center of the safe band.
 * Returns 0 when already acceptably placed (no scroll needed).
 */
export function computeSocialScrollDelta(
  rect: DOMRectReadOnly,
  vp: SocialSafeViewport
): number {
  const band = Math.max(80, vp.bottom - vp.top);
  // Center of the unobscured feed band.
  const preferredMid = vp.top + band * 0.5;
  const targetMid = rect.top + rect.height / 2;

  const underTab =
    rect.bottom > vp.tabTop - SOCIAL_BOTTOM_TAB_CLEARANCE_PX;
  const tooLow = rect.bottom > vp.bottom;
  const tooHigh = rect.top < vp.top + 4;
  const poorlyCentered = Math.abs(targetMid - preferredMid) > band * 0.22;

  if (!underTab && !tooLow && !tooHigh && !poorlyCentered) {
    return 0;
  }

  // Prefer clearing BottomTab first, then settle toward preferred mid.
  let delta = targetMid - preferredMid;
  if (underTab || tooLow) {
    const needUp = rect.bottom - (vp.tabTop - SOCIAL_BOTTOM_TAB_CLEARANCE_PX);
    delta = Math.max(delta, needUp);
  }
  return delta;
}

export function socialTargetNeedsSafeViewportMove(
  clusterEl: Element,
  stepId: string
): boolean {
  const measureEl = readSocialMeasureElement(clusterEl, stepId);
  const rect = measureEl.getBoundingClientRect();
  return Math.abs(computeSocialScrollDelta(rect, readSocialSafeViewport())) >= 0.5;
}

/**
 * Place Duo/Group so the control sits near the center of the usable feed band,
 * clearing BottomTab. Uses lock-aware document scroll (fixed-body safe).
 *
 * Does not own one-shot bookkeeping — caller marks completion after settle.
 */
export function ensureSocialTargetInSafeViewport(
  clusterEl: Element,
  stepId: string
): SocialPositionResult {
  const measureEl = readSocialMeasureElement(clusterEl, stepId);
  const rect = measureEl.getBoundingClientRect();
  const delta = computeSocialScrollDelta(rect, readSocialSafeViewport());
  if (Math.abs(delta) < 0.5) {
    return { didScroll: false, delta: 0 };
  }
  const applied = scrollDocumentByWhileLocked(delta);
  return { didScroll: Math.abs(applied) >= 0.5, delta: applied };
}
