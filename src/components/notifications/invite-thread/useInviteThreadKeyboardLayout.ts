import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useCreateKeyboardInset } from "../../../hooks/useCreateKeyboardInset";
import { isIOS } from "../../../lib/storage/utils/capacitorDetection";

export const INVITE_THREAD_SCROLL_PAD_TOP_PX = 120;
export const INVITE_THREAD_SCROLL_PAD_BOTTOM_FALLBACK_PX = 148;

/** Extra space below messages so the last bubble clears the floating chrome. */
const SCROLL_BOTTOM_EXTRA_PX = 8;

/** Matches composerBottomGap `+ 0.375rem` on Android. */
const COMPOSER_KEYBOARD_EXTRA_PX = 6;

/** Matches composerBottomGap `+ 0.875rem` on iOS. */
const IOS_COMPOSER_KEYBOARD_EXTRA_PX = 14;

/** Matches composerBottomGap `max(0.375rem, …)` floor on iOS. */
const IOS_COMPOSER_KEYBOARD_FLOOR_PX = 6;

/** Matches `min(24px, var(--safe-area-bottom-layout))` cap on iOS. */
const IOS_SAFE_AREA_CAP_PX = 24;

/** Auto-scroll when within this distance of the bottom (px). */
export const NEAR_BOTTOM_THRESHOLD_PX = 100;

function readLayoutSafeBottomPx(): number {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;padding-bottom:var(--safe-area-bottom-layout);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingBottom || "0");
    document.body.removeChild(probe);
    return Number.isFinite(px) ? Math.max(0, px) : 0;
  } catch {
    return 0;
  }
}

/** Numeric lift applied via composerBottomGap — used to extend scroll reserve. */
function keyboardLiftForScrollPx(
  keyboardInsetRoundedPx: number,
  isIOSDevice: boolean,
): number {
  if (keyboardInsetRoundedPx <= 0) return 0;

  if (isIOSDevice) {
    const safePx = readLayoutSafeBottomPx();
    const adjusted =
      keyboardInsetRoundedPx -
      Math.min(IOS_SAFE_AREA_CAP_PX, safePx) +
      IOS_COMPOSER_KEYBOARD_EXTRA_PX;
    return Math.max(IOS_COMPOSER_KEYBOARD_FLOOR_PX, adjusted);
  }

  return keyboardInsetRoundedPx + COMPOSER_KEYBOARD_EXTRA_PX;
}

