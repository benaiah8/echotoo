/**
 * Desktop layout detection for web-only presentation.
 *
 * Used to show a split-screen website shell on desktop/laptop browsers
 * (app in phone frame + EchoToo info panel) without affecting:
 * - Mobile browser layout
 * - Capacitor-wrapped native apps (iOS/Android)
 *
 * Condition: !isCapacitor() AND screen width >= DESKTOP_BREAKPOINT
 */

import { useState, useEffect } from "react";
import { isCapacitor } from "./storage/utils/capacitorDetection";

/** Minimum viewport width (px) to show desktop layout. Below this = mobile experience. */
export const DESKTOP_BREAKPOINT = 900;

/**
 * Returns true only when we should show the desktop website shell:
 * - Running in a browser (not Capacitor)
 * - Viewport width >= DESKTOP_BREAKPOINT
 *
 * Capacitor apps always get false (unchanged mobile layout).
 */
export function useIsDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Never apply desktop layout in Capacitor (native app)
    if (isCapacitor()) {
      setIsDesktop(false);
      return;
    }

    const update = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isDesktop;
}
