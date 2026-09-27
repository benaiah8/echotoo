/**
 * Published video surface gestures (PV3.8.7+).
 * Reveal-first when chrome hidden; Play/Pause toggle when chrome visible.
 * Hold-anywhere 2×; swipe → Swiper. No double-tap seek.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  VIDEO_LONG_PRESS_MS,
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SLIDE_GESTURE_THRESHOLD_PX,
  classifyHeroPointerGesture,
  getVideoTapZone,
  shouldCommitVideoTapGestures,
  type HeroPointerGestureKind,
  type VideoTapZone,
} from "../createFinalizeVideoGestures";
import { logPublishedVideoState } from "./publishedVideoStateLog";
import { shouldSuppressPublishedVideoSurfaceTap } from "./publishedFullscreenGestures";

/** Mobile-friendly hold cancel (Create keeps 6px; Published uses slide threshold). */
export const PUBLISHED_HOLD_CANCEL_PX = VIDEO_SLIDE_GESTURE_THRESHOLD_PX; // 10

export type PublishedVideoGestureFlash = "play" | "pause" | "speed" | null;

type GestureState = {
  kind: HeroPointerGestureKind;
  pointerId: number;
  startX: number;
  startY: number;
  resolved: boolean;
  holdArmed: boolean;
};

const CONTROL_SELECTOR =
  "[data-video-control],[data-video-scrubber],[data-swiper-no-swipe]";

function pathHitsControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(CONTROL_SELECTOR));
}

function compactComposedPath(e: { nativeEvent?: Event } | Event): string {
  try {
    const ne = "nativeEvent" in e && e.nativeEvent ? e.nativeEvent : (e as Event);
    const path =
      typeof (ne as PointerEvent).composedPath === "function"
        ? (ne as PointerEvent).composedPath()
        : [];
    return path
      .slice(0, 8)
      .map((n) => {
        if (!(n instanceof Element)) return n?.constructor?.name ?? "?";
        const id = n.id ? `#${n.id}` : "";
        const cls =
          typeof n.className === "string" && n.className
            ? `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}`
            : "";
        return `${n.tagName.toLowerCase()}${id}${cls}`;
      })
      .join(">");
  } catch {
    return "";
  }
}

