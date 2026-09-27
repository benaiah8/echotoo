import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  PiArrowsOutSimple,
  PiPauseFill,
  PiPlayFill,
  PiSpeakerHighFill,
  PiSpeakerSlashFill,
} from "react-icons/pi";

import { CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS } from "../../lib/createFinalizeVideoHeroFrame";
import {
  animateFullscreenDismissSnapBack,
  applyFullscreenDismissVisual,
  clearFullscreenDismissVisual,
  exitCreateFinalizeVideoFullscreen,
  isCreateFinalizeVideoFullscreenElement,
  requestCreateFinalizeVideoFullscreen,
  restoreAndroidSystemBarsAfterVideoFullscreen,
  setCreateFinalizeVideoFullscreenExitHandler,
  shouldCommitFullscreenDismissOnRelease,
  shouldIgnoreSwipeDownExitForControlTarget,
  shouldLockFullscreenDismiss,
  syncFullscreenChangeState,
  VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS,
  VIDEO_FULLSCREEN_CONTROLS_TOP_CSS,
  VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS,
} from "../../lib/createFinalizeVideoFullscreen";
import {
  getCreateVideoMutedPreference,
  setCreateVideoMutedPreference,
} from "../../lib/createFinalizeVideoMutePreference";
import {
  resolveVideoPlaybackLoadingVisible,
  VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS,
} from "../../lib/publishedMedia/resolveVideoPlaybackLoadingVisible";
import { markVideoCrashCheckpoint } from "../../lib/videoCrashDiagnostics";
import VideoPlaybackLoadingSpinner from "../ui/VideoPlaybackLoadingSpinner";
import {
  VIDEO_CHROME_HIDE_MS,
  VIDEO_DOUBLE_TAP_WINDOW_MS,
  VIDEO_LONG_PRESS_MS,
  VIDEO_PLAYBACK_RATE_FAST,
  canUseVideoFullscreen,
  classifyHeroPointerGesture,
  computeDoubleTapSeekTime,
  computeVideoPlayedProgress,
  exceedsStationaryThreshold,
  getVideoTapZone,
  resolveVideoPointerUp,
  videoPlayedProgressCssPercent,
  type HeroPointerGestureKind,
  type VideoTapZone,
} from "../../lib/createFinalizeVideoGestures";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  src: string;
  poster?: string | null;
  isActiveHero: boolean;
  dockExpanded: boolean;
  uploadProgress?: number | null;
  className?: string;
  style?: CSSProperties;
};

type FlashKind = "play" | "pause" | "back" | "forward" | "speed" | null;

