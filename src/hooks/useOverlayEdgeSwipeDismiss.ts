import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";

/** If vertical movement exceeds this and beats horizontal, treat as scroll — cancel gesture. */
const VERTICAL_SLOP_PX = 16;
/** Vertical must exceed horizontal by this ratio to cancel (avoid hijacking message scroll). */
const VERTICAL_DOMINANCE_OVER_DX = 1.38;
/** Minimum rightward dx before we show any overlay translation (preview). */
const HORIZONTAL_PREVIEW_MIN_DX = 2;
/** Lock to full horizontal tracking once dx is this large and leads vertical motion. */
const HORIZONTAL_LOCK_MIN_DX = 3;
/** For lock: dx must meet or exceed |dy| times this. */
const HORIZONTAL_LOCK_DOMINANCE = 1.0;
/** Preview: dx must be at least |dy| times this (allows natural diagonal starts). */
const HORIZONTAL_PREVIEW_DY_RATIO = 0.85;
/** Cancel if user swipes meaningfully left from start. */
const LEFTWARD_CANCEL_DX = 8;
/** Release past this fraction of commit threshold to dismiss. */
const COMMIT_THRESHOLD_RATIO = 0.87;
const SNAP_BACK_MS = 320;
const COMMIT_EXIT_MS = 260;
const COMMIT_NAV_DELAY_MS = 280;

/** Minimum strip width floor (px) before safe-area; used when `edgeMaxWidthVw` is 0 or as `max()` floor. */
const DEFAULT_EDGE_TOUCH_INSET_PX = 14;
const DEFAULT_EDGE_TOP_BELOW_SAFE_PX = 52;
/** Hard cap (px) when caller omits `edgeMaxWidthPx` and does not use a wide `edgeMaxWidthVw`. */
const DEFAULT_EDGE_MAX_WIDTH_PX = 48;

/** Wide swipe strip defaults for invite thread overlays (personal + group). */
export const INVITE_OVERLAY_EDGE_SWIPE_MAX_WIDTH_VW = 0.42;
export const INVITE_OVERLAY_EDGE_SWIPE_MAX_WIDTH_PX = 180;
const INVITE_OVERLAY_EDGE_STRIP_LEFT_INSET_WEB_PX = 12;
const INVITE_OVERLAY_EDGE_STRIP_LEFT_INSET_NATIVE_PX = 8;
const INVITE_OVERLAY_EDGE_TOP_BELOW_HEADER_PX = 8;

/** No scale polish until this fraction of commit threshold (avoids early “shrink”). */
const POLISH_START_THRESHOLD_FRACTION = 0.35;
/** Subtle shrink at full delayed progress (in `transform` only; no root opacity). */
const POLISH_SCALE_MIN = 0.985;
const REDUCED_MOTION_TRANSITION_CAP_MS = 120;

/**
 * 0 until `translateX` passes ~40% of commit threshold, then ramps to 1 at threshold and beyond.
 */
function dragDismissScaleProgress(
  translateXPx: number,
  commitThresholdPx: number,
): number {
  if (commitThresholdPx <= 0 || translateXPx <= 0) return 0;
  const startPx = commitThresholdPx * POLISH_START_THRESHOLD_FRACTION;
  if (translateXPx <= startPx) return 0;
  const span = Math.max(commitThresholdPx - startPx, 1e-6);
  return Math.min(1, (translateXPx - startPx) / span);
}

function computePolishScale(
  progress: number,
  reduceMotion: boolean,
): number {
  if (reduceMotion) return 1;
  return 1 - (1 - POLISH_SCALE_MIN) * progress;
}

export function defaultOverlayEdgeSwipeCommitThresholdPx(): number {
  if (typeof window === "undefined") return 100;
  return Math.max(88, Math.min(110, Math.round(window.innerWidth * 0.21)));
}

export function defaultOverlayEdgeSwipeMaxDragPx(): number {
  if (typeof window === "undefined") return 480;
  return Math.round(window.innerWidth * 0.92);
}

/** Past the right viewport edge so commit / programmatic exit does not stall with sheet still visible (~92vw max drag). */
const EXIT_TRANSLATE_OVERSHOOT_PX = 48;

