import { useEffect, useState } from "react";

export type UseScrollDirectionOptions = {
  /**
   * When set, uses cumulative scroll intent: sum downward deltas before "down",
   * sum upward deltas before "up". Omit for legacy 10px flip behavior.
   */
  hideAfterDownPx?: number;
  /** Cumulative upward movement before switching to "up" (intent mode only). */
  showAfterUpPx?: number;
  /** While scrollY is below this, direction stays "up" (intent mode only). */
  minScrollYToHide?: number;
  /** Ignore scroll deltas smaller than this (intent mode only). */
  noisePx?: number;
  /**
   * Intent mode only: cap each scroll event’s contribution to accumDown/accumUp.
   * Reduces one huge delta (trackpad fling, coalesced touch) from arming hide in a single event.
   */
  maxDeltaPerEvent?: number;
};

/**
 * Scroll direction for chrome hide/show.
 * - Default (no options): legacy behavior — flip after 10px movement from last anchor.
 * - Intent mode: pass `hideAfterDownPx` to require cumulative downward/upward thresholds.
 */
export default function useScrollDirection(options?: UseScrollDirectionOptions) {
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up");

  const hideAfterDownPx = options?.hideAfterDownPx;
  const showAfterUpPx = options?.showAfterUpPx ?? 18;
  const minScrollYToHide = options?.minScrollYToHide ?? 100;
  const noisePx = options?.noisePx ?? 2;
  const maxDeltaPerEvent = options?.maxDeltaPerEvent;
  const useIntent =
    typeof hideAfterDownPx === "number" && hideAfterDownPx > 0;

  useEffect(() => {
    let lastY = window.scrollY;
    let accumDown = 0;
    let accumUp = 0;

    const onScroll = () => {
      const y = window.scrollY;

      if (useIntent) {
        if (y < minScrollYToHide) {
          setScrollDir("up");
          accumDown = 0;
          accumUp = 0;
          lastY = y;
          return;
        }

        const rawDelta = y - lastY;
        lastY = y;

        if (Math.abs(rawDelta) < noisePx) {
          return;
        }

        const deltaCap =
          typeof maxDeltaPerEvent === "number" && maxDeltaPerEvent > 0
            ? maxDeltaPerEvent
            : null;
        const delta =
          deltaCap !== null
            ? Math.sign(rawDelta) *
              Math.min(Math.abs(rawDelta), deltaCap)
            : rawDelta;

        if (delta > 0) {
          accumDown += delta;
          accumUp = 0;
          if (accumDown >= hideAfterDownPx!) {
            setScrollDir("down");
            accumDown = 0;
            accumUp = 0;
          }
        } else {
          accumUp += -delta;
          accumDown = 0;
          if (accumUp >= showAfterUpPx) {
            setScrollDir("up");
            accumDown = 0;
            accumUp = 0;
          }
        }
        return;
      }

      if (Math.abs(y - lastY) > 10) {
        setScrollDir(y > lastY ? "down" : "up");
        lastY = y;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [
    useIntent,
    hideAfterDownPx,
    showAfterUpPx,
    minScrollYToHide,
    noisePx,
    maxDeltaPerEvent,
  ]);

  return scrollDir;
}
