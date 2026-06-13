import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from "react";
import {
  defaultOverlayEdgeSwipeCommitThresholdPx,
  defaultOverlayEdgeSwipeExitTranslatePx,
  defaultOverlayEdgeSwipeMaxDragPx,
} from "./useOverlayEdgeSwipeDismiss";

/** Cancel only after this much vertical movement (forgiving touch jitter). */
const VERTICAL_SLOP_PX = 20;
/** Vertical must exceed horizontal by this ratio to cancel (before horizontal lock). */
const VERTICAL_DOMINANCE_OVER_DX = 1.5;
/** Lock to horizontal tracking once dx reaches this and leads vertical motion. */
const CONTENT_HORIZONTAL_LOCK_MIN_DX = 7;
/** For lock: dx must exceed |dy| times this. */
const HORIZONTAL_LOCK_DOMINANCE = 1.0;
/** Cancel if user swipes meaningfully left from start. */
const LEFTWARD_CANCEL_DX = 8;
/** Release past this fraction of commit threshold to dismiss. */
const COMMIT_THRESHOLD_RATIO = 0.87;

const SNAP_BACK_MS = 320;
const COMMIT_EXIT_MS = 260;
const POLISH_START_THRESHOLD_FRACTION = 0.35;
const POLISH_SCALE_MIN = 0.985;
const MOTION_EASING = "cubic-bezier(0.22, 1, 0.32, 1)";

const DEFAULT_START_ZONE_MAX_VW = 0.45;
const DEFAULT_START_ZONE_MAX_PX = 180;
const DEFAULT_LEFT_INSET_PX = 12;

const CREATE_SWIPE_DEBUG_STORAGE_KEY = "debug_create_swipe";

const isCreateSwipeDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CREATE_SWIPE_DEBUG_STORAGE_KEY) === "1";
};

function shouldLogCreateSwipe(): boolean {
  return import.meta.env.DEV || isCreateSwipeDebugEnabled();
}

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

function clampContentDragDx(dx: number): number {
  const cap = defaultOverlayEdgeSwipeMaxDragPx();
  return Math.max(0, Math.min(dx, cap));
}

type SwipeTargetExclusionReason =
  | "allowButtonTarget"
  | "excludeSelectorMatch"
  | "none";

function resolveSwipeTargetExclusion(
  target: EventTarget | null,
  excludeSelector: string | undefined,
  allowButtonTargets: boolean,
): { excluded: boolean; reason: SwipeTargetExclusionReason } {
  if (!(target instanceof Element)) {
    return { excluded: false, reason: "none" };
  }

  if (allowButtonTargets) {
    if (target.closest("button") || target.closest('[role="button"]')) {
      return { excluded: false, reason: "allowButtonTarget" };
    }
  }

  if (excludeSelector === undefined) {
    return { excluded: false, reason: "none" };
  }
  const selector = excludeSelector.trim();
  if (!selector) {
    return { excluded: false, reason: "none" };
  }
  if (target.closest(selector)) {
    return { excluded: true, reason: "excludeSelectorMatch" };
  }
  return { excluded: false, reason: "none" };
}

function resolveStartZoneMaxClientX(
  startZoneMaxXVw: number,
  startZoneMaxPx: number,
  leftInsetPx: number,
): number {
  if (typeof window === "undefined") {
    return leftInsetPx + startZoneMaxPx;
  }
  return (
    leftInsetPx + Math.min(window.innerWidth * startZoneMaxXVw, startZoneMaxPx)
  );
}

function devShortClassName(el: Element): string {
  const c = el.className;
  if (typeof c === "string") return c.slice(0, 80);
  return String(c).slice(0, 80);
}

function devShortText(el: Element): string | undefined {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, 40);
}

function devLogCapture(
  e: ReactPointerEvent<HTMLElement>,
  target: Element | null,
): void {
  console.info("create-swipe:capture", {
    tagName: target?.tagName ?? null,
    className: target ? devShortClassName(target) : null,
    textContent: target ? devShortText(target) : null,
    clientX: e.clientX,
    clientY: e.clientY,
    pointerType: e.pointerType,
  });
}

