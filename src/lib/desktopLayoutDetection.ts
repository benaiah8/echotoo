/**
 * Desktop layout detection for web-only presentation.
 *
 * Used to show a split-screen website shell on desktop/laptop browsers
 * (app in phone frame + EchoToo info panel) without affecting:
 * - Mobile browser layout (viewport < DESKTOP_BREAKPOINT)
 * - Native Capacitor apps (iOS/Android)
 *
 * Condition: !isNativeApp() AND screen width >= DESKTOP_BREAKPOINT
 *
 * Note: `@capacitor/core` installs `window.Capacitor` in normal browsers too.
 * Use isNativePlatform (via isNativeApp), not presence of Capacitor globals.
 */

import { useState, useEffect } from "react";
import { isNativeApp } from "./storage/utils/capacitorDetection";

/** Minimum viewport width (px) to show desktop layout. Below this = mobile experience. */
export const DESKTOP_BREAKPOINT = 900;

/**
 * Returns true only when we should show the desktop website shell:
 * - Not running in the native app (browser / responsive web only)
 * - Viewport width >= DESKTOP_BREAKPOINT
 *
 * Native apps always get false (unchanged mobile-like layout).
 */
export function useIsDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Never apply desktop layout inside the native Capacitor shell (iOS/Android).
    if (isNativeApp()) {
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