/**
 * Horizontal translate for the committed dismiss animation only — fully off-screen to the right.
 * Live finger drag still uses {@link defaultOverlayEdgeSwipeMaxDragPx} / `maxDragPx`.
 */
export function defaultOverlayEdgeSwipeExitTranslatePx(): number {
  if (typeof window === "undefined") return 560;
  return Math.round(window.innerWidth + EXIT_TRANSLATE_OVERSHOOT_PX);
}

/**
 * Shared invisible strip layout for full-screen invite thread overlays.
 * Pair with `active`, `engageSwipe`, `gestureDisabled`, and `onDismiss` at the call site.
 */
export function inviteThreadOverlayEdgeSwipeStripOptions(
  headerPillOuterHeightPx: number,
): Pick<
  UseOverlayEdgeSwipeDismissOptions,
  | "edgeStripLeftInsetPx"
  | "edgeMaxWidthVw"
  | "edgeMaxWidthPx"
  | "edgeTopBelowSafeAreaPx"
> {
  return {
    edgeStripLeftInsetPx: isNativeApp()
      ? INVITE_OVERLAY_EDGE_STRIP_LEFT_INSET_NATIVE_PX
      : INVITE_OVERLAY_EDGE_STRIP_LEFT_INSET_WEB_PX,
    edgeMaxWidthVw: INVITE_OVERLAY_EDGE_SWIPE_MAX_WIDTH_VW,
    edgeMaxWidthPx: INVITE_OVERLAY_EDGE_SWIPE_MAX_WIDTH_PX,
    edgeTopBelowSafeAreaPx:
      headerPillOuterHeightPx + INVITE_OVERLAY_EDGE_TOP_BELOW_HEADER_PX,
  };
}

export type UseOverlayEdgeSwipeDismissOptions = {
  /**
   * Keep `true` while the element that receives `overlayMotionStyle` is still mounted and
   * should preserve hook-driven transform state (`translateX`, transition timing).
   *
   * When `active` becomes `false`, the hook **resets** `translateX` to 0 and clears gesture
   * state in an effect — if the overlay is still visible, that reads as a post-close snap/glitch.
   *
   * - **Delayed exit:** If the parent `open` prop becomes `false` but the portal stays mounted
   *   for an exit animation, `active` must follow that mounted lifetime (e.g. CreateChooserOverlay
   *   uses `active: visible`, not `open` alone).
   * - **Immediate unmount:** If `!open` means `return null` and the portal is gone, `active: open`
   *   is safe (PersonalInviteThreadOverlay / GroupInviteThreadOverlay).
   */
  active: boolean;
  /**
   * When `false`, the user **cannot start** a new edge swipe (strip stays inert via
   * `pointer-events-none` unless a strip gesture is already in flight). Defaults to `true`
   * when omitted.
   *
   * May be `false` during **entry or exit** while `active` stays `true` — e.g. CreateChooserOverlay
   * uses `engageSwipe: open && animateIn` so new swipes are off during exit even though
   * `active` stays `visible` until unmount.
   *
   * Invite thread overlays typically use `engageSwipe: engageInviteBack` (`open` plus route gate).
   */
  engageSwipe?: boolean;
  /**
   * When true, edge swipe does not start (e.g. keyboard open or composer focused).
   * Prefer a single boolean from the caller.
   */
  gestureDisabled?: boolean;
  /** Same path as in-app Back / dismiss — must not bypass history cleanup */
  onDismiss: () => void;
  /**
   * On commit, invoked first. If returns true, a nested layer consumed the dismiss
   * (e.g. group participants); overlay should snap back and stay open.
   */
  tryConsumeDismissLayer?: () => boolean;
  /**
   * Minimum strip width floor (px), combined with `env(safe-area-inset-left)` in CSS.
   * When `edgeMaxWidthVw` is set, width is `min(max(floor, Nvw), edgeMaxWidthPx)`.
   */
  edgeTouchInsetPx?: number;
  /**
   * Horizontal offset (px) after `env(safe-area-inset-left)` where the strip begins —
   * inset away from the browser/OS physical edge-back zone (often 8–16 on mobile web).
   */
  edgeStripLeftInsetPx?: number;
  /** Pixels below safe-area top where the strip starts (keeps header/back tappable). */
  edgeTopBelowSafeAreaPx?: number;
  /** Hard cap on strip width (px). */
  edgeMaxWidthPx?: number;
  /**
   * Preferred strip width as a viewport fraction (e.g. `0.42` ≈ 42vw), capped by `edgeMaxWidthPx`.
   */
  edgeMaxWidthVw?: number;
  /** Tailwind z-index class for the strip; default z-[28] */
  edgeStripZClass?: string;
  /** Override commit threshold (px) or factory */
  commitThresholdPx?: number | (() => number);
  /** Override max drag (px) or factory */
  maxDragPx?: number | (() => number);
  /**
   * Override exit translate (px) for committed swipe / `playAnimatedDismiss` only.
   * Default: {@link defaultOverlayEdgeSwipeExitTranslatePx} (fully off-screen right).
   */
  exitTranslatePx?: number | (() => number);
};

