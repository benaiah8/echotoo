/**
 * PWA Detection Utility
 * 
 * Detects if the app is running in a PWA (Progressive Web App) context.
 * This is useful for applying PWA-specific optimizations and fixes.
 * 
 * @returns true if running in PWA, false otherwise
 */
export function isPWA(): boolean {
  // Check for standalone display mode (most reliable)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  // Check for iOS standalone mode
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  // Check for Android app referrer
  if (document.referrer.includes('android-app://')) {
    return true;
  }

  // Check if launched from home screen (heuristic)
  // This is less reliable but can catch some cases
  if (
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  ) {
    // Additional check: no browser UI elements
    const hasBrowserUI = window.outerHeight - window.innerHeight > 100;
    if (!hasBrowserUI) {
      return true;
    }
  }

  return false;
}