function devLogExcluded(exclusion: {
  excluded: boolean;
  reason: SwipeTargetExclusionReason;
}): void {
  console.info("create-swipe:excluded", {
    excluded: exclusion.excluded,
    reason: exclusion.reason,
  });
}

function devLogZone(
  e: ReactPointerEvent<HTMLElement>,
  maxX: number,
): void {
  const inZone = e.clientX <= maxX;
  const panelRect = e.currentTarget.getBoundingClientRect();
  const panelRelativeX = e.clientX - panelRect.left;
  const panelZoneMaxX = panelRect.left + panelRect.width * 0.45;

  console.info("create-swipe:zone", {
    clientX: e.clientX,
    maxX,
    inZone,
    deltaOver: inZone ? 0 : e.clientX - maxX,
    viewportWidth:
      typeof window !== "undefined" ? window.innerWidth : null,
    panelRectLeft: panelRect.left,
    panelRectWidth: panelRect.width,
    panelRelativeX,
    panelZoneMaxX,
  });
}

export type UseOverlayContentSwipeDismissOptions = {
  active: boolean;
  engageSwipe?: boolean;
  gestureDisabled?: boolean;
  startZoneMaxXVw?: number;
  startZoneMaxPx?: number;
  leftInsetPx?: number;
  /** Skip tracking when pointer down starts on a matching element (default skips buttons and form controls). */
  excludeSelector?: string;
  /** When true, never exclude `button` / `[role="button"]` even if present in `excludeSelector`. */
  allowButtonTargets?: boolean;
  /** Content-only commit distance (px). Default: edge threshold × {@link COMMIT_THRESHOLD_RATIO}. */
  commitThresholdPx?: number;
  /** Horizontal drag (px) before locking to swipe tracking. Default: {@link CONTENT_HORIZONTAL_LOCK_MIN_DX}. */
  horizontalLockPx?: number;
  /** Invoked when a horizontal panel swipe passes commit distance (e.g. edge `playAnimatedDismiss`). */
  onSwipeCommit: () => void;
};

export type UseOverlayContentSwipeDismissResult = {
  panelSwipeProps: {
    onPointerDownCapture: PointerEventHandler<HTMLElement>;
  };
  contentSwipeMotionStyle: CSSProperties | undefined;
  isContentSwipeVisualActive: boolean;
};

/**
 * Panel horizontal swipe-right with live drag preview. On commit, animates out
 * then calls {@link UseOverlayContentSwipeDismissOptions.onSwipeCommit}.
 */