export type OverlayEdgeSwipeDismissStripProps = {
  className: string;
  style: CSSProperties;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  "aria-hidden": boolean;
};

export type UseOverlayEdgeSwipeDismissResult = {
  /** Apply to the full-screen overlay root (entire subtree moves together). */
  overlayMotionStyle: CSSProperties;
  /** Invisible left-edge capture strip — render as last child with z above scroll. Pass-through when swipe cannot start. */
  edgeStripProps: OverlayEdgeSwipeDismissStripProps;
  /** True while a horizontal dismiss gesture is active (after angle lock). */
  isDragging: boolean;
  /**
   * Programmatic close with the same rightward exit motion and delayed `onDismiss` as a
   * committed edge swipe (`COMMIT_EXIT_MS` + `COMMIT_NAV_DELAY_MS`). No-op if inactive,
   * a strip gesture is in flight, a commit timer is already pending, or `tryConsumeDismissLayer` consumes.
   */
  playAnimatedDismiss: () => void;
};

/**
 * Reusable iOS-style left-edge swipe-right to dismiss a full-screen overlay.
 *
 * - No visible handle, arrow, or affordance is rendered.
 * - While dragging, the overlay uses a **very subtle** `scale()` only (no root `opacity`)
 *   so the sheet never looks see-through over the route behind it. Scale eases in only after
 *   ~40% of the commit threshold; `prefers-reduced-motion: reduce` keeps scale at 1.
 * - A native OS/browser “back” chevron may still appear if touches start in the system’s
 *   reserved edge zone; use `edgeStripLeftInsetPx` (e.g. 8–16 on mobile web) to start the
 *   invisible strip slightly inward. Full suppression may still require Capacitor/WKWebView tuning.
 * - When `!active`, `engageSwipe === false`, or `gestureDisabled`, the strip uses
 *   `pointer-events-none` so it does not intercept taps (callers often disable while the
 *   composer or mention UI is active). During an in-flight strip gesture, the strip stays
 *   interactive until pointer-up.
 * - `playAnimatedDismiss()` runs the same exit transform + delayed `onDismiss` as a committed
 *   swipe (for in-app Back / Escape wiring). It is a no-op while `!active`, during an edge-strip
 *   pointer session, or while a commit timer is already pending.
 */