function runAfterLayoutSettled(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

export type UseInviteThreadKeyboardLayoutOptions = {
  open: boolean;
  /** When false, skip measuring bottom chrome (overlay not showing composer stack). */
  measureChrome: boolean;
  remeasureDeps: readonly unknown[];
  /**
   * Extra px added to scrollPadTop (e.g. pinned source-context bar below header).
   */
  scrollPadTopExtraPx?: number;
  /**
   * Defaults to {@link INVITE_THREAD_SCROLL_PAD_BOTTOM_FALLBACK_PX} (148) for Invite.
   * Thin composers (e.g. persistent DM) may pass a lower value.
   */
  scrollPadBottomFallbackPx?: number;
  /**
   * When true (e.g. DM pin_bottom), chrome/pad height changes re-pin even if
   * composer is unfocused and keyboard is closed (M3B).
   */
  shouldPinBottomRef?: MutableRefObject<boolean>;
};

export function useInviteThreadKeyboardLayout({
  open,
  measureChrome,
  remeasureDeps,
  scrollPadBottomFallbackPx = INVITE_THREAD_SCROLL_PAD_BOTTOM_FALLBACK_PX,
  scrollPadTopExtraPx = 0,
  shouldPinBottomRef,
}: UseInviteThreadKeyboardLayoutOptions) {
  const { keyboardInsetPx, keyboardOpen } = useCreateKeyboardInset();

  const scrollLayerRef = useRef<HTMLDivElement>(null);
  const bottomChromeOuterRef = useRef<HTMLDivElement>(null);
  const bottomChromeContentRef = useRef<HTMLDivElement>(null);

  const [bottomChromeContentHeightPx, setBottomChromeContentHeightPx] =
    useState(scrollPadBottomFallbackPx);
  const [composerFocused, setComposerFocused] = useState(false);

  const prevKeyboardOpenRef = useRef(false);

  const keyboardInsetRoundedPx = Math.max(0, Math.round(keyboardInsetPx));
  const isIOSDevice = isIOS();

  const composerBottomGap = isIOSDevice
    ? keyboardInsetRoundedPx > 0
      ? `max(0.375rem, calc(${keyboardInsetRoundedPx}px - min(24px, var(--safe-area-bottom-layout)) + 0.875rem))`
      : "max(0.5rem, calc(var(--safe-area-bottom-layout) - 20px))"
    : keyboardInsetRoundedPx > 0
      ? `calc(${keyboardInsetRoundedPx}px + 0.375rem)`
      : "max(0.5rem, var(--safe-area-bottom-layout))";

  const scrollPadTop = `calc(env(safe-area-inset-top, 0px) + ${INVITE_THREAD_SCROLL_PAD_TOP_PX + Math.max(0, scrollPadTopExtraPx)}px)`;

  const keyboardLiftPx =
    keyboardOpen && keyboardInsetRoundedPx > 0
      ? keyboardLiftForScrollPx(keyboardInsetRoundedPx, isIOSDevice)
      : 0;

  const scrollPadBottomPx = Math.max(
    scrollPadBottomFallbackPx,
    bottomChromeContentHeightPx +
      (keyboardLiftPx > 0 ? keyboardLiftPx : 0) +
      SCROLL_BOTTOM_EXTRA_PX,
  );
  const scrollPadBottom = `${scrollPadBottomPx}px`;

  const getDistanceFromBottom = useCallback(() => {
    const el = scrollLayerRef.current;
    if (!el) return Number.POSITIVE_INFINITY;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }, []);

  const isNearBottom = useCallback(
    (threshold = NEAR_BOTTOM_THRESHOLD_PX) =>
      getDistanceFromBottom() <= threshold,
    [getDistanceFromBottom],
  );

  const scrollToBottom = useCallback(
    (opts?: { force?: boolean; behavior?: ScrollBehavior }) => {
      const el = scrollLayerRef.current;
      if (!el) return;
      if (!opts?.force && !composerFocused && !isNearBottom()) {
        return;
      }
      el.scrollTo({
        top: el.scrollHeight,
        behavior: opts?.behavior ?? "auto",
      });
    },
    [composerFocused, isNearBottom],
  );

  const onComposerFocus = useCallback(() => {
    setComposerFocused(true);
  }, []);

  const onComposerBlur = useCallback(() => {
    setComposerFocused(false);
  }, []);

  const scrollToBottomAfterSend = useCallback(() => {
    runAfterLayoutSettled(() => {
      scrollToBottom({ force: true, behavior: "auto" });
    });
  }, [scrollToBottom]);

  useEffect(() => {
    if (!open) {
      setBottomChromeContentHeightPx(scrollPadBottomFallbackPx);
      setComposerFocused(false);
      prevKeyboardOpenRef.current = false;
      return;
    }

    if (!measureChrome) return;

    const el = bottomChromeContentRef.current;
    if (!el) return;

    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setBottomChromeContentHeightPx(h);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("orientationchange", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasureDeps supplied by overlay
  }, [open, measureChrome, keyboardInsetRoundedPx, ...remeasureDeps]);

  useEffect(() => {
    const wasOpen = prevKeyboardOpenRef.current;
    prevKeyboardOpenRef.current = keyboardOpen;

    if (!open || !keyboardOpen || wasOpen || composerFocused) return;

    if (isNearBottom()) {
      runAfterLayoutSettled(() => {
        scrollToBottom({ behavior: "auto" });
      });
    }
  }, [keyboardOpen, open, composerFocused, isNearBottom, scrollToBottom]);

  /** Scroll after scrollPadBottom includes keyboard lift (focus + keyboard open + pin_bottom). */
  useLayoutEffect(() => {
    if (!open) return;

    if (composerFocused) {
      runAfterLayoutSettled(() => {
        scrollToBottom({
          force: true,
          behavior: keyboardOpen ? "smooth" : "auto",
        });
      });
      return;
    }

    if (shouldPinBottomRef?.current) {
      runAfterLayoutSettled(() => {
        scrollToBottom({ force: true, behavior: "auto" });
      });
      return;
    }

    if (keyboardOpen && isNearBottom()) {
      runAfterLayoutSettled(() => {
        scrollToBottom({ behavior: "auto" });
      });
    }
  }, [
    open,
    keyboardOpen,
    composerFocused,
    scrollPadBottomPx,
    keyboardLiftPx,
    bottomChromeContentHeightPx,
    isNearBottom,
    scrollToBottom,
    shouldPinBottomRef,
  ]);

  return {
    scrollLayerRef,
    bottomChromeOuterRef,
    bottomChromeContentRef,
    scrollPadTop,
    scrollPadBottom,
    scrollPadBottomPx,
    bottomChromeContentHeightPx,
    composerBottomGap,
    keyboardInsetPx: keyboardInsetRoundedPx,
    keyboardOpen,
    composerFocused,
    onComposerFocus,
    onComposerBlur,
    scrollToBottomAfterSend,
    isNearBottom,
  };
}