export default function CreateFinalizeVideoPlayer({
  src,
  poster,
  isActiveHero,
  dockExpanded,
  uploadProgress = null,
  className = "",
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dismissSurfaceRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubbingRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; zone: VideoTapZone } | null>(null);
  const chromeHideTimerRef = useRef<number | null>(null);
  const wasPlayingBeforeDockRef = useRef(false);
  const dismissAnimatingRef = useRef(false);
  const gestureRef = useRef<{
    kind: HeroPointerGestureKind;
    pointerId: number;
    startX: number;
    startY: number;
    resolved: boolean;
    dismissLocked: boolean;
    lastDy: number;
  } | null>(null);
  const docListenersRef = useRef<(() => void) | null>(null);

  const [playing, setPlaying] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [stallTimedOut, setStallTimedOut] = useState(false);
  /** Bumps on every `src` change so late waiting/stalled from an old element cannot arm spinner. */
  const srcGenerationRef = useRef(0);
  const [muted, setMuted] = useState(() => getCreateVideoMutedPreference());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [scrubActive, setScrubActive] = useState(false);
  const [flash, setFlash] = useState<FlashKind>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const paintSeekRef = useRef(false);
  const fullscreenSupported = canUseVideoFullscreen();
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  const dockBlocksPlayback = dockExpanded;

  const clearChromeHideTimer = useCallback(() => {
    if (chromeHideTimerRef.current != null) {
      window.clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearChromeHideTimer();
    if (!playing || dockBlocksPlayback || scrubActive) return;
    chromeHideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
    }, VIDEO_CHROME_HIDE_MS);
  }, [clearChromeHideTimer, dockBlocksPlayback, playing, scrubActive]);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleChromeHide();
  }, [scheduleChromeHide]);

  const showFlash = useCallback((kind: FlashKind) => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 650);
  }, []);

  const pauseVideo = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    if (el.playbackRate !== 1) el.playbackRate = 1;
    longPressActiveRef.current = false;
    setPlaying(false);
  }, []);

  const tryAutoplay = useCallback(async () => {
    const el = videoRef.current;
    if (!el || dockBlocksPlayback || !isActiveHero) return;
    // Prefer sound-on; if autoplay-with-audio is blocked, stay unmuted + paused.
    el.muted = mutedRef.current;
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [dockBlocksPlayback, isActiveHero]);

  useEffect(() => {
    // Reset first-frame readiness ONLY when playable src changes.
    // Deferred poster enrichment must not re-arm the spinner while the same
    // video is already playing.
    srcGenerationRef.current += 1;
    paintSeekRef.current = false;
    setMediaReady(false);
    setIsBuffering(false);
    setStallTimedOut(false);
    if (src?.trim()) {
      markVideoCrashCheckpoint("preview-mount");
    }
  }, [src]);

  useEffect(() => {
    const loadingVisible = resolveVideoPlaybackLoadingVisible({
      hasPlayableSource: Boolean(src?.trim()),
      mediaFailed: false,
      awaitingFirstFrame: Boolean(src?.trim()) && !mediaReady,
      isBuffering,
      isPausedWithReadyFrame: mediaReady && !playing && !isBuffering,
      stallTimedOut: false,
    });
    if (!loadingVisible) {
      setStallTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStallTimedOut(true);
      setIsBuffering(false);
    }, VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isBuffering, mediaReady, playing, src]);

  const markCurrentSourceReady = useCallback(() => {
    setMediaReady(true);
    setIsBuffering(false);
    setStallTimedOut(false);
  }, []);

  const onCurrentSourceWaiting = useCallback(() => {
    const eventGen = srcGenerationRef.current;
    queueMicrotask(() => {
      if (eventGen !== srcGenerationRef.current) return;
      setIsBuffering(true);
    });
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  const ensurePausedDecodedFrame = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.paused) return;
    if (poster) return;
    if (paintSeekRef.current) return;
    if (el.readyState < 2) return;
    try {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      const t =
        d > 0 ? Math.min(0.25, Math.max(0.1, d * 0.02)) : 0.15;
      paintSeekRef.current = true;
      if (el.currentTime < 0.05) {
        el.currentTime = t;
      }
    } catch {
      paintSeekRef.current = false;
    }
  }, [poster]);

  useEffect(() => {
    if (!isActiveHero || dockBlocksPlayback) {
      if (dockBlocksPlayback) {
        wasPlayingBeforeDockRef.current = playing;
      }
      pauseVideo();
      gestureRef.current = null;
      docListenersRef.current?.();
      docListenersRef.current = null;
      if (singleTapTimerRef.current != null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      lastTapRef.current = null;
      return;
    }
    void tryAutoplay();
  }, [isActiveHero, dockBlocksPlayback, src, tryAutoplay, pauseVideo]);

  useEffect(() => {
    if (dockBlocksPlayback) {
      setChromeVisible(false);
      return;
    }
    setChromeVisible(true);
    scheduleChromeHide();
  }, [dockBlocksPlayback, scheduleChromeHide]);

  useEffect(() => {
    if (playing && !dockBlocksPlayback) {
      scheduleChromeHide();
    } else {
      clearChromeHideTimer();
      if (!playing) setChromeVisible(true);
    }
    return clearChromeHideTimer;
  }, [playing, dockBlocksPlayback, scheduleChromeHide, clearChromeHideTimer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pauseVideo();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pauseVideo]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const { isFullscreen: next, exited } = syncFullscreenChangeState({
        container: containerRef.current,
        wasFullscreen: isFullscreenRef.current,
      });
      setIsFullscreen(next);
      if (next) {
        clearFullscreenDismissVisual(
          dismissSurfaceRef.current,
          containerRef.current,
        );
        setCreateFinalizeVideoFullscreenExitHandler(() => {
          clearFullscreenDismissVisual(
            dismissSurfaceRef.current,
            containerRef.current,
          );
          const el = videoRef.current;
          if (el && el.playbackRate !== 1) el.playbackRate = 1;
          longPressActiveRef.current = false;
          void exitCreateFinalizeVideoFullscreen();
        });
        setChromeVisible(true);
        scheduleChromeHide();
      } else if (exited) {
        clearFullscreenDismissVisual(
          dismissSurfaceRef.current,
          containerRef.current,
        );
        const el = videoRef.current;
        if (el && el.playbackRate !== 1) el.playbackRate = 1;
        longPressActiveRef.current = false;
        dismissAnimatingRef.current = false;
        setCreateFinalizeVideoFullscreenExitHandler(null);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [scheduleChromeHide]);

  useEffect(() => {
    if (!isFullscreen) return;
    const blockScroll = (e: TouchEvent) => {
      const root = containerRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      document.removeEventListener("touchmove", blockScroll);
    };
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      pauseVideo();
      docListenersRef.current?.();
      docListenersRef.current = null;
      if (singleTapTimerRef.current != null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      clearChromeHideTimer();
      clearFullscreenDismissVisual(
        dismissSurfaceRef.current,
        containerRef.current,
      );
      dismissAnimatingRef.current = false;
      setCreateFinalizeVideoFullscreenExitHandler(null);
      if (
        containerRef.current &&
        isCreateFinalizeVideoFullscreenElement(containerRef.current)
      ) {
        void exitCreateFinalizeVideoFullscreen();
      } else {
        restoreAndroidSystemBarsAfterVideoFullscreen();
      }
    };
  }, [pauseVideo, clearChromeHideTimer]);

  const togglePlayPause = useCallback(() => {
    const el = videoRef.current;
    if (!el || dockBlocksPlayback) return;
    if (el.paused || el.ended) {
      // Poster/paint seek may leave currentTime near 0.1–0.25; start playback at 0.
      if (paintSeekRef.current && el.currentTime > 0 && el.currentTime < 0.5) {
        try {
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
        paintSeekRef.current = false;
      }
      void el
        .play()
        .then(() => {
          setPlaying(true);
          showFlash("play");
          revealChrome();
        })
        .catch(() => setPlaying(false));
    } else {
      pauseVideo();
      showFlash("pause");
      revealChrome();
    }
  }, [dockBlocksPlayback, pauseVideo, revealChrome, showFlash]);

  const seekToFraction = (fraction: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const next = Math.max(0, Math.min(1, fraction)) * el.duration;
    el.currentTime = next;
    setCurrentTime(next);
    revealChrome();
  };

  const seekByDirection = useCallback(
    (direction: "back" | "forward") => {
      const el = videoRef.current;
      if (!el || dockBlocksPlayback) return;
      const next = computeDoubleTapSeekTime(
        direction,
        el.currentTime,
        el.duration,
      );
      el.currentTime = next;
      setCurrentTime(next);
      showFlash(direction === "back" ? "back" : "forward");
      revealChrome();
    },
    [dockBlocksPlayback, revealChrome, showFlash],
  );

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current != null) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const endLongPress = useCallback(() => {
    const el = videoRef.current;
    if (longPressActiveRef.current && el) {
      el.playbackRate = 1;
      longPressActiveRef.current = false;
      setFlash(null);
    }
    clearLongPressTimer();
  }, []);

  const cancelPendingVideoGestures = useCallback(() => {
    endLongPress();
    clearSingleTapTimer();
    lastTapRef.current = null;
  }, [endLongPress]);

  const resetPlaybackRate = useCallback(() => {
    const el = videoRef.current;
    if (el && el.playbackRate !== 1) el.playbackRate = 1;
    longPressActiveRef.current = false;
  }, []);

  const clearDismissMotion = useCallback(() => {
    clearFullscreenDismissVisual(
      dismissSurfaceRef.current,
      containerRef.current,
    );
  }, []);

  const detachDocPointerListeners = useCallback(() => {
    docListenersRef.current?.();
    docListenersRef.current = null;
  }, []);

  const zoneFromClientX = (clientX: number): VideoTapZone => {
    const root = containerRef.current;
    if (!root) return "center";
    const rect = root.getBoundingClientRect();
    const width = rect.width || 1;
    return getVideoTapZone((clientX - rect.left) / width);
  };

  const finishGestureAsCancel = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture) gesture.resolved = true;
    const wasDismiss = Boolean(gesture?.dismissLocked);
    const lastDy = gesture?.lastDy ?? 0;
    gestureRef.current = null;
    detachDocPointerListeners();
    cancelPendingVideoGestures();
    resetPlaybackRate();
    if (wasDismiss && isFullscreenRef.current && !dismissAnimatingRef.current) {
      dismissAnimatingRef.current = true;
      void animateFullscreenDismissSnapBack(
        dismissSurfaceRef.current,
        containerRef.current,
        lastDy,
      ).finally(() => {
        dismissAnimatingRef.current = false;
      });
    }
  }, [
    cancelPendingVideoGestures,
    detachDocPointerListeners,
    resetPlaybackRate,
  ]);

  const finishDismissRelease = useCallback(
    (dy: number) => {
      cancelPendingVideoGestures();
      resetPlaybackRate();
      if (dismissAnimatingRef.current) return;

      if (shouldCommitFullscreenDismissOnRelease(dy)) {
        // Exit from the current dragged visual — no commit animation, no
        // pre-clear of translate/scale/opacity (avoids one-frame full-size jump).
        dismissAnimatingRef.current = true;
        void exitCreateFinalizeVideoFullscreen().finally(() => {
          clearDismissMotion();
          dismissAnimatingRef.current = false;
        });
        return;
      }

      dismissAnimatingRef.current = true;
      void animateFullscreenDismissSnapBack(
        dismissSurfaceRef.current,
        containerRef.current,
        dy,
      ).finally(() => {
        dismissAnimatingRef.current = false;
      });
    },
    [cancelPendingVideoGestures, clearDismissMotion, resetPlaybackRate],
  );

  const finishGestureAsUp = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.resolved) return;
      gesture.resolved = true;
      detachDocPointerListeners();

      if (gesture.dismissLocked) {
        const dy = Math.max(0, clientY - gesture.startY);
        gestureRef.current = null;
        finishDismissRelease(dy);
        return;
      }

      if (dockBlocksPlayback) {
        gestureRef.current = null;
        return;
      }

      const outcome = resolveVideoPointerUp({
        kind: gesture.kind,
        holdActive: longPressActiveRef.current,
        zone: zoneFromClientX(clientX),
        lastTap: lastTapRef.current,
        now: Date.now(),
      });
      gestureRef.current = null;

      if (outcome.action === "none") {
        cancelPendingVideoGestures();
        return;
      }
      if (outcome.action === "end-hold") {
        endLongPress();
        lastTapRef.current = null;
        clearSingleTapTimer();
        return;
      }
      clearLongPressTimer();
      if (outcome.action === "seek") {
        clearSingleTapTimer();
        lastTapRef.current = null;
        seekByDirection(outcome.direction);
        return;
      }

      const zone = zoneFromClientX(clientX);
      lastTapRef.current = { time: Date.now(), zone };
      clearSingleTapTimer();
      singleTapTimerRef.current = window.setTimeout(() => {
        lastTapRef.current = null;
        togglePlayPause();
      }, VIDEO_DOUBLE_TAP_WINDOW_MS);
    },
    [
      cancelPendingVideoGestures,
      detachDocPointerListeners,
      dockBlocksPlayback,
      endLongPress,
      finishDismissRelease,
      seekByDirection,
      togglePlayPause,
    ],
  );

  const classifyPendingMove = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.resolved) return;
      const dx = clientX - gesture.startX;
      const dy = clientY - gesture.startY;

      if (gesture.dismissLocked) {
        gesture.lastDy = Math.max(0, dy);
        applyFullscreenDismissVisual(
          dismissSurfaceRef.current,
          containerRef.current,
          gesture.lastDy,
        );
        return;
      }

      // Already committed to horizontal carousel — never steal for dismiss.
      if (gesture.kind === "slide") {
        if (exceedsStationaryThreshold(dx, dy)) {
          cancelPendingVideoGestures();
        }
        return;
      }

      if (
        isFullscreenRef.current &&
        !dismissAnimatingRef.current &&
        shouldLockFullscreenDismiss(dx, dy)
      ) {
        gesture.dismissLocked = true;
        gesture.kind = "other";
        gesture.lastDy = Math.max(0, dy);
        cancelPendingVideoGestures();
        resetPlaybackRate();
        applyFullscreenDismissVisual(
          dismissSurfaceRef.current,
          containerRef.current,
          gesture.lastDy,
        );
        return;
      }

      const kind = classifyHeroPointerGesture(dx, dy);
      if (kind === "slide") {
        gesture.kind = "slide";
        cancelPendingVideoGestures();
        return;
      }
      if (exceedsStationaryThreshold(dx, dy)) {
        if (kind === "other") gesture.kind = "other";
        clearLongPressTimer();
      }
    },
    [cancelPendingVideoGestures, resetPlaybackRate],
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
      document.addEventListener("pointermove", onMove);
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

  const onSurfacePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (shouldIgnoreSwipeDownExitForControlTarget(e.target)) return;
    if ((e.target as HTMLElement).closest("[data-video-control]")) return;
    if (dockBlocksPlayback) return;
    if (dismissAnimatingRef.current) return;

    gestureRef.current = {
      kind: "undecided",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      resolved: false,
      dismissLocked: false,
      lastDy: 0,
    };
    attachDocPointerListeners(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    const fractionX = (e.clientX - rect.left) / rect.width;
    const zone = getVideoTapZone(fractionX);

    if (zone === "left" || zone === "right") {
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        if (gestureRef.current?.kind !== "undecided") return;
        if (gestureRef.current?.dismissLocked) return;
        const el = videoRef.current;
        if (!el) return;
        longPressActiveRef.current = true;
        el.playbackRate = VIDEO_PLAYBACK_RATE_FAST;
        if (el.paused) {
          void el.play().then(() => setPlaying(true));
        }
        showFlash("speed");
        revealChrome();
      }, VIDEO_LONG_PRESS_MS);
    }

    revealChrome();
  };

  const onSurfacePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== e.pointerId) return;
    classifyPendingMove(e.clientX, e.clientY);
  };

  const onSurfacePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-video-control]")) return;
    if (gestureRef.current?.pointerId !== e.pointerId) return;
    finishGestureAsUp(e.clientX, e.clientY);
  };

  const onSurfacePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current && gestureRef.current.pointerId !== e.pointerId) {
      return;
    }
    finishGestureAsCancel();
  };

  const onScrubInput = (e: ChangeEvent<HTMLInputElement>, commit: boolean) => {
    const fraction = Number(e.currentTarget.value) / 1000;
    if (commit) seekToFraction(fraction);
    else setCurrentTime(fraction * (duration || 0));
  };

  const toggleFullscreen = async () => {
    const root = containerRef.current;
    if (!root || !fullscreenSupported) return;
    revealChrome();
    try {
      if (isCreateFinalizeVideoFullscreenElement(root)) {
        clearDismissMotion();
        resetPlaybackRate();
        await exitCreateFinalizeVideoFullscreen();
      } else {
        const result = await requestCreateFinalizeVideoFullscreen(root);
        if (result === "entered") {
          setCreateFinalizeVideoFullscreenExitHandler(() => {
            clearDismissMotion();
            resetPlaybackRate();
            void exitCreateFinalizeVideoFullscreen();
          });
        }
      }
    } catch {
      /* unsupported */
    }
  };

  const showChrome =
    !dockBlocksPlayback && uploadProgress == null && (chromeVisible || !playing);
  const showTime =
    showChrome && (scrubActive || !playing || chromeVisible);
  const showPlaybackLoading = resolveVideoPlaybackLoadingVisible({
    hasPlayableSource: Boolean(src?.trim()),
    mediaFailed: false,
    awaitingFirstFrame: Boolean(src?.trim()) && !mediaReady,
    isBuffering,
    isPausedWithReadyFrame: mediaReady && !playing && !isBuffering,
    stallTimedOut,
  });
  const playedProgress = computeVideoPlayedProgress(currentTime, duration);
  const playedPct = videoPlayedProgressCssPercent(currentTime, duration);
  const progress =
    duration > 0
      ? Math.min(1000, Math.round(playedProgress * 1000))
      : 0;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-black ${className}`}
      data-finalize-video-player
      data-finalize-video-fullscreen={isFullscreen ? "true" : undefined}
      style={{
        ...style,
        ...(isFullscreen ? { touchAction: "none" } : null),
      }}
      onPointerDown={revealChrome}
    >
      <div
        ref={dismissSurfaceRef}
        className="absolute inset-0 h-full w-full"
        data-finalize-video-dismiss-surface
      >
        <div
          className="absolute inset-0 touch-manipulation"
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
          onPointerCancel={onSurfacePointerCancel}
          aria-label={playing ? "Pause video" : "Play video"}
          role="button"
          tabIndex={-1}
        >
          <video
            ref={videoRef}
            key={src}
            src={src}
            poster={poster ?? undefined}
            playsInline
            muted={muted}
            loop={false}
            preload="auto"
            className="block h-full w-full object-contain"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              ensurePausedDecodedFrame();
            }}
            onLoadedData={() => {
              markCurrentSourceReady();
              ensurePausedDecodedFrame();
            }}
            onCanPlay={() => {
              markCurrentSourceReady();
            }}
            onPlaying={() => {
              setPlaying(true);
              // Playing is authoritative: never show spinner over live frames.
              markCurrentSourceReady();
            }}
            onWaiting={onCurrentSourceWaiting}
            onStalled={onCurrentSourceWaiting}
            onTimeUpdate={(e) => {
              if (!scrubbingRef.current) {
                setCurrentTime(e.currentTarget.currentTime);
              }
            }}
            onPlay={() => {
              setPlaying(true);
              markCurrentSourceReady();
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          {/* Reliable paused visual: poster overlay until playback starts. */}
          {poster && !playing ? (
            <img
              src={poster}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain"
              aria-hidden
            />
          ) : null}
          {showPlaybackLoading ? <VideoPlaybackLoadingSpinner /> : null}
        </div>

        {flash ? (
          <span
            className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
            aria-hidden
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-sm font-semibold text-white backdrop-blur-sm">
              {flash === "play" ? (
                <PiPlayFill className="ml-0.5 h-5 w-5" />
              ) : flash === "pause" ? (
                <PiPauseFill className="h-5 w-5" />
              ) : flash === "back" ? (
                "−3s"
              ) : flash === "forward" ? (
                "+3s"
              ) : (
                "2×"
              )}
            </span>
          </span>
        ) : null}

        {uploadProgress != null ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-0.5 bg-white/20"
            aria-hidden
          >
            <div
              className="h-full bg-[var(--create-chooser-cta-selected-surface)] transition-[width] duration-150"
              style={{
                width: `${Math.max(0, Math.min(100, uploadProgress))}%`,
              }}
            />
          </div>
        ) : null}

        {showChrome ? (
          <>
            <div
              className={[
                "pointer-events-none absolute z-[4] flex items-center gap-1.5 transition-opacity duration-300",
                chromeVisible || !playing
                  ? "opacity-100"
                  : "opacity-0",
              ].join(" ")}
              style={
                isFullscreen
                  ? {
                      top: VIDEO_FULLSCREEN_CONTROLS_TOP_CSS,
                      right: VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS,
                    }
                  : { top: "0.5rem", right: "0.5rem" }
              }
            >
              {fullscreenSupported ? (
                <button
                  type="button"
                  data-video-control
                  className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFullscreen();
                  }}
                >
                  <PiArrowsOutSimple className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                data-video-control
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
                aria-label={muted ? "Unmute video" : "Mute video"}
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => {
                    const next = !m;
                    setCreateVideoMutedPreference(next);
                    return next;
                  });
                  revealChrome();
                }}
              >
                {muted ? (
                  <PiSpeakerSlashFill className="h-4 w-4" />
                ) : (
                  <PiSpeakerHighFill className="h-4 w-4" />
                )}
              </button>
            </div>

            <div
              data-video-control
              className={[
                "absolute inset-x-0 z-[4] px-3 transition-opacity duration-300",
                chromeVisible || !playing || scrubActive
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0",
              ].join(" ")}
              style={{
                bottom: isFullscreen
                  ? VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS
                  : CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {showTime && duration > 0 ? (
                <span className="mb-0.5 block text-center text-[9px] font-medium tabular-nums text-white/75">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              ) : null}
              <div
                className="video-progress-scrub relative block h-3 w-full"
                data-video-scrubber
                data-scrub-active={scrubActive ? "true" : undefined}
              >
                <div
                  className="video-progress-scrub__track pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
                  aria-hidden
                />
                <div
                  className="video-progress-scrub__played pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"
                  aria-hidden
                  style={{ width: playedPct }}
                />
                <div
                  className={[
                    "video-progress-scrub__handle pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
                    scrubActive
                      ? "video-progress-scrub__handle--active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden
                  style={{ left: playedPct }}
                />
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={progress}
                  aria-label="Video progress"
                  className="video-thin-scrub pointer-events-auto absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer appearance-none bg-transparent"
                  style={
                    {
                      "--progress": playedPct,
                    } as CSSProperties
                  }
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    scrubbingRef.current = true;
                    setScrubActive(true);
                    revealChrome();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    scrubbingRef.current = false;
                    setScrubActive(false);
                    onScrubInput(
                      e as unknown as ChangeEvent<HTMLInputElement>,
                      true,
                    );
                    scheduleChromeHide();
                  }}
                  onChange={(e) => onScrubInput(e, !scrubbingRef.current)}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