export function useOverlayEdgeSwipeDismiss(
  options: UseOverlayEdgeSwipeDismissOptions,
): UseOverlayEdgeSwipeDismissResult {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [translateX, setTranslateX] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  /** True from edge-strip pointerdown until gesture end — keeps strip interactive if `gestureDisabled` flips mid-gesture. */
  const [edgeStripPointerSession, setEdgeStripPointerSession] =
    useState(false);

  const draggingRef = useRef(false);
  const gestureModeRef = useRef<"undecided" | "horizontal" | "cancelled">(
    "undecided",
  );
  const startClientXRef = useRef(0);
  const startClientYRef = useRef(0);
  const translateRef = useRef(0);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDismissRef = useRef(options.onDismiss);
  onDismissRef.current = options.onDismiss;
  const tryConsumeRef = useRef(options.tryConsumeDismissLayer);
  tryConsumeRef.current = options.tryConsumeDismissLayer;

  useEffect(() => {
    translateRef.current = translateX;
  }, [translateX]);

  useEffect(() => {
    if (!options.active) {
      setTranslateX(0);
      setTransitionMs(0);
      setIsDragging(false);
      setEdgeStripPointerSession(false);
      draggingRef.current = false;
      gestureModeRef.current = "undecided";
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    }
  }, [options.active]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const engage = options.engageSwipe !== false;
  const canStartSwipe =
    options.active && engage && !options.gestureDisabled;
  /** Strip must not block underlying UI unless a swipe may start or a strip gesture is in flight. */
  const edgeStripReceivesPointers =
    canStartSwipe || edgeStripPointerSession;

  const resolveCommitThresholdPx = useCallback(() => {
    const o = optsRef.current.commitThresholdPx;
    if (typeof o === "function") return o();
    if (typeof o === "number") return o;
    return defaultOverlayEdgeSwipeCommitThresholdPx();
  }, []);

  const resolveMaxDragPx = useCallback(() => {
    const o = optsRef.current.maxDragPx;
    if (typeof o === "function") return o();
    if (typeof o === "number") return o;
    return defaultOverlayEdgeSwipeMaxDragPx();
  }, []);

  const resolveExitTranslatePx = useCallback(() => {
    const o = optsRef.current.exitTranslatePx;
    if (typeof o === "function") return o();
    if (typeof o === "number") return o;
    return defaultOverlayEdgeSwipeExitTranslatePx();
  }, []);

  const resetGestureState = useCallback(() => {
    draggingRef.current = false;
    gestureModeRef.current = "undecided";
    setIsDragging(false);
  }, []);

  const playAnimatedDismiss = useCallback(() => {
    if (!optsRef.current.active) return;
    if (commitTimerRef.current) return;
    if (draggingRef.current) return;
    if (tryConsumeRef.current?.() === true) return;

    const exitX = resolveExitTranslatePx();
    setTransitionMs(COMMIT_EXIT_MS);
    setTranslateX(exitX);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onDismissRef.current();
    }, COMMIT_NAV_DELAY_MS);
  }, [resolveExitTranslatePx]);

  const endPointerGesture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) {
        setEdgeStripPointerSession(false);
        return;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      setEdgeStripPointerSession(false);

      const mode = gestureModeRef.current;
      resetGestureState();

      if (mode === "cancelled" || mode === "undecided") {
        const x = translateRef.current;
        if (x <= 1) {
          setTransitionMs(0);
          setTranslateX(0);
          return;
        }
        setTransitionMs(SNAP_BACK_MS);
        setTranslateX(0);
        return;
      }

      const t = resolveCommitThresholdPx();
      const x = translateRef.current;
      if (x >= t * COMMIT_THRESHOLD_RATIO) {
        const consumed = tryConsumeRef.current?.() === true;
        if (consumed) {
          if (x <= 1) {
            setTransitionMs(0);
            setTranslateX(0);
            return;
          }
          setTransitionMs(SNAP_BACK_MS);
          setTranslateX(0);
          return;
        }
        const exitX = resolveExitTranslatePx();
        setTransitionMs(COMMIT_EXIT_MS);
        setTranslateX(exitX);
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          onDismissRef.current();
        }, COMMIT_NAV_DELAY_MS);
        return;
      }

      if (x <= 1) {
        setTransitionMs(0);
        setTranslateX(0);
        return;
      }
      setTransitionMs(SNAP_BACK_MS);
      setTranslateX(0);
    },
    [
      resetGestureState,
      resolveCommitThresholdPx,
      resolveExitTranslatePx,
    ],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!canStartSwipe) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (commitTimerRef.current) return;

      e.preventDefault();
      setEdgeStripPointerSession(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      gestureModeRef.current = "undecided";
      startClientXRef.current = e.clientX;
      startClientYRef.current = e.clientY;
      setTransitionMs(0);
    },
    [canStartSwipe],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;

      const dx = e.clientX - startClientXRef.current;
      const dy = e.clientY - startClientYRef.current;
      const mode = gestureModeRef.current;

      if (mode === "cancelled") return;

      if (mode === "undecided") {
        if (
          Math.abs(dy) > VERTICAL_SLOP_PX &&
          Math.abs(dy) >= Math.abs(dx) * VERTICAL_DOMINANCE_OVER_DX
        ) {
          gestureModeRef.current = "cancelled";
          setTransitionMs(0);
          setTranslateX(0);
          return;
        }
        if (dx < -LEFTWARD_CANCEL_DX) {
          gestureModeRef.current = "cancelled";
          setTransitionMs(0);
          setTranslateX(0);
          return;
        }

        const cap = resolveMaxDragPx();

        if (
          dx >= HORIZONTAL_LOCK_MIN_DX &&
          dx > Math.abs(dy) * HORIZONTAL_LOCK_DOMINANCE
        ) {
          gestureModeRef.current = "horizontal";
          setIsDragging(true);
          setTranslateX(Math.max(0, Math.min(dx, cap)));
          return;
        }

        if (
          dx >= HORIZONTAL_PREVIEW_MIN_DX &&
          dx >= Math.abs(dy) * HORIZONTAL_PREVIEW_DY_RATIO
        ) {
          setTranslateX(Math.max(0, Math.min(dx, cap)));
          return;
        }

        setTransitionMs(0);
        setTranslateX(0);
        return;
      }

      if (gestureModeRef.current !== "horizontal") return;
      const cap = resolveMaxDragPx();
      setTranslateX(Math.max(0, Math.min(dx, cap)));
    },
    [resolveMaxDragPx],
  );

  const inset =
    options.edgeTouchInsetPx ?? DEFAULT_EDGE_TOUCH_INSET_PX;
  const topPad =
    options.edgeTopBelowSafeAreaPx ?? DEFAULT_EDGE_TOP_BELOW_SAFE_PX;
  const maxW = options.edgeMaxWidthPx ?? DEFAULT_EDGE_MAX_WIDTH_PX;
  const edgeMaxWidthVw = options.edgeMaxWidthVw ?? 0;
  const edgeStripLeftInsetPx = options.edgeStripLeftInsetPx ?? 0;
  const zClass = options.edgeStripZClass ?? "z-[28]";

  const minStripWidthCss = `calc(${inset}px + env(safe-area-inset-left, 0px))`;
  const stripWidthCss =
    edgeMaxWidthVw > 0
      ? `min(max(${minStripWidthCss}, ${edgeMaxWidthVw * 100}vw), ${maxW}px)`
      : `min(${minStripWidthCss}, ${maxW}px)`;

  const commitThresholdPx = resolveCommitThresholdPx();
  const scaleProgress = dragDismissScaleProgress(translateX, commitThresholdPx);
  const overlayPolishScale = computePolishScale(scaleProgress, reduceMotion);

  const effectiveTransitionMs =
    reduceMotion && transitionMs > 0
      ? Math.min(transitionMs, REDUCED_MOTION_TRANSITION_CAP_MS)
      : transitionMs;

  const motionEasing = "cubic-bezier(0.22, 1, 0.32, 1)";
  const transitionTransform =
    effectiveTransitionMs > 0
      ? `transform ${effectiveTransitionMs}ms ${motionEasing}`
      : "none";

  const overlayMotionStyle: CSSProperties = {
    transform: `translate3d(${translateX}px,0,0) scale(${overlayPolishScale})`,
    transition: transitionTransform,
    willChange:
      translateX !== 0 || isDragging || effectiveTransitionMs > 0
        ? "transform"
        : undefined,
    /** Scoped: reduce horizontal overscroll chaining without global CSS. */
    overscrollBehaviorX: "none",
  };

  const edgeStripProps: OverlayEdgeSwipeDismissStripProps = {
    className: [
      edgeStripReceivesPointers
        ? "pointer-events-auto"
        : "pointer-events-none",
      "select-none outline-none absolute bottom-0",
      "bg-transparent",
      zClass,
    ].join(" "),
    style: {
      left: `calc(env(safe-area-inset-left, 0px) + ${edgeStripLeftInsetPx}px)`,
      top: `calc(env(safe-area-inset-top, 0px) + ${topPad}px)`,
      width: stripWidthCss,
      /** When interactive, block browser horizontal pan hijack; when inert, avoid affecting hit-testing quirks. */
      touchAction: edgeStripReceivesPointers ? "none" : "auto",
      WebkitTapHighlightColor: "transparent",
    },
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointerGesture,
    onPointerCancel: endPointerGesture,
    onLostPointerCapture: endPointerGesture,
    "aria-hidden": true,
  };

  return { overlayMotionStyle, edgeStripProps, isDragging, playAnimatedDismiss };
}
