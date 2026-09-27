/**
 * Nested Back guard for MediaGalleryLightbox when opened over People (Mine).
 * PeoplePage Android Back must close the gallery before leaving the tab.
 * Opt-in: only callers that notify open/close participate.
 */

let openCount = 0;
let suppressUnderlyingBackUntil = 0;
const SUPPRESS_UNDERLYING_BACK_MS = 200;

export function notifyMediaGalleryLightboxOpened(): void {
  openCount += 1;
}

export function notifyMediaGalleryLightboxClosed(): void {
  openCount = Math.max(0, openCount - 1);
  suppressUnderlyingBackUntil = Date.now() + SUPPRESS_UNDERLYING_BACK_MS;
}

/** True while a guarded lightbox is open or just handled hardware Back. */
export function shouldSuppressUnderlyingBackForMediaGalleryLightbox(): boolean {
  return openCount > 0 || Date.now() < suppressUnderlyingBackUntil;
}
