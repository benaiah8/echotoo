/**
 * Overlay document scroll lock. Page shells with an internal scroller should use
 * `usePageBackgroundScrollLock` instead. Do not set html/body scroll styles directly.
 */

import { useEffect } from "react";
import { acquireBackgroundScrollLock } from "../lib/backgroundScrollLock";

/**
 * While `active`, freezes window/document scroll under full-screen overlays.
 * Nested overlays share one lock; unlock only when the last active consumer
 * releases. StrictMode-safe (each effect instance owns one release).
 */
export function useOverlayBackgroundScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireBackgroundScrollLock();
  }, [active]);
}
