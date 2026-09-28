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
  decideContentSwipeTerminal,
  writeOverlayTranslateRef,
  type OverlaySwipeTerminalKind,
} from "./overlaySwipeTerminal";
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
/** Committed content-swipe exit transform duration (ms). */
export const OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS = 260;
const COMMIT_EXIT_MS = OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS;
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

  // Explicit exclusions win over allowButtonTargets (e.g. Leave Group).
  if (excludeSelector !== undefined) {
    const selector = excludeSelector.trim();
    if (selector && target.closest(selector)) {
      return { excluded: true, reason: "excludeSelectorMatch" };
    }
  }

  if (allowButtonTargets) {
    if (target.closest("button") || target.closest('[role="button"]')) {
      return { excluded: false, reason: "allowButtonTarget" };
    }
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
  /**
   * When this identity changes (e.g. conversationId), reset swipe visual state and
   * disarm click suppression so a dismissed overlay cannot eat inbox taps.
   */
  resetToken?: string | number | null;
  /** DEV diagnostics only. Must not affect gesture arbitration. */
  onDebugEvent?: (stage: string, data?: Record<string, unknown>) => void;
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
  const suppressDisarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const firstMoveLoggedRef = useRef(false);
  const captureTargetRef = useRef<Element | null>(null);
  const snapBackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Live translate. Updated with setState so a terminal read is not one frame late. */
  const translateXRef = useRef(0);
  const visualActiveRef = useRef(false);
  /** First terminal event wins. Re-entry from our own releasePointerCapture is ignored. */
  const terminalClaimedRef = useRef(false);
  const committedRef = useRef(false);
  const releasingCaptureRef = useRef(false);

  const onSwipeCommitRef = useRef(options.onSwipeCommit);
  onSwipeCommitRef.current = options.onSwipeCommit;

  const emitDebug = useCallback(
    (stage: string, data?: Record<string, unknown>) => {
      optsRef.current.onDebugEvent?.(stage, data);
    },
    [],
  );

  const clearSuppressDisarmTimer = useCallback(() => {
    if (suppressDisarmTimerRef.current) {
      clearTimeout(suppressDisarmTimerRef.current);
      suppressDisarmTimerRef.current = null;
    }
  }, []);

  const armSameGestureClickSuppress = useCallback(() => {
    suppressNextClickRef.current = true;
    clearSuppressDisarmTimer();
    // Fallback: never leave suppression armed across a later inbox tap.
    suppressDisarmTimerRef.current = setTimeout(() => {
      suppressDisarmTimerRef.current = null;
      suppressNextClickRef.current = false;
    }, 450);
  }, [clearSuppressDisarmTimer]);

  const disarmClickSuppress = useCallback(() => {
    suppressNextClickRef.current = false;
    clearSuppressDisarmTimer();
  }, [clearSuppressDisarmTimer]);

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
      disarmClickSuppress();
    };
    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      disarmClickSuppress();
    };
  }, [disarmClickSuppress]);

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
    if (!el || pointerId == null) return;
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clearCaptureTarget = useCallback(() => {
    captureTargetRef.current = null;
  }, []);

  /** Deferred until horizontal dismiss lock — keeps undecided vertical scroll native. */
  const acquirePointerCapture = useCallback((pointerId: number | null) => {
    const el = captureTargetRef.current;
    if (!el || pointerId == null) return;
    try {
      if (!el.hasPointerCapture(pointerId)) {
        el.setPointerCapture(pointerId);
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

  const publishTranslate = useCallback((next: number, visualActive: boolean) => {
    writeOverlayTranslateRef(translateXRef, next);
    visualActiveRef.current = visualActive;
    setTranslateX(next);
    setIsContentSwipeVisualActive(visualActive);
  }, []);

  const resetVisualState = useCallback(() => {
    clearSnapBackTimer();
    terminalClaimedRef.current = false;
    committedRef.current = false;
    publishTranslate(0, false);
    setTransitionMs(0);
    setIsDragging(false);
  }, [clearSnapBackTimer, publishTranslate]);

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

  const applyDragTranslate = useCallback(
    (dx: number) => {
      const x = clampContentDragDx(dx);
      setTransitionMs(0);
      publishTranslate(x, x > 0 || visualActiveRef.current);
    },
    [publishTranslate],
  );

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
    publishTranslate(0, true);
    snapBackTimerRef.current = setTimeout(() => {
      snapBackTimerRef.current = null;
      visualActiveRef.current = false;
      setIsContentSwipeVisualActive(false);
      setTransitionMs(0);
    }, SNAP_BACK_MS);
  }, [clearSnapBackTimer, publishTranslate]);

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
      kind: OverlaySwipeTerminalKind = "up",
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
      const visualActive =
        visualActiveRef.current || translateXRef.current > 0;
      const decision = decideContentSwipeTerminal({
        alreadyClaimed: terminalClaimedRef.current,
        alreadyCommitted: committedRef.current,
        mode,
        kind,
        releaseDx,
        commitThresholdPx,
        visualActive,
      });
      if (decision === "ignore") return;

      terminalClaimedRef.current = true;
      releasingCaptureRef.current = true;
      releasePointerCapture(pointerId);
      releasingCaptureRef.current = false;
      clearWindowListeners();
      clearCaptureTarget();
      resetGestureTracking();

      if (decision === "commit") {
        committedRef.current = true;
        armSameGestureClickSuppress();
        clearSnapBackTimer();
        setIsDragging(false);
        setTransitionMs(COMMIT_EXIT_MS);
        publishTranslate(defaultOverlayEdgeSwipeExitTranslatePx(), true);
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
        emitDebug("commit", {
          releaseDx: Math.round(releaseDx),
          commitThresholdPx,
          dy: Math.round(dy),
        });
        onSwipeCommitRef.current();
        return;
      }

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

      if (decision === "snap") {
        if (mode === "horizontal" && releaseDx >= horizontalLockPx) {
          armSameGestureClickSuppress();
        }
        emitDebug(kind === "interrupt" ? "cancel" : "snapback", {
          mode,
          releaseDx: Math.round(releaseDx),
          commitThresholdPx,
          dy: Math.round(dy),
          visualActive,
        });
        snapBackVisual();
      }
      // Ownership is already clear. A later pointerup must not be treated as a new decision
      // until the next pointerdown; trackingRef is false, and this claim drops so the next
      // gesture can start. Re-entry during releasePointerCapture already returned above.
      terminalClaimedRef.current = false;
    },
    [
      armSameGestureClickSuppress,
      clearCaptureTarget,
      clearSnapBackTimer,
      clearWindowListeners,
      devLogRelease,
      emitDebug,
      publishTranslate,
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
      emitDebug("move", {
        dx: Math.round(dx),
        dy: Math.round(dy),
        mode,
        cancelable: e.cancelable,
        pointerType: e.pointerType,
      });

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
          emitDebug("cancel", { reason: "left", dx: Math.round(dx), dy: Math.round(dy) });
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
          acquirePointerCapture(pointerIdRef.current);
          applyDragTranslate(clampedDx);
          if (shouldLogCreateSwipe()) {
            console.info("create-swipe:lock", { dx, dy, mode: "horizontal" });
          }
          emitDebug("lock", {
            dx: Math.round(dx),
            dy: Math.round(dy),
            preventDefault: e.cancelable,
            translateX: Math.round(clampedDx),
          });
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
          emitDebug("cancel", {
            reason: "vertical",
            dx: Math.round(dx),
            dy: Math.round(dy),
          });
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
    [
      acquirePointerCapture,
      applyDragTranslate,
      emitDebug,
      finishGesture,
      resolveHorizontalLockPx,
      syncCurrentDragDx,
    ],
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
      const kind: OverlaySwipeTerminalKind =
        e.type === "pointercancel" ? "interrupt" : "up";
      emitDebug(kind === "interrupt" ? "pointercancel" : "pointerup", {
        mode,
        releaseDx: Math.round(releaseDx),
        dy: Math.round(lastDyRef.current),
        type: e.type,
      });
      finishGesture(mode, releaseDx, kind);
    },
    [emitDebug, finishGesture],
  );

  const onLostPointerCapture = useCallback(
    (e: PointerEvent) => {
      if (releasingCaptureRef.current) return;
      if (!trackingRef.current || pointerIdRef.current !== e.pointerId) return;
      finishGesture(
        gestureModeRef.current,
        currentDxRef.current,
        "interrupt",
      );
    },
    [finishGesture],
  );

  const onTouchCancel = useCallback(() => {
    if (!trackingRef.current) return;
    finishGesture(gestureModeRef.current, currentDxRef.current, "interrupt");
  }, [finishGesture]);

  const attachWindowListeners = useCallback(() => {
    clearWindowListeners();
    window.addEventListener("pointermove", onWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    window.addEventListener("lostpointercapture", onLostPointerCapture, true);
    window.addEventListener("touchcancel", onTouchCancel, true);
    removeWindowListenersRef.current = () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      window.removeEventListener(
        "lostpointercapture",
        onLostPointerCapture,
        true,
      );
      window.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, [
    clearWindowListeners,
    onLostPointerCapture,
    onTouchCancel,
    onWindowPointerEnd,
    onWindowPointerMove,
  ]);

  useEffect(() => {
    if (!options.active) {
      releasePointerCapture(pointerIdRef.current);
      clearCaptureTarget();
      clearWindowListeners();
      resetGestureTracking();
      resetVisualState();
      disarmClickSuppress();
    }
  }, [
    options.active,
    clearCaptureTarget,
    clearWindowListeners,
    disarmClickSuppress,
    releasePointerCapture,
    resetGestureTracking,
    resetVisualState,
  ]);

  useEffect(() => {
    releasePointerCapture(pointerIdRef.current);
    clearCaptureTarget();
    clearWindowListeners();
    resetGestureTracking();
    resetVisualState();
    disarmClickSuppress();
    // Intentionally only when conversation/reset identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToken gate
  }, [options.resetToken]);

  useEffect(() => {
    return () => {
      if (trackingRef.current && !committedRef.current) {
        terminalClaimedRef.current = true;
        releasingCaptureRef.current = true;
        releasePointerCapture(pointerIdRef.current);
        releasingCaptureRef.current = false;
      }
      trackingRef.current = false;
      pointerIdRef.current = null;
      gestureModeRef.current = "undecided";
      clearWindowListeners();
      clearSnapBackTimer();
      clearSuppressDisarmTimer();
      suppressNextClickRef.current = false;
    };
  }, [
    clearSnapBackTimer,
    clearSuppressDisarmTimer,
    clearWindowListeners,
    releasePointerCapture,
  ]);

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const devTarget = e.target instanceof Element ? e.target : null;
      if (shouldLogCreateSwipe()) {
        devLogCapture(e, devTarget);
      }

      const o = optsRef.current;
      const maxX = resolveStartZoneMaxClientX(
        o.startZoneMaxXVw ?? DEFAULT_START_ZONE_MAX_VW,
        o.startZoneMaxPx ?? DEFAULT_START_ZONE_MAX_PX,
        o.leftInsetPx ?? DEFAULT_LEFT_INSET_PX,
      );
      const exclusion = resolveSwipeTargetExclusion(
        e.target,
        o.excludeSelector,
        o.allowButtonTargets === true,
      );
      emitDebug("pointerdown", {
        pointerType: e.pointerType,
        button: e.button,
        clientX: Math.round(e.clientX),
        clientY: Math.round(e.clientY),
        targetTag: devTarget?.tagName ?? null,
        canStartSwipe,
        excluded: exclusion.excluded,
        excludeReason: exclusion.reason,
        inZone: e.clientX <= maxX,
        startZoneMaxX: Math.round(maxX),
      });

      if (!canStartSwipe) {
        emitDebug("skip", { reason: "inactive" });
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) {
        emitDebug("skip", { reason: "nonPrimaryMouse" });
        return;
      }
      if (committedRef.current) {
        emitDebug("skip", { reason: "committed" });
        return;
      }
      if (trackingRef.current) {
        emitDebug("skip", { reason: "alreadyTracking" });
        return;
      }

      if (shouldLogCreateSwipe()) {
        devLogExcluded(exclusion);
      }
      if (exclusion.excluded) {
        emitDebug("skip", {
          reason: "excluded",
          excludeReason: exclusion.reason,
          targetTag: devTarget?.tagName ?? null,
        });
        return;
      }

      if (shouldLogCreateSwipe()) {
        devLogZone(e, maxX);
      }
      if (e.clientX > maxX) {
        emitDebug("skip", {
          reason: "startZone",
          clientX: Math.round(e.clientX),
          startZoneMaxX: Math.round(maxX),
        });
        return;
      }

      clearSnapBackTimer();
      terminalClaimedRef.current = false;
      trackingRef.current = true;
      pointerIdRef.current = e.pointerId;
      gestureModeRef.current = "undecided";
      startClientXRef.current = e.clientX;
      startClientYRef.current = e.clientY;
      currentDxRef.current = 0;
      maxDxRef.current = 0;
      lastDyRef.current = 0;
      firstMoveLoggedRef.current = false;

      captureTargetRef.current =
        e.target instanceof Element ? e.target : e.currentTarget;

      attachWindowListeners();

      if (shouldLogCreateSwipe()) {
        console.info("create-swipe:trackStart", { pointerId: e.pointerId });
      }
      emitDebug("trackStart", {
        pointerType: e.pointerType,
        clientX: Math.round(e.clientX),
        clientY: Math.round(e.clientY),
        targetTag: devTarget?.tagName ?? null,
      });
    },
    [attachWindowListeners, canStartSwipe, clearSnapBackTimer, emitDebug],
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
