import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_THRESHOLD_PX = 48;
/** If layout viewport shrank by at least this vs peak (px), assume WebView already resized for IME. */
const LAYOUT_SHRUNK_PX = 80;

/**
 * Keyboard inset for create / drawers (px).
 * Single authority: visualViewport gap + Capacitor keyboard height, with Android
 * double-lift guard when the WebView already resized.
 */
export function useCreateKeyboardInset(): {
  keyboardInsetPx: number;
  keyboardOpen: boolean;
} {
  const [vvInset, setVvInset] = useState(0);
  const [capInset, setCapInset] = useState(0);
  const [layoutShrinkPx, setLayoutShrinkPx] = useState(0);
  /** Max innerHeight seen while keyboard was closed — used to detect Android WebView resize vs gap under-reporting. */
  const peakInnerHeightRef = useRef(
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  const pendingCapRef = useRef<number | null>(null);
  const capRafRef = useRef(0);

  const updateViewportMetrics = useCallback(() => {
    const ih = window.innerHeight;
    const vv = window.visualViewport;
    const gap = vv ? Math.max(0, ih - vv.height - vv.offsetTop) : 0;
    setVvInset(gap);
    setLayoutShrinkPx(Math.max(0, peakInnerHeightRef.current - ih));
  }, []);

  const scheduleCapInset = useCallback((next: number) => {
    pendingCapRef.current = Math.max(0, next);
    if (capRafRef.current) return;
    capRafRef.current = window.requestAnimationFrame(() => {
      capRafRef.current = 0;
      const pending = pendingCapRef.current;
      pendingCapRef.current = null;
      if (pending == null) return;
      setCapInset(pending);
      // Re-read vv in the same frame so layout-shrink vs cap don't fight.
      updateViewportMetrics();
    });
  }, [updateViewportMetrics]);

  useEffect(() => {
    const vv = window.visualViewport;
    let rafId = 0;

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateViewportMetrics();
      });
    };

    updateViewportMetrics();
    vv?.addEventListener("resize", scheduleUpdate);
    vv?.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", scheduleUpdate);
      vv?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [updateViewportMetrics]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let willShow: { remove: () => Promise<void> } | undefined;
    let didShow: { remove: () => Promise<void> } | undefined;
    let willHide: { remove: () => Promise<void> } | undefined;
    let didHide: { remove: () => Promise<void> } | undefined;

    (async () => {
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        const onShow = (info: { keyboardHeight?: number }) => {
          const h =
            typeof info.keyboardHeight === "number" ? info.keyboardHeight : 0;
          scheduleCapInset(h);
        };
        const onHide = () => scheduleCapInset(0);

        willShow = await Keyboard.addListener("keyboardWillShow", onShow);
        didShow = await Keyboard.addListener("keyboardDidShow", onShow);
        willHide = await Keyboard.addListener("keyboardWillHide", onHide);
        didHide = await Keyboard.addListener("keyboardDidHide", onHide);
      } catch {
        scheduleCapInset(0);
      }
    })();

    return () => {
      if (capRafRef.current) {
        window.cancelAnimationFrame(capRafRef.current);
        capRafRef.current = 0;
      }
      void willShow?.remove();
      void didShow?.remove();
      void willHide?.remove();
      void didHide?.remove();
    };
  }, [scheduleCapInset]);

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
      setLayoutShrinkPx(
        Math.max(0, peakInnerHeightRef.current - window.innerHeight)
      );
    }
  }, [vvInset, capInset]);

  // Prefer vv; use Capacitor height as native fallback when vv under-reports — unless
  // innerHeight already dropped (WebView resize), then extra bottom padding would double-count.
  const platform = Capacitor.getPlatform();
  const keyboardInsetPx = (() => {
    if (vvInset > OPEN_THRESHOLD_PX) return vvInset;

    if (capInset > OPEN_THRESHOLD_PX) {
      const shrunk = layoutShrinkPx > LAYOUT_SHRUNK_PX;

      if (platform === "android" && shrunk) return Math.max(0, vvInset);

      if (platform === "ios" && shrunk) {
        return Math.max(0, vvInset, capInset - layoutShrinkPx);
      }
    }

    if (platform === "android" || platform === "ios") {
      return Math.max(vvInset, capInset);
    }
    return vvInset;
  })();

  const keyboardOpen = keyboardInsetPx > OPEN_THRESHOLD_PX;

  return { keyboardInsetPx, keyboardOpen };
}
