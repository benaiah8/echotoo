/**
 * Shared Profile chrome hide/show rules — same thresholds Own/Other scroll
 * handlers already use (direction + scrollY > 100).
 */

/** Hide chrome when scrolling down past this Y (matches page scroll handlers). */
export const PROFILE_HEADER_HIDE_SCROLL_Y_PX = 100;

/** Ignore tiny scroll jitter (matches page scroll handlers). */
export const PROFILE_HEADER_SCROLL_DELTA_PX = 6;

/**
 * Absolute header visibility from scrollY when there is no fresh direction
 * signal (initial framing / restored position seed).
 */
export function deriveProfileHeaderHiddenFromScrollY(scrollY: number): boolean {
  return scrollY > PROFILE_HEADER_HIDE_SCROLL_Y_PX;
}

/**
 * Directional update used by live scroll listeners.
 * Returns next hidden flag, or null when the delta is too small to react.
 */
export function nextProfileHeaderHiddenFromScroll(opts: {
  scrollY: number;
  lastScrollY: number;
  searchPinned: boolean;
}): boolean | null {
  const delta = opts.scrollY - opts.lastScrollY;
  if (Math.abs(delta) <= PROFILE_HEADER_SCROLL_DELTA_PX) return null;
  if (delta > 0 && opts.scrollY > PROFILE_HEADER_HIDE_SCROLL_Y_PX) {
    return opts.searchPinned ? false : true;
  }
  return false;
}
