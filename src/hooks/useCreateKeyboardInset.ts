import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_THRESHOLD_PX = 48;
/** If layout viewport shrank by at least this vs peak (px), assume WebView already resized for IME. */
const ANDROID_LAYOUT_SHRUNK_PX = 80;

/**
 * Keyboard inset for the create flow (px). Uses visualViewport when available,
 * and merges with @capacitor/keyboard heights on native when that fires.
 */
export function useCreateKeyboardInset(): {
  keyboardInsetPx: number;
  keyboardOpen: boolean;
} {
  const [vvInset, setVvInset] = useState(0);
  const [capInset, setCapInset] = useState(0);
  /** Max innerHeight seen while keyboard was closed — used to detect Android WebView resize vs gap under-reporting. */
  const peakInnerHeightRef = useRef(
    typeof window !== "undefined" ? window.innerHeight : 0
  );

  const updateFromVisualViewport = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) {
      setVvInset(0);
      return;
    }
    const ih = window.innerHeight;
    const gap = Math.max(0, ih - vv.height - vv.offsetTop);
    setVvInset(gap);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    updateFromVisualViewport();
    vv.addEventListener("resize", updateFromVisualViewport);
    vv.addEventListener("scroll", updateFromVisualViewport);
    window.addEventListener("resize", updateFromVisualViewport);

    return () => {
      vv.removeEventListener("resize", updateFromVisualViewport);
      vv.removeEventListener("scroll", updateFromVisualViewport);
      window.removeEventListener("resize", updateFromVisualViewport);
    };
  }, [updateFromVisualViewport]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let showHandle: { remove: () => Promise<void> } | undefined;
    let hideHandle: { remove: () => Promise<void> } | undefined;

    (async () => {
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        showHandle = await Keyboard.addListener("keyboardWillShow", (info) => {
          const h =
            typeof info.keyboardHeight === "number" ? info.keyboardHeight : 0;
          setCapInset(Math.max(0, h));
        });
        hideHandle = await Keyboard.addListener("keyboardWillHide", () => {
          setCapInset(0);
        });
      } catch {
        setCapInset(0);
      }
    })();

    return () => {
      void showHandle?.remove();
      void hideHandle?.remove();
    };
  }, []);

  // Track peak layout height while IME is closed so we can tell "viewport already shrunk"
  // from "vv gap is 0 but Capacitor still reports keyboard height" (double-lift on Android).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const keyboardIdle =
      vvInset < OPEN_THRESHOLD_PX && capInset < OPEN_THRESHOLD_PX;
    if (keyboardIdle) {
      peakInnerHeightRef.current = Math.max(
        peakInnerHeightRef.current,
        window.innerHeight
      );
    }
  }, [vvInset, capInset]);

  // iOS + resize:"body": layout height already shrinks; visualViewport gap is often ~0.
  // Prefer vv; use Capacitor height as Android fallback when vv under-reports — unless
  // innerHeight already dropped (WebView resize), then extra bottom padding would double-count.
  const platform = Capacitor.getPlatform();
  const keyboardInsetPx = (() => {
    if (vvInset > OPEN_THRESHOLD_PX) return vvInset;

    if (
      platform === "android" &&
      capInset > OPEN_THRESHOLD_PX &&
      vvInset < OPEN_THRESHOLD_PX &&
      typeof window !== "undefined"
    ) {
      const shrunk =
        peakInnerHeightRef.current - window.innerHeight >
        ANDROID_LAYOUT_SHRUNK_PX;
      if (shrunk) return Math.max(0, vvInset);
    }

    if (platform === "android") return Math.max(vvInset, capInset);
    return vvInset;
  })();

  const keyboardOpen = keyboardInsetPx > OPEN_THRESHOLD_PX;

  return { keyboardInsetPx, keyboardOpen };
}
