import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** If vertical movement exceeds this and beats horizontal, treat as scroll — cancel gesture. */
const VERTICAL_SLOP_PX = 10;
/** Vertical must exceed horizontal by this ratio to cancel (avoid hijacking message scroll). */
const VERTICAL_DOMINANCE_OVER_DX = 1.12;
/** Minimum rightward dx before we show any overlay translation (preview). */
const HORIZONTAL_PREVIEW_MIN_DX = 3;
/** Lock to full horizontal tracking once dx is this large and leads vertical motion. */
const HORIZONTAL_LOCK_MIN_DX = 5;
/** For lock: dx must exceed |dy| times this (looser than before so motion starts sooner). */
const HORIZONTAL_LOCK_DOMINANCE = 1.05;
/** Cancel if user swipes meaningfully left from start. */
const LEFTWARD_CANCEL_DX = 8;
const SNAP_BACK_MS = 320;
const COMMIT_EXIT_MS = 260;
const COMMIT_NAV_DELAY_MS = 280;

const DEFAULT_EDGE_TOUCH_INSET_PX = 14;
const DEFAULT_EDGE_TOP_BELOW_SAFE_PX = 52;
const DEFAULT_EDGE_MAX_WIDTH_PX = 48;

export function defaultOverlayEdgeSwipeCommitThresholdPx(): number {
  if (typeof window === "undefined") return 108;
  return Math.max(96, Math.min(120, Math.round(window.innerWidth * 0.25)));
}

export function defaultOverlayEdgeSwipeMaxDragPx(): number {
  if (typeof window === "undefined") return 480;
  return Math.round(window.innerWidth * 0.92);
}

export type UseOverlayEdgeSwipeDismissOptions = {
  /** Overlay mounted and visible */
  active: boolean;
  /**
   * When false, the gesture is disabled (e.g. invite overlays off post-detail routes).
   * Defaults to true when omitted.
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
  /** Added to env(safe-area-inset-left) for strip width; default 14 */
  edgeTouchInsetPx?: number;
  /**
   * Extra horizontal inset (px) after `env(safe-area-inset-left)` where the strip begins.
   * Default `0`. On mobile web, `8`–`16` helps avoid the browser/OS reserved left-edge
   * “back” gesture zone so the swipe is handled by this hook instead of native navigation.
   */
  edgeStripLeftInsetPx?: number;
  /** Pixels below safe-area top where the strip starts; default 52 */
  edgeTopBelowSafeAreaPx?: number;
  /** Max total strip width; default 48 */
  edgeMaxWidthPx?: number;
  /** Tailwind z-index class for the strip; default z-[28] */
  edgeStripZClass?: string;
  /** Override commit threshold (px) or factory */
  commitThresholdPx?: number | (() => number);
  /** Override max drag (px) or factory */
  maxDragPx?: number | (() => number);
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
  /** Narrow invisible left-edge hit target — render as last child with z above scroll. */
  edgeStripProps: OverlayEdgeSwipeDismissStripProps;
  /** True while a horizontal dismiss gesture is active (after angle lock). */
  isDragging: boolean;
};

/**
 * Reusable iOS-style left-edge swipe-right to dismiss a full-screen overlay.
 *
 * - No visible handle, arrow, or affordance is rendered.
 * - A native OS/browser “back” chevron may still appear if touches start in the system’s
 *   reserved edge zone; use `edgeStripLeftInsetPx` (e.g. 8–16 on mobile web) to start the
 *   invisible strip slightly inward. Full suppression may still require Capacitor/WKWebView tuning.
 */
export function useOverlayEdgeSwipeDismiss(
  options: UseOverlayEdgeSwipeDismissOptions,
): UseOverlayEdgeSwipeDismissResult {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [translateX, setTranslateX] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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

  const engage = options.engageSwipe !== false;
  const canStartSwipe =
    options.active && engage && !options.gestureDisabled;

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

  const resetGestureState = useCallback(() => {
    draggingRef.current = false;
    gestureModeRef.current = "undecided";
    setIsDragging(false);
  }, []);

  const endPointerGesture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const mode = gestureModeRef.current;
      resetGestureState();

      if (mode === "cancelled" || mode === "undecided") {
        setTransitionMs(SNAP_BACK_MS);
        setTranslateX(0);
        return;
      }

      const t = resolveCommitThresholdPx();
      const x = translateRef.current;
      if (x >= t * 0.92) {
        const consumed = tryConsumeRef.current?.() === true;
        if (consumed) {
          setTransitionMs(SNAP_BACK_MS);
          setTranslateX(0);
          return;
        }
        const exitX = resolveMaxDragPx();
        setTransitionMs(COMMIT_EXIT_MS);
        setTranslateX(exitX);
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          onDismissRef.current();
        }, COMMIT_NAV_DELAY_MS);
        return;
      }

      setTransitionMs(SNAP_BACK_MS);
      setTranslateX(0);
    },
    [resetGestureState, resolveCommitThresholdPx, resolveMaxDragPx],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!canStartSwipe) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (commitTimerRef.current) return;

      e.preventDefault();
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
          setTranslateX(0);
          return;
        }
        if (dx < -LEFTWARD_CANCEL_DX) {
          gestureModeRef.current = "cancelled";
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
          dx > Math.abs(dy)
        ) {
          setTranslateX(Math.max(0, Math.min(dx, cap)));
          return;
        }

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
  const edgeStripLeftInsetPx = options.edgeStripLeftInsetPx ?? 0;
  const zClass = options.edgeStripZClass ?? "z-[28]";

  const overlayMotionStyle: CSSProperties = {
    transform: `translate3d(${translateX}px,0,0)`,
    transition:
      transitionMs > 0
        ? `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.32, 1)`
        : "none",
    willChange: translateX !== 0 ? "transform" : undefined,
    /** Scoped: reduce horizontal overscroll chaining without global CSS. */
    overscrollBehaviorX: "none",
  };

  const edgeStripProps: OverlayEdgeSwipeDismissStripProps = {
    className: [
      "pointer-events-auto select-none outline-none absolute bottom-0",
      "bg-transparent",
      zClass,
    ].join(" "),
    style: {
      left: `calc(env(safe-area-inset-left, 0px) + ${edgeStripLeftInsetPx}px)`,
      top: `calc(env(safe-area-inset-top, 0px) + ${topPad}px)`,
      width: `min(calc(${inset}px + env(safe-area-inset-left, 0px)), ${maxW}px)`,
      /** `none` keeps WebViews/browsers from claiming horizontal pans before our listeners. */
      touchAction: "none",
      WebkitTapHighlightColor: "transparent",
    },
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointerGesture,
    onPointerCancel: endPointerGesture,
    onLostPointerCapture: endPointerGesture,
    "aria-hidden": true,
  };

  return { overlayMotionStyle, edgeStripProps, isDragging };
}
