/**
 * Shared swipe-to-dismiss feedback for ImageLightbox + MediaCarousel portal lightboxes.
 */

const SWIPE_PROGRESS_RANGE_PX = 220;

/** Minimum downward drag (px) before treating gesture as vertical dismiss. */
export const LIGHTBOX_SWIPE_VERTICAL_THRESHOLD = 12;

/** Overlay scrim while dragging down (strong fade toward transparent). */
export function lightboxSwipeBackdropRgba(diffY: number): string {
  const progress = Math.min(1, Math.max(0, diffY) / 200);
  const alpha = Math.max(0.05, 0.9 * (1 - progress * 0.94));
  return `rgba(0, 0, 0, ${alpha})`;
}

function swipeProgress(diffY: number): number {
  return Math.min(1, Math.max(0, diffY) / SWIPE_PROGRESS_RANGE_PX);
}

/**
 * Image/main column: fades + scales down + drifts slightly with drag so the whole photo area reads as dismissing.
 */
export function applyLightboxSwipeContentStyle(
  el: HTMLElement | null,
  diffY: number
): void {
  if (!el) return;
  const p = swipeProgress(diffY);
  const opacity = Math.max(0.22, 1 - p * 0.72);
  const scale = Math.max(0.84, 1 - p * 0.16);
  const translateY = Math.round(p * 28);
  el.style.opacity = String(opacity);
  el.style.transform = `translateY(${translateY}px) scale(${scale})`;
  el.style.transformOrigin = "center center";
  el.style.transition = "none";
}

export function clearLightboxSwipeContentStyle(el: HTMLElement | null): void {
  if (!el) return;
  el.style.opacity = "";
  el.style.transform = "";
  el.style.transformOrigin = "";
  el.style.transition = "";
}

const SNAP_BACK_MS = 200;

/**
 * Soft snap-back after a short vertical dismiss drag (no animation library).
 * Clears inline styles after the transition ends.
 */
export function snapBackLightboxSwipeContentStyle(
  el: HTMLElement | null,
  overlayEl?: HTMLElement | null,
): void {
  if (overlayEl) {
    overlayEl.style.transition = "background-color 0.2s ease-out";
    overlayEl.style.backgroundColor = "";
  }
  if (!el) return;
  el.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
  el.style.opacity = "1";
  el.style.transform = "translateY(0px) scale(1)";
  el.style.transformOrigin = "center center";
  globalThis.setTimeout(() => {
    if (overlayEl) overlayEl.style.transition = "";
    clearLightboxSwipeContentStyle(el);
  }, SNAP_BACK_MS);
}
