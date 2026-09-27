/**
 * Page-shell document lock (internal scroller). Overlays should use
 * `useOverlayBackgroundScrollLock`. Do not set html/body scroll styles directly.
 */

import { useEffect } from "react";
import { acquirePageScrollLock } from "../lib/backgroundScrollLock";

/**
 * While `active`, freezes window/document overflow without fixed-body.
 * Nested overlay owners share the same lock; StrictMode-safe.
 */
export function usePageBackgroundScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquirePageScrollLock();
  }, [active]);
}