export function useOverlayContentSwipeDismiss(
  options: UseOverlayContentSwipeDismissOptions,
): UseOverlayContentSwipeDismissResult {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [translateX, setTranslateX] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isContentSwipeVisualActive, setIsContentSwipeVisualActive] =
    useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const trackingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const gestureModeRef = useRef<"undecided" | "horizontal" | "cancelled">(
    "undecided",
  );
  const startClientXRef = useRef(0);
  const startClientYRef = useRef(0);
  const currentDxRef = useRef(0);
  const maxDxRef = useRef(0);
  const lastDyRef = useRef(0);
  const suppressNextClickRef = useRef(false);
  const firstMoveLoggedRef = useRef(false);
  const captureTargetRef = useRef<Element | null>(null);
  const snapBackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSwipeCommitRef = useRef(options.onSwipeCommit);
  onSwipeCommitRef.current = options.onSwipeCommit;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = false;
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  const engage = options.engageSwipe !== false;
  const canStartSwipe =
    options.active && engage && !options.gestureDisabled;

  const removeWindowListenersRef = useRef<(() => void) | null>(null);

  const clearWindowListeners = useCallback(() => {
    removeWindowListenersRef.current?.();
    removeWindowListenersRef.current = null;
  }, []);

  const clearSnapBackTimer = useCallback(() => {
    if (snapBackTimerRef.current) {
      clearTimeout(snapBackTimerRef.current);
      snapBackTimerRef.current = null;
    }
  }, []);

  const releasePointerCapture = useCallback((pointerId: number | null) => {
    const el = captureTargetRef.current;
    captureTargetRef.current = null;
    if (!el || pointerId == null) return;
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const resetGestureTracking = useCallback(() => {
    trackingRef.current = false;
    pointerIdRef.current = null;
    gestureModeRef.current = "undecided";
    currentDxRef.current = 0;
    maxDxRef.current = 0;
    lastDyRef.current = 0;
    firstMoveLoggedRef.current = false;
    setIsDragging(false);
  }, []);

  const resetVisualState = useCallback(() => {
    clearSnapBackTimer();
    setTranslateX(0);
    setTransitionMs(0);
    setIsDragging(false);
    setIsContentSwipeVisualActive(false);
  }, [clearSnapBackTimer]);

  const resolveContentCommitThresholdPx = useCallback(() => {
    const o = optsRef.current;
    if (typeof o.commitThresholdPx === "number") {
      return o.commitThresholdPx;
    }
    return (
      defaultOverlayEdgeSwipeCommitThresholdPx() * COMMIT_THRESHOLD_RATIO
    );
  }, []);

  const resolveHorizontalLockPx = useCallback(() => {
    const o = optsRef.current;
    if (typeof o.horizontalLockPx === "number") {
      return o.horizontalLockPx;
    }
    return CONTENT_HORIZONTAL_LOCK_MIN_DX;
  }, []);

  const applyDragTranslate = useCallback((dx: number) => {
    const x = clampContentDragDx(dx);
    setTransitionMs(0);
    setTranslateX(x);
    if (x > 0) {
      setIsContentSwipeVisualActive(true);
    }
  }, []);

  const syncCurrentDragDx = useCallback((rawDx: number) => {
    const clamped = clampContentDragDx(rawDx);
    currentDxRef.current = clamped;
    maxDxRef.current = Math.max(maxDxRef.current, clamped);
    return clamped;
  }, []);

  const snapBackVisual = useCallback(() => {
    clearSnapBackTimer();
    setIsDragging(false);
    setTransitionMs(SNAP_BACK_MS);
    setTranslateX(0);
    setIsContentSwipeVisualActive(true);
    snapBackTimerRef.current = setTimeout(() => {
      snapBackTimerRef.current = null;
      setIsContentSwipeVisualActive(false);
      setTransitionMs(0);
    }, SNAP_BACK_MS);
  }, [clearSnapBackTimer]);

  const devLogRelease = useCallback(
    (
      mode: "undecided" | "horizontal" | "cancelled",
      releaseDx: number,
      currentDx: number,
      maxDx: number,
      dy: number,
      committed: boolean,
      commitThresholdPx: number,
      visualActive: boolean,
    ) => {
      if (!shouldLogCreateSwipe()) return;
      console.info("create-swipe:release", {
        releaseDx,
        currentDx,
        maxDx,
        dy,
        mode,
        committed,
        commitThresholdPx,
        visualActive,
      });
    },
    [],
  );

  const finishGesture = useCallback(
    (
      mode: "undecided" | "horizontal" | "cancelled",
      releaseDxOverride?: number,
    ) => {
      const releaseDx =
        releaseDxOverride !== undefined
          ? clampContentDragDx(releaseDxOverride)
          : currentDxRef.current;
      const currentDx = currentDxRef.current;
      const maxDx = maxDxRef.current;
      const dy = lastDyRef.current;
      const pointerId = pointerIdRef.current;
      const commitThresholdPx = resolveContentCommitThresholdPx();
      const horizontalLockPx = resolveHorizontalLockPx();
      const visualActive = isContentSwipeVisualActive;

      clearWindowListeners();
      releasePointerCapture(pointerId);
      resetGestureTracking();

      if (mode !== "horizontal") {
        devLogRelease(
          mode,
          releaseDx,
          currentDx,
          maxDx,
          dy,
          false,
          commitThresholdPx,
          visualActive,
        );
        if (visualActive) {
          snapBackVisual();
        }
        return;
      }

      const committed = releaseDx >= commitThresholdPx;

      if (committed) {
        suppressNextClickRef.current = true;
        clearSnapBackTimer();
        setIsDragging(false);
        setTransitionMs(COMMIT_EXIT_MS);
        setTranslateX(defaultOverlayEdgeSwipeExitTranslatePx());
        setIsContentSwipeVisualActive(true);
        devLogRelease(
          "horizontal",
          releaseDx,
          currentDx,
          maxDx,
          dy,
          true,
          commitThresholdPx,
          true,
        );
        onSwipeCommitRef.current();
        return;
      }

      devLogRelease(
        "horizontal",
        releaseDx,
        currentDx,
        maxDx,
        dy,
        false,
        commitThresholdPx,
        visualActive,
      );

      if (releaseDx >= horizontalLockPx) {
        suppressNextClickRef.current = true;
        snapBackVisual();
        return;
      }

      if (releaseDx > 0 || visualActive) {
        snapBackVisual();
      }
    },
    [
      clearSnapBackTimer,
      clearWindowListeners,
      devLogRelease,
      isContentSwipeVisualActive,
      releasePointerCapture,
      resetGestureTracking,
      resolveContentCommitThresholdPx,
      resolveHorizontalLockPx,
      snapBackVisual,
    ],
  );

  const onWindowPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!trackingRef.current || pointerIdRef.current !== e.pointerId) return;

      const dx = e.clientX - startClientXRef.current;
      const dy = e.clientY - startClientYRef.current;
      lastDyRef.current = dy;
      const mode = gestureModeRef.current;

      if (shouldLogCreateSwipe() && !firstMoveLoggedRef.current) {
        firstMoveLoggedRef.current = true;
        console.info("create-swipe:firstMove", { dx, dy });
      }

      if (mode === "cancelled") return;

      if (mode === "undecided") {
        const horizontalLockPx = resolveHorizontalLockPx();

        if (dx < -LEFTWARD_CANCEL_DX) {
          gestureModeRef.current = "cancelled";
          if (shouldLogCreateSwipe()) {
            console.info("create-swipe:cancel", {
              reason: "left",
              dx,
              dy,
              mode: "cancelled",
            });
          }
          finishGesture("cancelled");
          return;
        }

        if (
          dx >= horizontalLockPx &&
          dx > Math.abs(dy) * HORIZONTAL_LOCK_DOMINANCE
        ) {
          gestureModeRef.current = "horizontal";
          const clampedDx = syncCurrentDragDx(dx);
          setIsDragging(true);
          applyDragTranslate(clampedDx);
          if (shouldLogCreateSwipe()) {
            console.info("create-swipe:lock", { dx, dy, mode: "horizontal" });
          }
          if (e.cancelable) e.preventDefault();
          return;
        }

        if (
          Math.abs(dy) > VERTICAL_SLOP_PX &&
          Math.abs(dy) >= Math.abs(dx) * VERTICAL_DOMINANCE_OVER_DX &&
          dx < horizontalLockPx
        ) {
          gestureModeRef.current = "cancelled";
          if (shouldLogCreateSwipe()) {
            console.info("create-swipe:cancel", {
              reason: "vertical",
              dx,
              dy,
              mode: "cancelled",
            });
          }
          finishGesture("cancelled");
          return;
        }

        return;
      }

      if (gestureModeRef.current !== "horizontal") return;
      const clampedDx = syncCurrentDragDx(dx);
      applyDragTranslate(clampedDx);
      if (e.cancelable) e.preventDefault();
    },
    [applyDragTranslate, finishGesture, resolveHorizontalLockPx, syncCurrentDragDx],
  );

  const onWindowPointerEnd = useCallback(
    (e: PointerEvent) => {
      if (!trackingRef.current || pointerIdRef.current !== e.pointerId) return;
      const mode = gestureModeRef.current;
      lastDyRef.current = e.clientY - startClientYRef.current;
      const releaseDx =
        mode === "horizontal"
          ? clampContentDragDx(e.clientX - startClientXRef.current)
          : currentDxRef.current;
      if (mode === "horizontal") {
        currentDxRef.current = releaseDx;
        maxDxRef.current = Math.max(maxDxRef.current, releaseDx);
      }
      finishGesture(mode, releaseDx);
    },
    [finishGesture],
  );

  const attachWindowListeners = useCallback(() => {
    clearWindowListeners();
    window.addEventListener("pointermove", onWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    removeWindowListenersRef.current = () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
    };
  }, [clearWindowListeners, onWindowPointerEnd, onWindowPointerMove]);

  useEffect(() => {
    if (!options.active) {
      releasePointerCapture(pointerIdRef.current);
      clearWindowListeners();
      resetGestureTracking();
      resetVisualState();
      suppressNextClickRef.current = false;
    }
  }, [
    options.active,
    clearWindowListeners,
    releasePointerCapture,
    resetGestureTracking,
    resetVisualState,
  ]);

  useEffect(() => {
    return () => {
      clearWindowListeners();
      clearSnapBackTimer();
    };
  }, [clearSnapBackTimer, clearWindowListeners]);

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const devTarget = e.target instanceof Element ? e.target : null;
      if (shouldLogCreateSwipe()) {
        devLogCapture(e, devTarget);
      }

      if (!canStartSwipe) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (trackingRef.current) return;

      const o = optsRef.current;
      const exclusion = resolveSwipeTargetExclusion(
        e.target,
        o.excludeSelector,
        o.allowButtonTargets === true,
      );
      if (shouldLogCreateSwipe()) {
        devLogExcluded(exclusion);
      }
      if (exclusion.excluded) return;

      const maxX = resolveStartZoneMaxClientX(
        o.startZoneMaxXVw ?? DEFAULT_START_ZONE_MAX_VW,
        o.startZoneMaxPx ?? DEFAULT_START_ZONE_MAX_PX,
        o.leftInsetPx ?? DEFAULT_LEFT_INSET_PX,
      );
      if (shouldLogCreateSwipe()) {
        devLogZone(e, maxX);
      }
      if (e.clientX > maxX) return;

      trackingRef.current = true;
      pointerIdRef.current = e.pointerId;
      gestureModeRef.current = "undecided";
      startClientXRef.current = e.clientX;
      startClientYRef.current = e.clientY;
      currentDxRef.current = 0;
      maxDxRef.current = 0;
      lastDyRef.current = 0;
      firstMoveLoggedRef.current = false;

      const captureEl =
        e.target instanceof Element ? e.target : e.currentTarget;
      captureTargetRef.current = captureEl;
      try {
        captureEl.setPointerCapture?.(e.pointerId);
      } catch {
        captureTargetRef.current = null;
      }

      attachWindowListeners();

      if (shouldLogCreateSwipe()) {
        console.info("create-swipe:trackStart", { pointerId: e.pointerId });
      }
    },
    [attachWindowListeners, canStartSwipe],
  );

  const commitThresholdPx = resolveContentCommitThresholdPx();
  const scaleProgress = dragDismissScaleProgress(translateX, commitThresholdPx);
  const polishScale = computePolishScale(scaleProgress, reduceMotion);

  const contentSwipeMotionStyle = useMemo((): CSSProperties | undefined => {
    if (!isContentSwipeVisualActive) return undefined;
    const transitionTransform =
      transitionMs > 0
        ? `transform ${transitionMs}ms ${MOTION_EASING}`
        : "none";
    return {
      transform: `translate3d(${translateX}px,0,0) scale(${polishScale})`,
      transition: transitionTransform,
      willChange:
        translateX !== 0 || isDragging || transitionMs > 0
          ? "transform"
          : undefined,
      overscrollBehaviorX: "none",
    };
  }, [
    isContentSwipeVisualActive,
    isDragging,
    polishScale,
    translateX,
    transitionMs,
  ]);

  return {
    panelSwipeProps: { onPointerDownCapture },
    contentSwipeMotionStyle,
    isContentSwipeVisualActive,
  };
}
