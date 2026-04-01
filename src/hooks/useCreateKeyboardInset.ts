import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";

const OPEN_THRESHOLD_PX = 48;

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

  // iOS + resize:"body": layout height already shrinks; visualViewport gap is often ~0.
  // Using max(cap) there would double-reserve space. Prefer vv; use Capacitor height as
  // Android fallback when vv under-reports (common on some WebViews).
  const platform = Capacitor.getPlatform();
  const keyboardInsetPx =
    vvInset > 8
      ? vvInset
      : platform === "android"
      ? Math.max(vvInset, capInset)
      : vvInset;

  const keyboardOpen = keyboardInsetPx > OPEN_THRESHOLD_PX;

  return { keyboardInsetPx, keyboardOpen };
}