function targetLabel(t: EventTarget | null): string {
  if (!(t instanceof Element)) return String(t);
  const cls =
    typeof t.className === "string" && t.className
      ? `.${t.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
  return `${t.tagName.toLowerCase()}${cls}`;
}

export type UsePublishedVideoSurfaceGesturesOptions = {
  enabled: boolean;
  mediaKey: string;
  getVideoEl: () => HTMLVideoElement | null;
  getMeta?: () => {
    isActive?: boolean;
    isWarm?: boolean;
    ownsPlayback?: boolean;
    chromeVisible?: boolean;
  };
  onRequestManualPlay: () => void;
  onRequestManualPause: () => void;
  /** Soft visual chrome only — must not enable hit-testing. */
  onRevealChrome: () => void;
  /** Disable interactive chrome hit-testing for the pointer session. */
  onSurfaceGestureStart?: () => void;
  onSurfaceGestureEnd?: () => void;
  setFlash: (flash: PublishedVideoGestureFlash) => void;
};

export function usePublishedVideoSurfaceGestures(
  options: UsePublishedVideoSurfaceGesturesOptions,
) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const gestureRef = useRef<GestureState | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressActiveRef = useRef(false);
  const docListenersRef = useRef<(() => void) | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const surfaceElRef = useRef<HTMLElement | null>(null);

  const log = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      const o = optsRef.current;
      const video = o.getVideoEl();
      const meta = o.getMeta?.() ?? {};
      const g = gestureRef.current;
      logPublishedVideoState(event, {
        mediaKey: o.mediaKey,
        gestureEnabled: o.enabled,
        videoPaused: video?.paused,
        readyState: video?.readyState,
        playbackRate: video?.playbackRate,
        isActive: meta.isActive,
        isWarm: meta.isWarm,
        ownsPlayback: meta.ownsPlayback,
        chromeVisible: meta.chromeVisible,
        holdArmed: Boolean(g?.holdArmed && !longPressActiveRef.current),
        holdActive: longPressActiveRef.current,
        ...extra,
      });
    },
    [],
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (gestureRef.current) gestureRef.current.holdArmed = false;
  }, []);

  const detachDocPointerListeners = useCallback(() => {
    docListenersRef.current?.();
    docListenersRef.current = null;
  }, []);

  const resetPlaybackRate = useCallback(() => {
    const el = optsRef.current.getVideoEl();
    if (el && el.playbackRate !== 1) {
      try {
        el.playbackRate = 1;
      } catch {
        /* ignore */
      }
    }
    longPressActiveRef.current = false;
  }, []);

  const showFlash = useCallback(
    (kind: Exclude<PublishedVideoGestureFlash, null>) => {
      optsRef.current.setFlash(kind);
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => {
        optsRef.current.setFlash(null);
        flashTimerRef.current = null;
      }, 450);
    },
    [],
  );

  const endSurfaceGestureUi = useCallback(() => {
    // Mute/expand/scrub may restore immediately; center stays pointer-events-none.
    window.setTimeout(() => {
      optsRef.current.onSurfaceGestureEnd?.();
    }, 0);
  }, []);

  const cancelPendingVideoGestures = useCallback(() => {
    clearLongPressTimer();
    resetPlaybackRate();
  }, [clearLongPressTimer, resetPlaybackRate]);

  const zoneFromClientX = useCallback((clientX: number): VideoTapZone => {
    const el = surfaceElRef.current;
    if (!el) return "center";
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0)) return "center";
    return getVideoTapZone((clientX - rect.left) / rect.width);
  }, []);

  const finishGestureAsCancel = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture) gesture.resolved = true;
    gestureRef.current = null;
    detachDocPointerListeners();
    const wasHold = longPressActiveRef.current;
    cancelPendingVideoGestures();
    log("pointer-cancel", { holdWasActive: wasHold });
    if (wasHold) log("hold-release", {});
    endSurfaceGestureUi();
  }, [
    cancelPendingVideoGestures,
    detachDocPointerListeners,
    endSurfaceGestureUi,
    log,
  ]);

  const finishGestureAsUp = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.resolved) return;
      gesture.resolved = true;
      detachDocPointerListeners();

      const videoBefore = optsRef.current.getVideoEl();
      const meta = optsRef.current.getMeta?.() ?? {};

      log("pointer-up", {
        x: clientX,
        y: clientY,
        dx: clientX - gesture.startX,
        dy: clientY - gesture.startY,
        kind: gesture.kind,
        chromeVisible: meta.chromeVisible,
        videoPaused: videoBefore?.paused,
        currentTime: videoBefore?.currentTime,
      });

      if (
        gesture.kind === "other" ||
        !shouldCommitVideoTapGestures(gesture.kind)
      ) {
        gestureRef.current = null;
        cancelPendingVideoGestures();
        if (gesture.kind === "slide") log("swiper-gesture", {});
        endSurfaceGestureUi();
        return;
      }

      if (longPressActiveRef.current) {
        // Hold release restores 1× — must NOT also toggle Play/Pause.
        gestureRef.current = null;
        resetPlaybackRate();
        log("hold-release", {});
        endSurfaceGestureUi();
        return;
      }

      clearLongPressTimer();
      gestureRef.current = null;

      if (shouldSuppressPublishedVideoSurfaceTap()) {
        log("surface-tap-suppressed", { reason: "fullscreen-dismiss" });
        endSurfaceGestureUi();
        return;
      }

      const zone = zoneFromClientX(clientX);
      const video = optsRef.current.getVideoEl();
      // Media element authority — ignore React playing state.
      const wasPlaying = Boolean(video && !video.paused && !video.ended);
      const chromeVisible = meta.chromeVisible === true;

      log("surface-tap", {
        zone,
        wasPlaying,
        chromeVisible,
        currentTime: video?.currentTime,
        videoPaused: video?.paused,
      });

      // Reveal-first: hidden chrome → show controls only (preserve playback).
      // Visible chrome → existing immediate Play/Pause toggle + refresh chrome.
      if (!chromeVisible) {
        log("surface-tap-reveal-only", { wasPlaying });
        optsRef.current.onRevealChrome();
        endSurfaceGestureUi();
        return;
      }

      if (wasPlaying) {
        optsRef.current.onRequestManualPause();
      } else {
        optsRef.current.onRequestManualPlay();
      }
      optsRef.current.onRevealChrome();
      endSurfaceGestureUi();
    },
    [
      cancelPendingVideoGestures,
      clearLongPressTimer,
      detachDocPointerListeners,
      endSurfaceGestureUi,
      log,
      resetPlaybackRate,
      zoneFromClientX,
    ],
  );

  const classifyPendingMove = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.resolved) return;
      const dx = clientX - gesture.startX;
      const dy = clientY - gesture.startY;
      const dist = Math.hypot(dx, dy);

      if (gesture.kind === "slide") {
        if (dist >= PUBLISHED_HOLD_CANCEL_PX) {
          clearLongPressTimer();
          if (longPressActiveRef.current) {
            resetPlaybackRate();
            log("hold-cancelled", { reason: "slide", dx, dy });
          }
        }
        return;
      }

      const kind = classifyHeroPointerGesture(dx, dy);
      if (kind === "slide") {
        gesture.kind = "slide";
        clearLongPressTimer();
        if (longPressActiveRef.current) {
          resetPlaybackRate();
          log("hold-cancelled", { reason: "slide", dx, dy });
        } else {
          log("pointer-move-cancel", { reason: "slide", dx, dy });
        }
        return;
      }
      if (kind === "other") {
        gesture.kind = "other";
        clearLongPressTimer();
        if (longPressActiveRef.current) {
          resetPlaybackRate();
          log("hold-cancelled", { reason: "vertical", dx, dy });
        } else {
          log("pointer-move-cancel", { reason: "vertical", dx, dy });
        }
        return;
      }

      // Tiny jitter: only cancel hold if beyond published tolerance.
      if (dist >= PUBLISHED_HOLD_CANCEL_PX) {
        if (gesture.holdArmed || longPressActiveRef.current) {
          clearLongPressTimer();
          if (longPressActiveRef.current) {
            resetPlaybackRate();
            log("hold-cancelled", { reason: "jitter", dx, dy });
          }
        }
      }
    },
    [clearLongPressTimer, log, resetPlaybackRate],
  );

  const attachDocPointerListeners = useCallback(
    (pointerId: number) => {
      detachDocPointerListeners();
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        classifyPendingMove(e.clientX, e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        finishGestureAsUp(e.clientX, e.clientY);
      };
      const onCancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        finishGestureAsCancel();
      };
      document.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
      docListenersRef.current = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
      };
    },
    [
      classifyPendingMove,
      detachDocPointerListeners,
      finishGestureAsCancel,
      finishGestureAsUp,
    ],
  );

  const armHold = useCallback(() => {
    clearLongPressTimer();
    const g = gestureRef.current;
    if (!g) return;
    g.holdArmed = true;
    log("hold-armed", {});
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      const gesture = gestureRef.current;
      if (!gesture || gesture.kind !== "undecided") return;
      const el = optsRef.current.getVideoEl();
      if (!el || el.paused || el.ended) return;
      longPressActiveRef.current = true;
      gesture.holdArmed = false;
      try {
        el.playbackRate = VIDEO_PLAYBACK_RATE_FAST;
      } catch {
        longPressActiveRef.current = false;
        return;
      }
      log("hold-active", { playbackRate: el.playbackRate });
      showFlash("speed");
    }, VIDEO_LONG_PRESS_MS);
  }, [clearLongPressTimer, log, showFlash]);

  /** Capture-phase: observe reliably even if children/Swiper intervene. */
  const onSurfacePointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const o = optsRef.current;
      if (!o.enabled) {
        log("gesture-disabled", {
          target: targetLabel(e.target),
          currentTarget: targetLabel(e.currentTarget),
        });
        return;
      }
      if (pathHitsControl(e.target)) {
        log("control-excluded", {
          target: targetLabel(e.target),
          path: compactComposedPath(e),
        });
        return;
      }

      // Do not stopPropagation — Swiper must still see the gesture.
      surfaceElRef.current = e.currentTarget;
      o.onSurfaceGestureStart?.();

      gestureRef.current = {
        kind: "undecided",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        resolved: false,
        holdArmed: false,
      };
      attachDocPointerListeners(e.pointerId);
      armHold();

      log("pointer-down", {
        target: targetLabel(e.target),
        currentTarget: targetLabel(e.currentTarget),
        path: compactComposedPath(e),
        pointerType: e.pointerType,
        x: e.clientX,
        y: e.clientY,
        chromeVisible: o.getMeta?.()?.chromeVisible,
        videoPaused: o.getVideoEl()?.paused,
        currentTime: o.getVideoEl()?.currentTime,
      });
      // Intentionally NO chrome reveal here — keeps hit-testing stable.
    },
    [armHold, attachDocPointerListeners, log],
  );

  const onSurfacePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      classifyPendingMove(e.clientX, e.clientY);
    },
    [classifyPendingMove],
  );

  const onSurfacePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // Doc listener is canonical; this is a backup if doc missed.
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      if (gestureRef.current.resolved) return;
      finishGestureAsUp(e.clientX, e.clientY);
    },
    [finishGestureAsUp],
  );

  const onSurfacePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (
        gestureRef.current &&
        gestureRef.current.pointerId !== e.pointerId
      ) {
        return;
      }
      finishGestureAsCancel();
    },
    [finishGestureAsCancel],
  );

  useEffect(() => {
    if (!optsRef.current.enabled) {
      if (gestureRef.current) finishGestureAsCancel();
    }
  }, [finishGestureAsCancel, options.enabled]);

  useEffect(() => {
    return () => {
      detachDocPointerListeners();
      clearLongPressTimer();
      resetPlaybackRate();
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, [clearLongPressTimer, detachDocPointerListeners, resetPlaybackRate]);

  useEffect(() => {
    // Media identity change: clear timers / rate.
    clearLongPressTimer();
    resetPlaybackRate();
    gestureRef.current = null;
    detachDocPointerListeners();
  }, [
    clearLongPressTimer,
    detachDocPointerListeners,
    options.mediaKey,
    resetPlaybackRate,
  ]);

  return {
    onSurfacePointerDownCapture,
    onSurfacePointerMove,
    onSurfacePointerUp,
    onSurfacePointerCancel,
    cancelPendingVideoGestures,
    resetPlaybackRate,
  };
}
