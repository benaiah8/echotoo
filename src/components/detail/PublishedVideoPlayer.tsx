/**
 * Published Post Detail / fullscreen / Feed / Profile HLS video player (PV1.2 + PV2B + PV3.1).
 * Remote playback only — no draft/prep/upload chrome.
 * List: invisible warm (hls.js) + muted autoplay when active; tear down when idle/offscreen.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import {
  PiArrowClockwise,
  PiArrowsOutSimple,
  PiPauseFill,
  PiPlayFill,
  PiSpeakerHighFill,
  PiSpeakerSlashFill,
} from "react-icons/pi";

import {
  exitCreateFinalizeVideoFullscreen,
  isCreateFinalizeVideoFullscreenElement,
  requestCreateFinalizeVideoFullscreen,
  restoreAndroidSystemBarsAfterVideoFullscreen,
  setCreateFinalizeVideoFullscreenExitHandler,
  syncFullscreenChangeState,
  VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS,
  VIDEO_FULLSCREEN_CONTROLS_TOP_CSS,
  VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS,
} from "../../lib/createFinalizeVideoFullscreen";
import {
  VIDEO_CHROME_HIDE_MS,
  canUseVideoFullscreen,
  computeVideoPlayedProgress,
  videoPlayedProgressCssPercent,
} from "../../lib/createFinalizeVideoGestures";
import {
  resolveManualVideoRotateFitStyle,
  type ManualVideoRotateDeg,
} from "../../lib/publishedMedia/publishedFullscreenVideoManualRotate";
import {
  usePublishedVideoSurfaceGestures,
  type PublishedVideoGestureFlash,
} from "../../lib/publishedMedia/usePublishedVideoSurfaceGestures";
import {
  logPublishedVideoState,
  logPublishedVideoStateTransition,
  nextPublishedVideoPlayerInstanceId,
  publishedVideoMediaSnapshot,
  publishedVideoPlayErrorName,
} from "../../lib/publishedMedia/publishedVideoStateLog";
import {
  fetchPublishedPostMediaRowById,
  PUBLISHED_HLS_BUFFER,
  PUBLISHED_HLS_WARM_BUFFER,
  PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC,
  PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS,
  applyPublishedVideoHandoffRestore,
  capturePublishedVideoPlaybackFromElement,
  classifyPublishedVideoPlayError,
  getPublishedVideoPreferredMuted,
  isPublishedVideoPlaybackSnapshotForMedia,
  mergePublishedVideoDimensions,
  isPublishedVideoProcessingStatus,
  shouldApplyPosterProvisionalVideoDimensions,
  posterProvisionalDimensionsAlreadyApplied,
  resolvePublishedVideoHandoffLatchUi,
  resolvePublishedVideoHandoffPlayMute,
  resolvePublishedVideoPlayback,
  resolvePublishedVideoSeekPlaybackAction,
  setPublishedVideoSoundPreferenceMuted,
  shouldIgnoreTimeupdateDuringHandoffSeek,
  shouldResetAppliedHandoffGeneration,
  shouldRetryPublishedVideoPlayMuted,
  shouldCommitDeferredPlaybackTeardown,
  shouldTearDownIdlePublishedVideo,
  resolveHandoffRestoreAbortDisposition,
  abandonPublishedVideoHandoffForManualPlay,
  nextHandoffVisualSeekLock,
  resolvePublishedVideoShowVideoFrame,
  resolvePublishedVideoAwaitingFirstFrame,
  resolveVideoPlaybackLoadingVisible,
  VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS,
  shouldCommitHandoffRestoreVisualState,
  shouldSuppressCompetingPlayDuringHandoff,
  waitForPublishedVideoSeekSettled,
  publishedVideoObjectIdentity,
  type PublishedMediaItem,
  type PublishedVideoPlaybackSnapshot,
} from "../../lib/publishedMedia";
import VideoPlaybackLoadingSpinner from "../ui/VideoPlaybackLoadingSpinner";

type HlsConstructor = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsConstructor>;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(
    video.canPlayType("application/vnd.apple.mpegurl") ||
      video.canPlayType("application/x-mpegURL"),
  );
}

/** Autoplay blocked with sound — safe to retry muted once. */
function isAutoplaySoundBlockedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const name = String((err as { name?: unknown }).name ?? "");
  if (name === "AbortError") return false;
  if (name === "NotAllowedError") return true;
  // Some WebViews omit name; treat generic play() rejection as retryable once.
  return name === "" || name === "Error" || name === "DOMException";
}

/** Buffered media ahead of currentTime (seconds). */
function getBufferedAheadSec(video: HTMLVideoElement): number {
  const t = video.currentTime || 0;
  const { buffered } = video;
  try {
    for (let i = 0; i < buffered.length; i += 1) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (start <= t + 0.35 && end > t) {
        return Math.max(0, end - t);
      }
    }
    if (buffered.length > 0 && t <= 0.5) {
      const start = buffered.start(0);
      const end = buffered.end(0);
      if (start <= 0.5) return Math.max(0, end - t);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export type PublishedVideoPlayerMode =
  | "detail"
  | "fullscreen"
  | "feed"
  | "profile";

type Props = {
  item: Extract<PublishedMediaItem, { kind: "video" }>;
  isActive: boolean;
  /**
   * List-only invisible prewarm (hls.js). Must never play or show chrome.
   * Native HLS platforms skip byte prewarm.
   */
  isWarm?: boolean;
  /** detail | fullscreen | feed | profile */
  mode?: PublishedVideoPlayerMode;
  className?: string;
  style?: CSSProperties;
  onVideoUpdated?: (
    next: Extract<PublishedMediaItem, { kind: "video" }>,
  ) => void;
  /**
   * When set (Detail/list), expand opens mixed overlay / Detail instead of browser FS.
   */
  onRequestMixedFullscreen?: () => void;
  /**
   * List: fatal unrecovered HLS — release active/warm ownership; keep poster.
   */
  onPlaybackFailed?: () => void;
  /** List: claim active ownership before manual play. */
  onRequestActivePlayback?: () => void;
  /** List: user paused — suppress autoplay while still active (PV3.8.4). */
  onManualPause?: () => void;
  /**
   * List: explicit user pause for this media — autoplay/foreground must not resume.
   */
  userPaused?: boolean;
  /**
   * List: register imperative pause so surface/coordinator can pause on revoke
   * without waiting for the next React isActive paint (PV3.8.5).
   */
  registerListPlaybackPause?: (
    pause: ((reason: string) => number | undefined) | null,
  ) => void;
  /** Show browser/expand control. Default: Detail with handler or browser FS; list when handler set. */
  showExpandControl?: boolean;
  /**
   * Pass 3B: restore playback after Detail ↔ fullscreen handoff.
   * Applied once when active + media matches; then consumed.
   */
  playbackHandoff?: PublishedVideoPlaybackSnapshot | null;
  onPlaybackHandoffConsumed?: (generation: number) => void;
  /** Pass 3B: register sync capture (call before Detail deactivates / FS closes). */
  registerPlaybackCapture?: (
    capture: ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null,
  ) => void;
  /**
   * Immersive published fullscreen only: visual quarter-turn of video content
   * (not chrome). Does not remount playback.
   */
  contentRotateDeg?: ManualVideoRotateDeg;
  /** When set, shows Rotate next to mute in fullscreen chrome. */
  onRequestContentRotate?: () => void;
};

export default function PublishedVideoPlayer({
  item,
  isActive,
  isWarm = false,
  mode = "detail",
  className = "",
  style,
  onVideoUpdated,
  onRequestMixedFullscreen,
  onPlaybackFailed,
  onRequestActivePlayback,
  onManualPause,
  userPaused = false,
  registerListPlaybackPause,
  showExpandControl,
  playbackHandoff = null,
  onPlaybackHandoffConsumed,
  registerPlaybackCapture,
  contentRotateDeg = 0,
  onRequestContentRotate,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterImgRef = useRef<HTMLImageElement | null>(null);
  const contentRotateStageRef = useRef<HTMLDivElement | null>(null);
  const hlsAttachCountRef = useRef(0);
  const hlsRef = useRef<HlsInstance | null>(null);
  const hlsCtorRef = useRef<HlsConstructor | null>(null);
  const scrubbingRef = useRef(false);
  /** Pass 3D: play intent captured at scrub pointerdown (not seek-induced pause). */
  const scrubWantsPlayingRef = useRef(false);
  /** True after pointerdown capture until commit consumes it. */
  const scrubIntentLatchedRef = useRef(false);
  /** Pass 3D: only the latest scrub commit may restore playback. */
  const scrubSeekGenerationRef = useRef(0);
  const scrubSeekAbortRef = useRef<AbortController | null>(null);
  const chromeHideTimerRef = useRef<number | null>(null);
  const isFullscreenRef = useRef(false);
  const userWantsPlayRef = useRef(false);
  const hlsAttachedRef = useRef(false);
  /** Autoplay rejected by browser even after muted retry — do not loop. */
  const autoplayRejectedRef = useRef(false);
  /** Distinguishes autoplay intent from manual play. */
  const playIntentRef = useRef<"none" | "autoplay" | "manual">("none");
  /** Protects idle tearDown while list ownership render catches up. */
  const manualPlayInFlightRef = useRef(false);
  /**
   * PV3.8.4: Detail/Fullscreen have no list userPausedKey — latch locally.
   * List still passes `userPaused` from the surface coordinator.
   */
  const initialHandoffLatch =
    isPublishedVideoPlaybackSnapshotForMedia(playbackHandoff, item.key)
      ? resolvePublishedVideoHandoffLatchUi(playbackHandoff)
      : null;
  const [localUserPaused, setLocalUserPaused] = useState(
    () => initialHandoffLatch?.localUserPaused ?? false,
  );
  const isUserPaused = Boolean(userPaused || localUserPaused);
  const userPausedRef = useRef(isUserPaused);
  userPausedRef.current = isUserPaused;
  const mutedRef = useRef(
    initialHandoffLatch?.muted ?? getPublishedVideoPreferredMuted(),
  );
  const autoplayGenRef = useRef(0);
  /** Pass 3B/3G: block default autoplay until handoff seek/play is applied. */
  const handoffRestorePendingRef = useRef(Boolean(initialHandoffLatch));
  const appliedHandoffGenerationRef = useRef<number | null>(null);
  const pendingHandoffRef = useRef<PublishedVideoPlaybackSnapshot | null>(
    initialHandoffLatch &&
      isPublishedVideoPlaybackSnapshotForMedia(playbackHandoff, item.key)
      ? playbackHandoff
      : null,
  );
  const handoffSeekSettledRef = useRef(!initialHandoffLatch);
  const lastHandoffMediaKeyRef = useRef(item.key);
  const onPlaybackHandoffConsumedRef = useRef(onPlaybackHandoffConsumed);
  onPlaybackHandoffConsumedRef.current = onPlaybackHandoffConsumed;
  /** Bounded fatal NETWORK_ERROR startLoad attempts per HLS attach (PV3.7). */
  const hlsNetworkRetryRef = useRef(0);
  const onPlaybackFailedRef = useRef(onPlaybackFailed);
  onPlaybackFailedRef.current = onPlaybackFailed;

  const fullscreenSupported = canUseVideoFullscreen();
  const isListSurface = mode === "feed" || mode === "profile";
  const playerIdRef = useRef(nextPublishedVideoPlayerInstanceId());
  const playPendingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isWarmRef = useRef(isWarm);
  isWarmRef.current = isWarm;
  const restoreSessionRef = useRef(0);
  const mountedForTeardownRef = useRef(false);
  const [playPending, setPlayPending] = useState(
    () => initialHandoffLatch?.playPending ?? false,
  );
  playPendingRef.current = playPending;
  // Shared preference defaults to sound ON; muted fallback is playback-local only.
  // Pass 3G: validated snapshot mute/time seed the first paint (no 0:00 flash).
  const [muted, setMuted] = useState(
    () => initialHandoffLatch?.muted ?? getPublishedVideoPreferredMuted(),
  );
  const [currentTime, setCurrentTime] = useState(
    () => initialHandoffLatch?.currentTime ?? 0,
  );
  /** Capture registration must not re-bind on every timeupdate. */
  const currentTimeForCaptureRef = useRef(currentTime);
  currentTimeForCaptureRef.current = currentTime;
  const mediaKeyForCaptureRef = useRef(item.key);
  mediaKeyForCaptureRef.current = item.key;
  /** Bumped when media identity (key / videoId) changes — stale events ignore. */
  const mediaEventSessionRef = useRef(0);
  const [handoffEpoch, setHandoffEpoch] = useState(0);
  const [handoffRestorePending, setHandoffRestorePending] = useState(
    Boolean(initialHandoffLatch),
  );
  const [handoffSeekSettled, setHandoffSeekSettled] = useState(
    () => !initialHandoffLatch,
  );
  const [duration, setDuration] = useState(
    typeof item.durationSec === "number" && item.durationSec > 0
      ? item.durationSec
      : 0,
  );
  const [chromeVisible, setChromeVisible] = useState(!isListSurface);
  /** List: user deliberately revealed chrome; autoplay stays chrome-hidden. */
  const [listChromeRevealed, setListChromeRevealed] = useState(false);
  /** PV3.8.2: interactive chrome hit-testing off during bare-surface pointer session. */
  const [chromeInteractive, setChromeInteractive] = useState(true);
  const [scrubActive, setScrubActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [stallTimedOut, setStallTimedOut] = useState(false);
  const [hlsAttached, setHlsAttached] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [posterUrl, setPosterUrl] = useState(item.posterUrl);
  const [videoId, setVideoId] = useState(item.videoId);

  const expandVisible =
    showExpandControl ??
    ((mode === "detail" || isListSurface) &&
      (Boolean(onRequestMixedFullscreen) ||
        (!isListSurface && fullscreenSupported)));

  mutedRef.current = muted;

  const commitHandoffVisualSeekLock = (
    event:
      | "latch"
      | "seek-settled"
      | "restore-terminal"
      | "abandon-manual-play"
      | "stale-restore"
      | "restore-abort-keep-pending"
      | "media-identity-reset",
  ) => {
    const next = nextHandoffVisualSeekLock(
      {
        restorePending: handoffRestorePendingRef.current,
        seekSettled: handoffSeekSettledRef.current,
      },
      event,
    );
    handoffRestorePendingRef.current = next.restorePending;
    handoffSeekSettledRef.current = next.seekSettled;
    setHandoffRestorePending(next.restorePending);
    setHandoffSeekSettled(next.seekSettled);
  };

  const collectDiag = (extra: Record<string, unknown> = {}) => {
    const video = videoRef.current;
    return {
      playerId: playerIdRef.current,
      sessionId: playerIdRef.current,
      elementId: video?.dataset?.publishedVideoElementId,
      domIdentity: video ? publishedVideoObjectIdentity(video) : undefined,
      presentation: mode,
      hlsAttachCount: hlsAttachCountRef.current,
      surface: mode,
      mediaKey: item.key,
      playIntent: playIntentRef.current,
      playPending: playPendingRef.current,
      handoffGeneration:
        pendingHandoffRef.current?.generation ??
        appliedHandoffGenerationRef.current,
      restorePending: handoffRestorePendingRef.current,
      hlsLifecycle: hlsAttachedRef.current
        ? "attached"
        : hlsRef.current
          ? "instance"
          : "idle",
      isActive: isActiveRef.current,
      isWarm,
      ...publishedVideoMediaSnapshot(video, {
        hlsAttached: hlsAttachedRef.current,
        softPaused: userPausedRef.current,
        ownsPlayback: isActiveRef.current,
      }),
      ...extra,
    };
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    logPublishedVideoState("player-mount", collectDiag());
    if (handoffRestorePendingRef.current) {
      logPublishedVideoState("handoff-latched", {
        ...collectDiag({ reason: "initial" }),
      });
    }
    const playerId = playerIdRef.current;
    return () => {
      logPublishedVideoState("player-cleanup", {
        playerId,
        sessionId: playerId,
        surface: mode,
        mediaKey: item.key,
        reason: "unmount",
      });
    };
    // Mount/unmount only — do not re-run on playback prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStatus(item.status);
    setPosterUrl(item.posterUrl);
    setVideoId(item.videoId);
    if (typeof item.durationSec === "number" && item.durationSec > 0) {
      setDuration(item.durationSec);
    }
  }, [item]);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    hlsAttachedRef.current = hlsAttached;
  }, [hlsAttached]);

  const destroyHls = useCallback(() => {
    const hls = hlsRef.current;
    hlsRef.current = null;
    if (hls) {
      try {
        hls.destroy();
      } catch {
        /* ignore */
      }
    }
    hlsAttachedRef.current = false;
    setHlsAttached(false);
  }, []);

  const tearDownPlayback = useCallback(() => {
    const video = videoRef.current;
    const snap = publishedVideoMediaSnapshot(video, {
      hlsAttached: hlsAttachedRef.current,
      softPaused: userPausedRef.current,
      ownsPlayback: isActiveRef.current,
    });
    manualPlayInFlightRef.current = false;
    userWantsPlayRef.current = false;
    playIntentRef.current = "none";
    setPlayPending(false);
    if (video) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      const hadSrc = Boolean(
        video.getAttribute("src")?.trim() || video.currentSrc,
      );
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
      if (hadSrc) {
        logPublishedVideoState("src-clear", {
          mediaKey: item.key,
          reason: "teardown",
          ...snap,
        });
        logPublishedVideoState("video-load", {
          mediaKey: item.key,
          reason: "teardown",
        });
      }
    }
    if (hlsRef.current) {
      logPublishedVideoState("hls-destroy", {
        mediaKey: item.key,
        reason: "teardown",
        ...snap,
      });
    }
    destroyHls();
    setPlaying(false);
    setMediaReady(false);
    setIsBuffering(false);
    setStallTimedOut(false);
    setCurrentTime(0);
    if (isActiveRef.current) {
      logPublishedVideoState("unexpected-teardown", {
        ...collectDiag({ reason: "teardown-while-active" }),
      });
    }
    logPublishedVideoState("currentTime-set", {
      mediaKey: item.key,
      reason: "teardown",
      currentTime: 0,
    });
    logPublishedVideoState("hls-teardown", {
      mediaKey: item.key,
      reason: "teardown",
      isActive: isActiveRef.current,
      isWarm: isWarmRef.current,
      ...snap,
    });
  }, [destroyHls, item.key]);
  const tearDownPlaybackRef = useRef(tearDownPlayback);
  tearDownPlaybackRef.current = tearDownPlayback;

  const pauseVideo = useCallback(() => {
    userWantsPlayRef.current = false;
    playIntentRef.current = "none";
    setPlayPending(false);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    setPlaying(false);
  }, []);

  const pauseForListReason = useCallback(
    (reason: string): number | undefined => {
      const video = videoRef.current;
      const currentTime = video?.currentTime;
      userWantsPlayRef.current = false;
      playIntentRef.current = "none";
      setPlayPending(false);
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
      setPlaying(false);
      // Visibility auto-pause must never latch as manual user pause.
      if (reason !== "manual") {
        setLocalUserPaused(false);
        userPausedRef.current = Boolean(userPaused);
      }
      logPublishedVideoState("pause-command", {
        mediaKey: item.key,
        reason,
        isActive: isActiveRef.current,
        isWarm,
        currentTime,
        softPaused: userPausedRef.current,
        ownsPlayback: isActiveRef.current,
        ...publishedVideoMediaSnapshot(video, {
          hlsAttached: hlsAttachedRef.current,
          softPaused: userPausedRef.current,
          ownsPlayback: isActiveRef.current,
        }),
      });
      return currentTime;
    },
    [isWarm, item.key, userPaused],
  );

  useEffect(() => {
    if (!isListSurface || !registerListPlaybackPause) return;
    if (!isActive) {
      registerListPlaybackPause(null);
      return;
    }
    registerListPlaybackPause(pauseForListReason);
    return () => {
      registerListPlaybackPause(null);
    };
  }, [
    isActive,
    isListSurface,
    pauseForListReason,
    registerListPlaybackPause,
  ]);

  // Safety: leaving active always pauses (warm may retain HLS).
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!isListSurface) return;
    if (wasActive && !isActive) {
      const video = videoRef.current;
      if (video && !video.paused) {
        pauseForListReason("active-revoked");
      } else {
        userWantsPlayRef.current = false;
        playIntentRef.current = "none";
        setPlayPending(false);
        setPlaying(false);
      }
    }
  }, [isActive, isListSurface, pauseForListReason]);

  const clearChromeHide = useCallback(() => {
    if (chromeHideTimerRef.current != null) {
      window.clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
  }, []);
  const clearChromeHideRef = useRef(clearChromeHide);
  clearChromeHideRef.current = clearChromeHide;

  const revealChrome = useCallback(() => {
    // Warm is invisible — no chrome / Play / scrubber.
    if (isWarm) return;
    setChromeVisible(true);
    if (isListSurface) {
      setListChromeRevealed(true);
    }
    clearChromeHide();
    if (playing) {
      chromeHideTimerRef.current = window.setTimeout(() => {
        setChromeVisible(false);
        if (isListSurface) setListChromeRevealed(false);
      }, VIDEO_CHROME_HIDE_MS);
    }
  }, [clearChromeHide, isListSurface, isWarm, playing]);

  /** Reveal after warm→active promote (isWarm may still be true for one frame). */
  const revealChromeAllowWarm = useCallback(() => {
    setChromeVisible(true);
    if (isListSurface) {
      setListChromeRevealed(true);
    }
    clearChromeHide();
  }, [clearChromeHide, isListSurface]);

  const scheduleChromeHide = useCallback(() => {
    clearChromeHide();
    if (!playing) return;
    chromeHideTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      if (isListSurface) setListChromeRevealed(false);
    }, VIDEO_CHROME_HIDE_MS);
  }, [clearChromeHide, isListSurface, playing]);

  // Prefetch hls.js CODE only when warm or active (no media network yet for prefetch alone).
  useEffect(() => {
    if ((!isActive && !isWarm) || status !== "ready") return;
    const video = videoRef.current;
    if (!video) return;
    if (canPlayNativeHls(video)) return;
    if (hlsCtorRef.current) return;
    let cancelled = false;
    void import("hls.js").then((mod) => {
      if (cancelled) return;
      hlsCtorRef.current = mod.default;
    });
    return () => {
      cancelled = true;
    };
  }, [isActive, isWarm, status]);

  const applyPosterProvisionalDimensions = useCallback(
    (img: HTMLImageElement) => {
      if (!onVideoUpdated) return;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (
        !shouldApplyPosterProvisionalVideoDimensions({
          status,
          videoWidth: item.width,
          videoHeight: item.height,
          naturalWidth,
          naturalHeight,
        })
      ) {
        return;
      }
      if (
        posterProvisionalDimensionsAlreadyApplied({
          videoWidth: item.width,
          videoHeight: item.height,
          naturalWidth,
          naturalHeight,
        })
      ) {
        return;
      }
      onVideoUpdated({
        kind: "video",
        key: item.key,
        mediaId: item.mediaId,
        videoId,
        status,
        posterUrl,
        width: naturalWidth,
        height: naturalHeight,
        durationSec: item.durationSec,
      });
    },
    [
      item.durationSec,
      item.height,
      item.key,
      item.mediaId,
      item.width,
      onVideoUpdated,
      posterUrl,
      status,
      videoId,
    ],
  );

  // Cached posters may never fire onLoad — apply provisional dims when already complete.
  useEffect(() => {
    if (!posterUrl) return;
    if (!isPublishedVideoProcessingStatus(status)) return;
    const img = posterImgRef.current;
    if (!img || !img.complete) return;
    applyPosterProvisionalDimensions(img);
  }, [
    applyPosterProvisionalDimensions,
    posterUrl,
    status,
    item.width,
    item.height,
  ]);

  // Processing poll while active — Detail/fullscreen only (no per-card Feed storms).
  useEffect(() => {
    if (isListSurface) return;
    if (!isActive) return;
    if (
      status !== "processing" &&
      status !== "pending" &&
      status !== "uploading"
    ) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const row = await fetchPublishedPostMediaRowById(item.mediaId);
      if (cancelled || !row) return;
      setStatus(row.video_status);
      setPosterUrl(row.poster_url);
      setVideoId(row.bunny_video_id);
      const dims = mergePublishedVideoDimensions({
        existingWidth: item.width,
        existingHeight: item.height,
        incomingWidth: row.width,
        incomingHeight: row.height,
      });
      onVideoUpdated?.({
        kind: "video",
        key: item.key,
        mediaId: row.id,
        videoId: row.bunny_video_id,
        status: row.video_status,
        posterUrl: row.poster_url,
        width: dims.width,
        height: dims.height,
        durationSec: row.duration_sec,
      });
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isActive, isListSurface, item.key, item.mediaId, onVideoUpdated, status]);

  const tryPlayIfWanted = useCallback(
    async (opts?: {
      fromHandoff?: boolean;
      snapshotMuted?: boolean;
      explicitManualPlay?: boolean;
    }): Promise<"played" | "rejected" | "aborted" | "skipped"> => {
      if (!userWantsPlayRef.current) {
        setPlayPending(false);
        logPublishedVideoStateTransition(
          "play-result",
          collectDiag({ playResult: "skipped", reason: "no-intent" }),
        );
        return "skipped";
      }
      if (
        !opts?.fromHandoff &&
        shouldSuppressCompetingPlayDuringHandoff({
          restorePending: handoffRestorePendingRef.current,
          hasPendingHandoff: Boolean(pendingHandoffRef.current),
          explicitManualPlay: Boolean(opts?.explicitManualPlay),
        })
      ) {
        logPublishedVideoStateTransition(
          "play-result",
          collectDiag({ playResult: "skipped", reason: "handoff-pending" }),
        );
        return "skipped";
      }
      const video = videoRef.current;
      if (!video) {
        setPlayPending(false);
        logPublishedVideoStateTransition(
          "play-result",
          collectDiag({ playResult: "skipped", reason: "no-element" }),
        );
        return "skipped";
      }
      const intent = playIntentRef.current;
      const preferredMuted = getPublishedVideoPreferredMuted();
      const mutePlan = opts?.fromHandoff
        ? resolvePublishedVideoHandoffPlayMute({
            snapshotMuted: Boolean(opts.snapshotMuted),
            preferredMuted,
          })
        : {
            initialMuted: preferredMuted,
            allowMutedRetry: !preferredMuted,
          };
      const logBase = {
        mediaKey: item.key,
        playIntent: intent,
        isActive,
        isWarm,
      };
      const finishPlayed = (): "played" | "rejected" => {
        if (userPausedRef.current) {
          try {
            video.pause();
          } catch {
            /* ignore */
          }
          setPlaying(false);
          setPlayPending(false);
          logPublishedVideoState("play-result", {
            ...collectDiag({
              playResult: "rejected",
              reason: "user-paused-after-play",
            }),
          });
          return "rejected";
        }
        setPlaying(true);
        logPublishedVideoState(
          intent === "manual" ? "manual-play-resolved" : "manual-play-resolved",
          { ...logBase, videoPaused: video.paused, playing: true },
        );
        logPublishedVideoState("play-result", {
          ...collectDiag({ playResult: "played" }),
        });
        return "played";
      };
      logPublishedVideoState("play-attempt", {
        ...collectDiag({
          reason: opts?.fromHandoff ? "handoff" : intent,
        }),
      });
      try {
        const initialMuted = mutePlan.initialMuted;
        if (opts?.fromHandoff) {
          video.muted = initialMuted;
        } else {
          video.muted = preferredMuted;
        }
        mutedRef.current = video.muted;
        setMuted(video.muted);
        await video.play();
        return finishPlayed();
      } catch (err) {
        const kind = classifyPublishedVideoPlayError(err);
        const playErrorName = publishedVideoPlayErrorName(err);
        const retryMuted = shouldRetryPublishedVideoPlayMuted({
          errorKind: kind,
          allowMutedRetry: mutePlan.allowMutedRetry,
          alreadyRetriedMuted: false,
          currentlyMuted: mutePlan.initialMuted,
          retryAbort: Boolean(opts?.fromHandoff),
        });
        if (
          !retryMuted &&
          kind === "abort" &&
          !(
            !mutePlan.initialMuted &&
            isAutoplaySoundBlockedError(err) &&
            (intent === "autoplay" || intent === "manual")
          )
        ) {
          logPublishedVideoState("play-result", {
            ...collectDiag({
              playResult: "aborted",
              playErrorName,
              reason: "abort",
            }),
          });
          return "aborted";
        }
        if (
          retryMuted ||
          (!mutePlan.initialMuted &&
            isAutoplaySoundBlockedError(err) &&
            (intent === "autoplay" || intent === "manual"))
        ) {
          if (intent === "manual") {
            logPublishedVideoState("manual-play-rejected", {
              ...logBase,
              videoPaused: video.paused,
            });
            logPublishedVideoState("manual-muted-retry", logBase);
          }
          try {
            video.muted = true;
            mutedRef.current = true;
            setMuted(true);
            await video.play();
            const played = finishPlayed();
            if (intent === "manual" && played === "played") {
              logPublishedVideoState("manual-muted-retry-resolved", {
                ...logBase,
                videoPaused: video.paused,
                playing: true,
              });
            }
            return played;
          } catch (retryErr) {
            const retryKind = classifyPublishedVideoPlayError(retryErr);
            const retryErrorName = publishedVideoPlayErrorName(retryErr);
            if (retryKind === "abort") {
              logPublishedVideoState("play-result", {
                ...collectDiag({
                  playResult: "aborted",
                  playErrorName: retryErrorName,
                  reason: "muted-retry-abort",
                }),
              });
              return "aborted";
            }
            // Fall through to reject path.
          }
        }
        if (intent === "autoplay") {
          // Do not retry autoplay in a loop — leave poster + Play.
          autoplayRejectedRef.current = true;
          userWantsPlayRef.current = false;
          playIntentRef.current = "none";
          setPlaying(false);
          logPublishedVideoState("play-result", {
            ...collectDiag({
              playResult: "rejected",
              playErrorName,
              reason: "autoplay-rejected",
            }),
          });
          return "rejected";
        }
        // Manual failure: clear intent; do not latch pending.
        if (intent === "manual") {
          logPublishedVideoState("manual-play-rejected", {
            ...logBase,
            videoPaused: video.paused,
          });
          userWantsPlayRef.current = false;
          playIntentRef.current = "none";
          setPlaying(false);
        }
        logPublishedVideoState("play-result", {
          ...collectDiag({
            playResult: "rejected",
            playErrorName,
            reason: "play-rejected",
          }),
        });
        return "rejected";
      } finally {
        setPlayPending(false);
      }
    },
    [isActive, isWarm, item.key],
  );

  const ensureHlsLoaded = useCallback(
    async (purpose: "warm" | "active" = "active"): Promise<boolean> => {
      const video = videoRef.current;
      if (!video || !videoId.trim() || status !== "ready") {
        logPublishedVideoStateTransition(
          "hls-attach-failed",
          collectDiag({
            reason: !video
              ? "no-element"
              : !videoId.trim()
                ? "no-video-id"
                : "status-not-ready",
            hlsPurpose: purpose,
          }),
        );
        return false;
      }

      let playback;
      try {
        playback = resolvePublishedVideoPlayback({
          videoId,
          posterUrl,
        });
      } catch {
        logPublishedVideoState("hls-attach-failed", {
          ...collectDiag({ reason: "resolve-failed", hlsPurpose: purpose }),
        });
        return false;
      }

      if (canPlayNativeHls(video)) {
        // Native HLS: no speculative byte prewarm (iOS safety).
        if (purpose === "warm") return false;
        destroyHls();
        if (video.getAttribute("src") !== playback.hlsUrl) {
          video.src = playback.hlsUrl;
          hlsAttachCountRef.current += 1;
          logPublishedVideoState("src-change", {
            ...collectDiag({
              reason: "native-hls",
              hlsPurpose: purpose,
            }),
          });
        }
        hlsAttachedRef.current = true;
        setHlsAttached(true);
        logPublishedVideoState("hls-attach-native", {
          ...collectDiag({ hlsPurpose: purpose, hlsLifecycle: "attached" }),
        });
        return true;
      }

      if (!hlsCtorRef.current) {
        const mod = await import("hls.js");
        hlsCtorRef.current = mod.default;
      }
      const Hls = hlsCtorRef.current;
      if (!Hls?.isSupported?.()) {
        logPublishedVideoState("hls-attach-failed", {
          ...collectDiag({ reason: "hls-unsupported", hlsPurpose: purpose }),
        });
        return false;
      }

      // Already attached — reuse same Hls + buffered segments (warm → active).
      if (hlsRef.current && hlsAttachedRef.current) {
        if (purpose === "active") {
          logPublishedVideoState("hls-reuse", {
            mediaKey: item.key,
            isActive,
            isWarm,
          });
          const hls = hlsRef.current;
          try {
            hls.config.maxBufferLength = PUBLISHED_HLS_BUFFER.maxBufferLength;
            hls.config.maxMaxBufferLength =
              PUBLISHED_HLS_BUFFER.maxMaxBufferLength;
            hls.config.backBufferLength = PUBLISHED_HLS_BUFFER.backBufferLength;
            hls.config.lowLatencyMode = PUBLISHED_HLS_BUFFER.lowLatencyMode;
            hls.startLoad();
          } catch {
            /* ignore */
          }
        }
        return true;
      }

      destroyHls();
      const bufferCfg =
        purpose === "warm" ? PUBLISHED_HLS_WARM_BUFFER : PUBLISHED_HLS_BUFFER;
      hlsAttachCountRef.current += 1;
      logPublishedVideoState("hls-attach-start", {
        ...collectDiag({ hlsPurpose: purpose, hlsLifecycle: "attaching" }),
      });
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: bufferCfg.lowLatencyMode,
        maxBufferLength: bufferCfg.maxBufferLength,
        maxMaxBufferLength: bufferCfg.maxMaxBufferLength,
        backBufferLength: bufferCfg.backBufferLength,
      });
      hlsRef.current = hls;
      hlsNetworkRetryRef.current = 0;

      let attachSettleReason: "manifest" | "fatal" | "timeout" | null = null;
      let attachFatalType = "";
      let attachFatalDetails = "";
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = (reason: "manifest" | "fatal" | "timeout") => {
          if (settled) return;
          settled = true;
          attachSettleReason = reason;
          resolve();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, () => done("manifest"));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal) return;
          attachFatalType = String(data.type ?? "");
          attachFatalDetails =
            typeof data.details === "string" ? data.details : "";
          done("fatal");
        });
        // Safety timeout so UI never hangs forever.
        window.setTimeout(() => done("timeout"), 8000);
        hls.attachMedia(video);
        hls.loadSource(playback.hlsUrl);
      });

      if (attachSettleReason === "manifest") {
        logPublishedVideoState("hls-manifest", {
          ...collectDiag({ hlsPurpose: purpose }),
        });
      } else if (attachSettleReason === "fatal") {
        logPublishedVideoState("hls-attach-fatal", {
          ...collectDiag({
            hlsPurpose: purpose,
            hlsErrorType: attachFatalType,
            hlsErrorDetails: attachFatalDetails,
          }),
        });
      } else {
        logPublishedVideoState("hls-attach-timeout", {
          ...collectDiag({ hlsPurpose: purpose }),
        });
      }

      const failTerminal = () => {
        logPublishedVideoState("hls-attach-fatal", {
          ...collectDiag({ reason: "terminal", hlsPurpose: purpose }),
        });
        destroyHls();
        onPlaybackFailedRef.current?.();
      };

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        logPublishedVideoState("hls-fatal", {
          ...collectDiag({
            hlsErrorType: String(data.type ?? ""),
            hlsErrorDetails: typeof data.details === "string" ? data.details : "",
            hlsPurpose: purpose,
          }),
        });
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (hlsNetworkRetryRef.current < 3) {
            hlsNetworkRetryRef.current += 1;
            try {
              hls.startLoad();
            } catch {
              failTerminal();
            }
            return;
          }
          failTerminal();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
          } catch {
            failTerminal();
          }
          return;
        }
        failTerminal();
      });

      hlsAttachedRef.current = true;
      setHlsAttached(true);
      return true;
    },
    [destroyHls, isActive, isWarm, item.key, posterUrl, status, videoId],
  );

  const capturePlaybackSnapshot = useCallback(
    (generation: number): PublishedVideoPlaybackSnapshot | null => {
      const video = videoRef.current;
      const mediaKey = mediaKeyForCaptureRef.current;
      const wantsPlaying =
        !userPausedRef.current &&
        (playingRef.current ||
          userWantsPlayRef.current ||
          Boolean(video && !video.paused && !video.ended));
      return capturePublishedVideoPlaybackFromElement({
        mediaKey,
        video,
        // Prefer live element time; fall back to authoritative UI time (never invent 0).
        fallbackCurrentTime: currentTimeForCaptureRef.current,
        wantsPlaying,
        muted: mutedRef.current,
        generation,
      });
    },
    [],
  );

  // Pass 3B: parent captures sync before Detail deactivates / FS unmounts.
  // Stable callback — do NOT re-register on every timeupdate (that briefly
  // nulls Feed's capture ref and causes wrote:false handoff misses).
  useEffect(() => {
    if (!registerPlaybackCapture) return;
    registerPlaybackCapture((generation) =>
      capturePlaybackSnapshot(generation),
    );
    return () => {
      registerPlaybackCapture(null);
    };
  }, [capturePlaybackSnapshot, registerPlaybackCapture]);

  // Pass 3B/3G: latch handoff intent before autoplay can run.
  useEffect(() => {
    if (isPublishedVideoPlaybackSnapshotForMedia(playbackHandoff, item.key)) {
      let receivedReason = "accepted";
      if (!isActive) receivedReason = "inactive";
      else if (appliedHandoffGenerationRef.current === playbackHandoff.generation) {
        receivedReason = "already-applied";
      } else if (
        pendingHandoffRef.current?.generation === playbackHandoff.generation &&
        handoffRestorePendingRef.current
      ) {
        receivedReason = "already-pending";
      }
      logPublishedVideoStateTransition("handoff-received", {
        ...collectDiag({
          handoffGeneration: playbackHandoff.generation,
          reason: receivedReason,
          playIntent: playbackHandoff.wantsPlaying ? "play" : "pause",
        }),
      });
    }
    if (!isActive) {
      return;
    }
    if (!isPublishedVideoPlaybackSnapshotForMedia(playbackHandoff, item.key)) {
      return;
    }
    if (appliedHandoffGenerationRef.current === playbackHandoff.generation) {
      return;
    }
    if (
      pendingHandoffRef.current?.generation === playbackHandoff.generation &&
      handoffRestorePendingRef.current
    ) {
      return;
    }
    const ui = resolvePublishedVideoHandoffLatchUi(playbackHandoff);
    pendingHandoffRef.current = playbackHandoff;
    commitHandoffVisualSeekLock("latch");
    autoplayRejectedRef.current = false;
    autoplayGenRef.current += 1;
    setMuted(ui.muted);
    mutedRef.current = ui.muted;
    setCurrentTime(ui.currentTime);
    setPlaying(false);
    setPlayPending(ui.playPending);
    if (ui.localUserPaused) {
      setLocalUserPaused(true);
      userPausedRef.current = true;
      userWantsPlayRef.current = false;
      playIntentRef.current = "none";
    } else {
      setLocalUserPaused(false);
      userPausedRef.current = false;
      userWantsPlayRef.current = true;
      playIntentRef.current = "manual";
    }
    logPublishedVideoState("handoff-latched", {
      ...collectDiag({
        handoffGeneration: playbackHandoff.generation,
        reason: ui.localUserPaused ? "paused" : "playing",
      }),
    });
    setHandoffEpoch((n) => n + 1);
  }, [isActive, item.key, playbackHandoff]);

  // Pass 3B/3D/3G: after HLS attach, seek until settled, then restore play/pause.
  // Do not depend on playbackHandoff — parent consume must not abort in-flight restore.
  useEffect(() => {
    if (!isActive) return;
    if (status !== "ready") return;
    if (!videoId.trim()) return;
    const handoff = pendingHandoffRef.current;
    if (!isPublishedVideoPlaybackSnapshotForMedia(handoff, item.key)) return;
    if (appliedHandoffGenerationRef.current === handoff.generation) return;

    const ac = new AbortController();
    const session = ++restoreSessionRef.current;
    let cancelled = false;

    void (async () => {
      const video = videoRef.current;
      if (!video) return;

      logPublishedVideoState("handoff-restore-queued", {
        ...collectDiag({
          handoffGeneration: handoff.generation,
          restoreSession: session,
        }),
      });

      const result = await applyPublishedVideoHandoffRestore({
        video,
        snapshot: handoff,
        mediaKey: item.key,
        signal: ac.signal,
        ensureReady: () => ensureHlsLoaded("active"),
        getUserPaused: () => userPausedRef.current,
        getUserWantsPlay: () => userWantsPlayRef.current,
        onSeekSettled: (appliedTime) => {
          if (
            !shouldCommitHandoffRestoreVisualState({
              restoreSession: session,
              currentSession: restoreSessionRef.current,
            })
          ) {
            commitHandoffVisualSeekLock("stale-restore");
            return;
          }
          setCurrentTime(appliedTime);
          commitHandoffVisualSeekLock("seek-settled");
        },
        play: async () => {
          if (session !== restoreSessionRef.current) return "aborted";
          const latest = pendingHandoffRef.current;
          if (
            !isPublishedVideoPlaybackSnapshotForMedia(latest, item.key) ||
            latest.generation !== handoff.generation
          ) {
            return "aborted";
          }
          if (video.ended) {
            userWantsPlayRef.current = false;
            playIntentRef.current = "none";
            setPlaying(false);
            setPlayPending(false);
            return "rejected";
          }
          setLocalUserPaused(false);
          userPausedRef.current = false;
          userWantsPlayRef.current = true;
          playIntentRef.current = "manual";
          setPlayPending(true);
          try {
            const played = await tryPlayIfWanted({
              fromHandoff: true,
              snapshotMuted: latest.muted,
            });
            if (played === "played") return "played";
            if (played === "aborted") return "aborted";
            return "rejected";
          } catch {
            /* single attempt — no retry loop */
            if (session !== restoreSessionRef.current) return "aborted";
            userWantsPlayRef.current = false;
            playIntentRef.current = "none";
            setLocalUserPaused(true);
            userPausedRef.current = true;
            setPlaying(false);
            return "rejected";
          }
        },
      });

      if (
        !shouldCommitHandoffRestoreVisualState({
          restoreSession: session,
          currentSession: restoreSessionRef.current,
        })
      ) {
        logPublishedVideoState("handoff-restore-aborted", {
          ...collectDiag({
            handoffGeneration: result.generation,
            reason: "stale-session",
            consume: false,
          }),
        });
        commitHandoffVisualSeekLock("stale-restore");
        return;
      }

      if (cancelled || ac.signal.aborted || result.status === "aborted") {
        const disposition = resolveHandoffRestoreAbortDisposition({
          restoreSession: session,
          currentSession: restoreSessionRef.current,
        });
        logPublishedVideoState("handoff-restore-aborted", {
          ...collectDiag({
            handoffGeneration: result.generation,
            reason: cancelled ? "effect-cleanup" : result.status,
            consume: false,
            disposition,
          }),
        });
        commitHandoffVisualSeekLock("restore-abort-keep-pending");
        return;
      }
      if (result.status === "superseded") return;

      setCurrentTime(result.appliedTime);
      commitHandoffVisualSeekLock("restore-terminal");

      if (result.status === "paused") {
        setLocalUserPaused(true);
        userPausedRef.current = true;
        userWantsPlayRef.current = false;
        playIntentRef.current = "none";
        setPlaying(false);
        setPlayPending(false);
      } else if (result.status === "played") {
        setPlaying(true);
        setPlayPending(false);
      } else {
        userWantsPlayRef.current = false;
        playIntentRef.current = "none";
        setLocalUserPaused(true);
        userPausedRef.current = true;
        setPlaying(false);
        setPlayPending(false);
      }

      if (result.consume) {
        if (session !== restoreSessionRef.current) return;
        appliedHandoffGenerationRef.current = result.generation;
        pendingHandoffRef.current = null;
        onPlaybackHandoffConsumedRef.current?.(result.generation);
      }
    })();

    return () => {
      cancelled = true;
      if (restoreSessionRef.current === session) {
        restoreSessionRef.current += 1;
      }
      logPublishedVideoState("handoff-restore-abort-signal", {
        ...collectDiag({ reason: "effect-cleanup" }),
      });
      ac.abort();
    };
  }, [
    ensureHlsLoaded,
    handoffEpoch,
    isActive,
    item.key,
    status,
    tryPlayIfWanted,
    videoId,
  ]);

  // Idle (neither active nor warm): full tear down.
  useEffect(() => {
    if (!isActive && !isWarm) {
      if (
        !shouldTearDownIdlePublishedVideo({
          isActive,
          isWarm,
        })
      ) {
        return;
      }
      setLocalUserPaused(false);
      if (manualPlayInFlightRef.current) {
        logPublishedVideoState("pause-command", {
          mediaKey: item.key,
          reason: "teardown-suppressed-manual-inflight",
          isActive,
          isWarm,
          ...publishedVideoMediaSnapshot(videoRef.current, {
            hlsAttached: hlsAttachedRef.current,
            softPaused: userPausedRef.current,
            ownsPlayback: false,
          }),
        });
        return;
      }
      autoplayGenRef.current += 1;
      autoplayRejectedRef.current = false;
      tearDownPlayback();
    }
  }, [isActive, isWarm, item.key, tearDownPlayback]);

  useEffect(() => {
    // New media identity only — parent consume must not reset applied generation.
    const prevKey = lastHandoffMediaKeyRef.current;
    const reset = shouldResetAppliedHandoffGeneration({
      previousMediaKey: prevKey,
      nextMediaKey: item.key,
    });
    lastHandoffMediaKeyRef.current = item.key;
    if (!reset) return;
    logPublishedVideoState("media-key-change", {
      playerId: playerIdRef.current,
      surface: mode,
      mediaKey: item.key,
      reason: "identity",
      previousMediaKey: prevKey,
    });
    appliedHandoffGenerationRef.current = null;
    if (
      isPublishedVideoPlaybackSnapshotForMedia(
        pendingHandoffRef.current,
        item.key,
      )
    ) {
      return;
    }
    pendingHandoffRef.current = null;
    commitHandoffVisualSeekLock("media-identity-reset");
    setLocalUserPaused(false);
  }, [item.key]);

  // Invisible list warm: attach hls.js, buffer ~4s, stopLoad. Poster stays visible.
  useEffect(() => {
    if (!isListSurface) return;
    if (!isWarm || isActive) return;
    if (status !== "ready" || !videoId.trim()) return;
    if (document.hidden) return;

    const video = videoRef.current;
    if (video && canPlayNativeHls(video)) {
      // Native HLS: no speculative prewarm.
      return;
    }

    let cancelled = false;
    const listeners: {
      onProgress: (() => void) | null;
      onFragBuffered: (() => void) | null;
    } = { onProgress: null, onFragBuffered: null };

    void (async () => {
      const ok = await ensureHlsLoaded("warm");
      if (cancelled || !ok) return;
      const hls = hlsRef.current;
      const v = videoRef.current;
      const Hls = hlsCtorRef.current;
      if (!hls || !v || !Hls) return;

      const maybeStopWarmLoad = () => {
        if (cancelled) return;
        if (getBufferedAheadSec(v) < PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC) {
          return;
        }
        try {
          hls.stopLoad();
        } catch {
          /* ignore */
        }
      };

      listeners.onProgress = maybeStopWarmLoad;
      listeners.onFragBuffered = maybeStopWarmLoad;
      v.addEventListener("progress", maybeStopWarmLoad);
      hls.on(Hls.Events.FRAG_BUFFERED, maybeStopWarmLoad);
      maybeStopWarmLoad();
    })();

    return () => {
      cancelled = true;
      const v = videoRef.current;
      const hls = hlsRef.current;
      const Hls = hlsCtorRef.current;
      if (v && listeners.onProgress) {
        v.removeEventListener("progress", listeners.onProgress);
      }
      if (hls && Hls && listeners.onFragBuffered) {
        try {
          hls.off(Hls.Events.FRAG_BUFFERED, listeners.onFragBuffered);
        } catch {
          /* ignore */
        }
      }
    };
  }, [ensureHlsLoaded, isActive, isListSurface, isWarm, status, videoId]);

  // Active + ready → autoplay (skipped while user-paused, handoff restore, or manual in flight).
  useEffect(() => {
    if (!isActive) return;
    if (status !== "ready") {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "status-not-ready" }),
      );
      return;
    }
    if (!videoId.trim()) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "no-video-id" }),
      );
      return;
    }
    if (autoplayRejectedRef.current) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "autoplay-rejected" }),
      );
      return;
    }
    if (document.hidden) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "document-hidden", documentHidden: true }),
      );
      return;
    }
    if (handoffRestorePendingRef.current || pendingHandoffRef.current) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "handoff-pending" }),
      );
      return;
    }
    if (
      shouldSuppressCompetingPlayDuringHandoff({
        restorePending: handoffRestorePendingRef.current,
        hasPendingHandoff: Boolean(pendingHandoffRef.current),
      })
    ) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "handoff-suppress" }),
      );
      return;
    }
    if (isUserPaused) {
      logPublishedVideoState("autoplay-suppressed-manual", {
        mediaKey: item.key,
        reason: "user-paused",
        playIntent: playIntentRef.current,
        isActive,
        isWarm,
        ...publishedVideoMediaSnapshot(videoRef.current, {
          hlsAttached: hlsAttachedRef.current,
          softPaused: true,
          ownsPlayback: isActive,
        }),
      });
      return;
    }

    if (
      manualPlayInFlightRef.current ||
      playIntentRef.current === "manual"
    ) {
      logPublishedVideoState("autoplay-suppressed-manual", {
        mediaKey: item.key,
        playIntent: playIntentRef.current,
        isActive,
        isWarm,
        playPending,
      });
      if (isActive) manualPlayInFlightRef.current = false;
      return;
    }

    const video = videoRef.current;
    if (video && !video.paused && !video.ended) {
      logPublishedVideoStateTransition(
        "autoplay-skip",
        collectDiag({ reason: "already-playing" }),
      );
      return;
    }

    let cancelled = false;
    const gen = ++autoplayGenRef.current;
    const preferredMuted = getPublishedVideoPreferredMuted();
    playIntentRef.current = "autoplay";
    userWantsPlayRef.current = true;
    setMuted(preferredMuted);
    mutedRef.current = preferredMuted;
    setPlayPending(true);
    logPublishedVideoState("autoplay-start", collectDiag({ reason: "eligible" }));

    void (async () => {
      try {
        const ok = await ensureHlsLoaded("active");
        if (cancelled || gen !== autoplayGenRef.current) {
          logPublishedVideoStateTransition(
            "autoplay-skip",
            collectDiag({
              reason: cancelled ? "cancelled" : "generation-stale",
            }),
          );
          return;
        }
        if (!ok || !userWantsPlayRef.current) {
          if (!userWantsPlayRef.current) {
            /* pending cleared in finally */
          } else {
            userWantsPlayRef.current = false;
            playIntentRef.current = "none";
          }
          logPublishedVideoState("autoplay-skip", {
            ...collectDiag({
              reason: !ok ? "hls-not-ready" : "intent-cleared",
            }),
          });
          return;
        }
        await tryPlayIfWanted();
      } finally {
        if (gen === autoplayGenRef.current) {
          setPlayPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ensureHlsLoaded,
    isActive,
    isUserPaused,
    isWarm,
    item.key,
    status,
    tryPlayIfWanted,
    videoId,
  ]);

  useEffect(() => {
    if (isActive) {
      manualPlayInFlightRef.current = false;
    }
  }, [isActive]);

  useEffect(() => {
    mountedForTeardownRef.current = true;
    return () => {
      mountedForTeardownRef.current = false;
      autoplayGenRef.current += 1;
      const tearDown = tearDownPlaybackRef.current;
      const clearChrome = clearChromeHideRef.current;
      const schedule =
        typeof queueMicrotask === "function"
          ? queueMicrotask
          : (fn: () => void) => {
              void Promise.resolve().then(fn);
            };
      schedule(() => {
        if (
          !shouldCommitDeferredPlaybackTeardown({
            stillMounted: mountedForTeardownRef.current,
          })
        ) {
          return;
        }
        tearDown();
        clearChrome();
      });
    };
  }, []);

  // Document hidden: pause + destroy HLS; foreground re-evaluates autoplay from preference.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        logPublishedVideoState("document-hidden", {
          ...collectDiag({ reason: "visibilitychange", documentHidden: true }),
        });
        autoplayGenRef.current += 1;
        autoplayRejectedRef.current = false;
        manualPlayInFlightRef.current = false;
        tearDownPlayback();
        return;
      }
      if (!isActive || status !== "ready" || !videoId.trim()) return;
      if (autoplayRejectedRef.current) return;
      // PV3.8.4: explicit user pause survives foreground while same player stays active.
      if (userPausedRef.current) return;
      if (
        shouldSuppressCompetingPlayDuringHandoff({
          restorePending: handoffRestorePendingRef.current,
          hasPendingHandoff: Boolean(pendingHandoffRef.current),
        })
      ) {
        return;
      }
      if (
        manualPlayInFlightRef.current ||
        playIntentRef.current === "manual"
      ) {
        return;
      }
      autoplayGenRef.current += 1;
      const gen = autoplayGenRef.current;
      const preferredMuted = getPublishedVideoPreferredMuted();
      playIntentRef.current = "autoplay";
      userWantsPlayRef.current = true;
      setMuted(preferredMuted);
      mutedRef.current = preferredMuted;
      setPlayPending(true);
      void (async () => {
        try {
          const ok = await ensureHlsLoaded("active");
          if (gen !== autoplayGenRef.current) return;
          if (!ok || !userWantsPlayRef.current) {
            userWantsPlayRef.current = false;
            playIntentRef.current = "none";
            return;
          }
          await tryPlayIfWanted();
        } finally {
          if (gen === autoplayGenRef.current) setPlayPending(false);
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [
    ensureHlsLoaded,
    isActive,
    status,
    tearDownPlayback,
    tryPlayIfWanted,
    videoId,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    mediaEventSessionRef.current += 1;
    const session = mediaEventSessionRef.current;

    const onPlay = () => {
      if (mediaEventSessionRef.current !== session) return;
      setPlaying(true);
      setPlayPending(false);
    };
    const onPause = () => {
      if (mediaEventSessionRef.current !== session) return;
      setPlaying(false);
      logPublishedVideoState("media-onpause", {
        mediaKey: item.key,
        ...publishedVideoMediaSnapshot(video, {
          hlsAttached: hlsAttachedRef.current,
          softPaused: userPausedRef.current,
          ownsPlayback: isActiveRef.current,
        }),
      });
    };
    const onTime = () => {
      if (mediaEventSessionRef.current !== session) return;
      if (
        shouldIgnoreTimeupdateDuringHandoffSeek({
          restorePending: handoffRestorePendingRef.current,
          seekSettled: handoffSeekSettledRef.current,
          scrubbing: scrubbingRef.current,
        })
      ) {
        return;
      }
      setCurrentTime(video.currentTime || 0);
    };
    const onMeta = () => {
      if (mediaEventSessionRef.current !== session) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };
    const onReady = () => {
      if (mediaEventSessionRef.current !== session) return;
      setMediaReady(true);
      setIsBuffering(false);
      setStallTimedOut(false);
      if (userPausedRef.current) return;
      if (
        shouldSuppressCompetingPlayDuringHandoff({
          restorePending: handoffRestorePendingRef.current,
          hasPendingHandoff: Boolean(pendingHandoffRef.current),
        })
      ) {
        return;
      }
      if (
        playIntentRef.current === "autoplay" &&
        autoplayRejectedRef.current
      ) {
        return;
      }
      void tryPlayIfWanted();
    };
    const onWaiting = () => {
      if (mediaEventSessionRef.current !== session) return;
      setIsBuffering(true);
    };
    const onStalled = () => {
      if (mediaEventSessionRef.current !== session) return;
      setIsBuffering(true);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("canplay", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
    };
  }, [item.key, tryPlayIfWanted, videoId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const video = videoRef.current;
    if (!video) return;
    const types = [
      "play",
      "playing",
      "pause",
      "waiting",
      "stalled",
      "seeking",
      "seeked",
      "canplay",
      "error",
    ] as const;
    const onDiag = (e: Event) => {
      const mediaErrorCode =
        e.type === "error" && video.error
          ? video.error.code
          : undefined;
      logPublishedVideoStateTransition("media-event", {
        ...collectDiag({
          mediaEvent: e.type,
          mediaErrorCode,
        }),
      });
    };
    for (const type of types) {
      video.addEventListener(type, onDiag);
    }
    return () => {
      for (const type of types) {
        video.removeEventListener(type, onDiag);
      }
    };
  }, [item.key, videoId]);

  useEffect(() => {
    setIsBuffering(false);
    setStallTimedOut(false);
  }, [item.key, videoId]);

  useEffect(() => {
    const hasPlayableSource = Boolean(videoId.trim());
    const awaitingFirstFrame = resolvePublishedVideoAwaitingFirstFrame({
      statusReady: status === "ready",
      hasPlayableSource,
      mediaReady,
      handoffRestorePending,
      handoffSeekSettled,
    });
    const loadingVisible = resolveVideoPlaybackLoadingVisible({
      hasPlayableSource,
      mediaFailed:
        status === "failed" || (!videoId.trim() && status !== "ready"),
      awaitingFirstFrame,
      isBuffering,
      isPausedWithReadyFrame:
        mediaReady &&
        !playing &&
        !isBuffering &&
        !(handoffRestorePending && !handoffSeekSettled),
      isWarm,
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
  }, [
    handoffRestorePending,
    handoffSeekSettled,
    isBuffering,
    isWarm,
    mediaReady,
    playing,
    status,
    videoId,
  ]);

  useEffect(() => {
    if (!isActive) {
      setListChromeRevealed(false);
      if (isListSurface) setChromeVisible(false);
    }
  }, [isActive, isListSurface]);

  useEffect(() => {
    if (!playing) {
      if (!isListSurface) {
        setChromeVisible(true);
        clearChromeHide();
      }
      return;
    }
    if (isListSurface && !listChromeRevealed) {
      setChromeVisible(false);
      clearChromeHide();
      return;
    }
    revealChrome();
  }, [
    clearChromeHide,
    isListSurface,
    listChromeRevealed,
    playing,
    revealChrome,
  ]);

  const requestManualPause = useCallback(() => {
    const video = videoRef.current;
    const pausedAt = video?.currentTime;
    // Media first — keep active ownership (PV3.8.4).
    if (video) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }
    logPublishedVideoState("manual-pause-request", {
      mediaKey: item.key,
      playing,
      playIntent: playIntentRef.current,
      isActive,
      isWarm,
      playPending,
      softPaused: true,
      ownsPlayback: isActive,
      hlsAttached: hlsAttachedRef.current,
      pausedAt,
      ...publishedVideoMediaSnapshot(video, {
        hlsAttached: hlsAttachedRef.current,
        softPaused: true,
        ownsPlayback: isActive,
      }),
    });
    manualPlayInFlightRef.current = false;
    userWantsPlayRef.current = false;
    playIntentRef.current = "none";
    setPlayPending(false);
    setPlaying(false);
    setLocalUserPaused(true);
    userPausedRef.current = true;
    onManualPause?.();
    logPublishedVideoState("pause-command", {
      mediaKey: item.key,
      reason: "manual",
      playing: false,
      playIntent: "none",
      isActive,
      isWarm,
      playPending: false,
      softPaused: true,
      ownsPlayback: isActive,
      hlsAttached: hlsAttachedRef.current,
      ...publishedVideoMediaSnapshot(videoRef.current, {
        hlsAttached: hlsAttachedRef.current,
        softPaused: true,
        ownsPlayback: isActive,
      }),
    });
    logPublishedVideoState("manual-paused-active", {
      mediaKey: item.key,
      isActive,
      ownsPlayback: isActive,
      ...publishedVideoMediaSnapshot(videoRef.current, {
        hlsAttached: hlsAttachedRef.current,
        softPaused: true,
        ownsPlayback: isActive,
      }),
    });
  }, [isActive, isWarm, item.key, onManualPause, playPending, playing]);

  const requestManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || status !== "ready") return;
    const resumeAt = video.currentTime;
    if (isWarm) {
      logPublishedVideoState("warm-promote", {
        mediaKey: item.key,
        isActive,
        isWarm,
      });
    }

    manualPlayInFlightRef.current = true;
    autoplayRejectedRef.current = false;
    playIntentRef.current = "manual";
    userWantsPlayRef.current = true;
    setLocalUserPaused(false);
    userPausedRef.current = false;
    setPlayPending(true);

    const abandonHandoff = abandonPublishedVideoHandoffForManualPlay({
      pendingGeneration: pendingHandoffRef.current?.generation ?? null,
      restorePending: handoffRestorePendingRef.current,
      hasPendingHandoff: Boolean(pendingHandoffRef.current),
    });
    if (abandonHandoff.abandon) {
      restoreSessionRef.current += 1;
      if (abandonHandoff.appliedGeneration != null) {
        appliedHandoffGenerationRef.current = abandonHandoff.appliedGeneration;
        onPlaybackHandoffConsumedRef.current?.(
          abandonHandoff.appliedGeneration,
        );
      }
      pendingHandoffRef.current = null;
      if (abandonHandoff.releaseVisualSeekLock) {
        commitHandoffVisualSeekLock("abandon-manual-play");
      }
      logPublishedVideoState("handoff-abandoned-manual", {
        ...collectDiag({
          reason: "explicit-play",
          handoffGeneration: abandonHandoff.appliedGeneration,
        }),
      });
    }

    logPublishedVideoState("manual-play-request", {
      mediaKey: item.key,
      playing,
      playIntent: "manual",
      isActive,
      isWarm,
      playPending: true,
      resumeAt,
      softPaused: false,
      ownsPlayback: isActive,
      hlsAttached: hlsAttachedRef.current,
      ...publishedVideoMediaSnapshot(video, {
        hlsAttached: hlsAttachedRef.current,
        softPaused: false,
        ownsPlayback: isActive,
      }),
    });

    // Clears userPausedKey; reaffirms ownership if needed (same id = no tearDown).
    onRequestActivePlayback?.();
    if (isWarm) revealChromeAllowWarm();
    else revealChrome();

    const hasMedia =
      hlsAttachedRef.current ||
      Boolean(video.getAttribute("src")?.trim()) ||
      Boolean(video.currentSrc);

    if (hasMedia) {
      void tryPlayIfWanted({ explicitManualPlay: true }).finally(() => {
        setPlayPending(false);
        manualPlayInFlightRef.current = false;
        logPublishedVideoState("manual-play-resolved", {
          mediaKey: item.key,
          resumeAt,
          ...publishedVideoMediaSnapshot(videoRef.current, {
            hlsAttached: hlsAttachedRef.current,
            softPaused: false,
            ownsPlayback: isActiveRef.current,
          }),
        });
      });
      // Promote warm buffer limits only — reuse attached instance.
      void ensureHlsLoaded("active");
      return;
    }

    void (async () => {
      try {
        const ok = await ensureHlsLoaded("active");
        if (!ok || !userWantsPlayRef.current) {
          userWantsPlayRef.current = false;
          playIntentRef.current = "none";
          return;
        }
        await tryPlayIfWanted({ explicitManualPlay: true });
      } finally {
        setPlayPending(false);
        manualPlayInFlightRef.current = false;
        logPublishedVideoState("manual-play-resolved", {
          mediaKey: item.key,
          resumeAt,
          ...publishedVideoMediaSnapshot(videoRef.current, {
            hlsAttached: hlsAttachedRef.current,
            softPaused: false,
            ownsPlayback: isActiveRef.current,
          }),
        });
      }
    })();
  }, [
    ensureHlsLoaded,
    isActive,
    isWarm,
    item.key,
    onRequestActivePlayback,
    playing,
    revealChrome,
    revealChromeAllowWarm,
    status,
    tryPlayIfWanted,
  ]);

  /** Center / explicit control — authority from media element. */
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || status !== "ready") return;
    if (video.paused || video.ended) {
      requestManualPlay();
      return;
    }
    requestManualPause();
  }, [requestManualPause, requestManualPlay, status]);

  const [gestureFlash, setGestureFlash] =
    useState<PublishedVideoGestureFlash>(null);

  const gesturesEnabled = status === "ready" && Boolean(videoId.trim());

  const {
    onSurfacePointerDownCapture,
    onSurfacePointerMove,
    onSurfacePointerUp,
    onSurfacePointerCancel,
    resetPlaybackRate,
  } = usePublishedVideoSurfaceGestures({
    enabled: gesturesEnabled,
    mediaKey: item.key,
    getVideoEl: () => videoRef.current,
    getMeta: () => ({
      isActive,
      isWarm,
      ownsPlayback: isActive,
      chromeVisible: chromeVisible || listChromeRevealed,
    }),
    onRequestManualPlay: requestManualPlay,
    onRequestManualPause: requestManualPause,
    onRevealChrome: () => {
      if (isWarm) revealChromeAllowWarm();
      else revealChrome();
    },
    onSurfaceGestureStart: () => setChromeInteractive(false),
    onSurfaceGestureEnd: () => setChromeInteractive(true),
    setFlash: setGestureFlash,
  });

  useEffect(() => {
    if (!isActive || isWarm) {
      resetPlaybackRate();
    }
  }, [isActive, isWarm, resetPlaybackRate]);

  useEffect(() => {
    resetPlaybackRate();
  }, [item.key, resetPlaybackRate]);

  const captureScrubPlaybackIntent = useCallback(() => {
    const video = videoRef.current;
    scrubWantsPlayingRef.current =
      !userPausedRef.current &&
      (userWantsPlayRef.current ||
        playingRef.current ||
        Boolean(video && !video.paused && !video.ended));
    scrubIntentLatchedRef.current = true;
  }, []);

  const commitScrubSeekToFraction = useCallback(
    async (fraction: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        scrubIntentLatchedRef.current = false;
        return;
      }
      const next = Math.max(0, Math.min(1, fraction)) * video.duration;
      const gen = ++scrubSeekGenerationRef.current;
      scrubSeekAbortRef.current?.abort();
      const ac = new AbortController();
      scrubSeekAbortRef.current = ac;

      const settled = await waitForPublishedVideoSeekSettled(
        video,
        next,
        ac.signal,
      );
      if (gen !== scrubSeekGenerationRef.current) return;
      if (!settled.ok || ac.signal.aborted) return;
      if (videoRef.current !== video) return;

      setCurrentTime(settled.appliedTime);

      const action = resolvePublishedVideoSeekPlaybackAction({
        capturedWantsPlaying: scrubWantsPlayingRef.current,
        userPaused: userPausedRef.current,
        userWantsPlay: userWantsPlayRef.current,
        ended: Boolean(video.ended),
      });

      if (action === "pause") {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        // Seek must not latch as a deliberate user pause.
        if (!userPausedRef.current) {
          userWantsPlayRef.current = false;
          playIntentRef.current = "none";
        }
        setPlaying(false);
        setPlayPending(false);
        return;
      }

      userWantsPlayRef.current = true;
      if (playIntentRef.current === "none") {
        playIntentRef.current = "manual";
      }
      setPlayPending(true);
      try {
        await tryPlayIfWanted();
      } catch {
        /* single attempt — no retry loop */
        userWantsPlayRef.current = false;
        playIntentRef.current = "none";
        setPlaying(false);
      } finally {
        if (gen === scrubSeekGenerationRef.current) {
          setPlayPending(false);
        }
      }
    },
    [tryPlayIfWanted],
  );

  const onScrubInput = (
    e: ChangeEvent<HTMLInputElement>,
    commit: boolean,
  ) => {
    const fraction = Number(e.currentTarget.value) / 1000;
    if (commit) {
      // Keyboard / non-gesture commit: capture now. Pointer scrub already latched.
      if (!scrubIntentLatchedRef.current) {
        captureScrubPlaybackIntent();
      }
      scrubIntentLatchedRef.current = false;
      void commitScrubSeekToFraction(fraction);
    } else {
      setCurrentTime(fraction * (duration || 0));
    }
  };

  // Pass 3D: cancel in-flight scrub restore on media identity change / unmount.
  useEffect(() => {
    return () => {
      scrubSeekGenerationRef.current += 1;
      scrubSeekAbortRef.current?.abort();
      scrubSeekAbortRef.current = null;
    };
  }, [item.key, videoId]);

  const toggleFullscreen = async () => {
    if (onRequestMixedFullscreen) {
      revealChrome();
      onRequestMixedFullscreen();
      return;
    }
    const root = containerRef.current;
    if (!root || !fullscreenSupported) return;
    revealChrome();
    try {
      if (isCreateFinalizeVideoFullscreenElement(root)) {
        await exitCreateFinalizeVideoFullscreen();
      } else {
        const result = await requestCreateFinalizeVideoFullscreen(root);
        if (result === "entered") {
          setCreateFinalizeVideoFullscreenExitHandler(() => {
            void exitCreateFinalizeVideoFullscreen();
          });
        }
      }
    } catch {
      /* unsupported */
    }
  };

  useEffect(() => {
    const onFs = () => {
      const { isFullscreen: next, exited } = syncFullscreenChangeState({
        container: containerRef.current,
        wasFullscreen: isFullscreenRef.current,
      });
      setIsFullscreen(next);
      if (exited) restoreAndroidSystemBarsAfterVideoFullscreen();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const showPoster =
    Boolean(posterUrl) &&
    (isWarm || !mediaReady || status !== "ready");
  // PV3.8.3: once a ready frame exists, keep the <video> visible while paused
  // so manual pause shows the exact paused frame (not the poster / t=0 look).
  const showVideoFrame = resolvePublishedVideoShowVideoFrame({
    mediaReady,
    isWarm,
    status,
    restorePending: handoffRestorePending,
    seekSettled: handoffSeekSettled,
    displayTime: currentTime,
  });
  const showUnavailable =
    status === "failed" || (!videoId.trim() && status !== "ready");
  const showProcessingLabel =
    isPublishedVideoProcessingStatus(status) && !showUnavailable;
  const hasPlayableSource = Boolean(videoId.trim());
  const awaitingFirstFrame = resolvePublishedVideoAwaitingFirstFrame({
    statusReady: status === "ready",
    hasPlayableSource,
    mediaReady,
    handoffRestorePending,
    handoffSeekSettled,
  });
  const showPlaybackLoading = resolveVideoPlaybackLoadingVisible({
    hasPlayableSource,
    mediaFailed: showUnavailable,
    awaitingFirstFrame,
    isBuffering,
    isPausedWithReadyFrame:
      mediaReady &&
      !playing &&
      !isBuffering &&
      !(handoffRestorePending && !handoffSeekSettled),
    isWarm,
    stallTimedOut,
  });
  const canPlay =
    status === "ready" && Boolean(videoId.trim()) && !isWarm;
  // List passive: chrome only after deliberate reveal (or scrub / pending manual play).
  const showChrome = canPlay
    ? isListSurface
      ? listChromeRevealed || scrubActive || playPending
      : chromeVisible || !playing || playPending
    : false;
  const showCenterPlay = showChrome && (!isListSurface || listChromeRevealed);
  const showScrubber = showChrome && (!isListSurface || listChromeRevealed);
  const chromeHit =
    chromeInteractive ? "pointer-events-auto" : "pointer-events-none";
  // Center play/pause is visual + keyboard only — pointer taps use the surface FSM.
  const centerPlayHit = "pointer-events-none";
  const showTime =
    showScrubber &&
    (scrubActive || !playing || chromeVisible || listChromeRevealed);
  const playedProgress = computeVideoPlayedProgress(currentTime, duration);
  const playedPct = videoPlayedProgressCssPercent(currentTime, duration);
  const progress =
    duration > 0 ? Math.min(1000, Math.round(playedProgress * 1000)) : 0;
  const chromeIsOverlayFullscreen = mode === "fullscreen" || isFullscreen;
  const showContentRotateControl =
    Boolean(onRequestContentRotate) && chromeIsOverlayFullscreen;
  const [contentRotateStageSize, setContentRotateStageSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (contentRotateDeg === 0 && !showContentRotateControl) return;
    const stage = contentRotateStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const rect = stage.getBoundingClientRect();
      setContentRotateStageSize((prev) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stage);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [contentRotateDeg, showContentRotateControl]);

  const contentRotateFitStyle = resolveManualVideoRotateFitStyle(
    contentRotateDeg,
    contentRotateStageSize.width,
    contentRotateStageSize.height,
  );

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-black ${className}`}
      data-published-video-player
      data-published-video-mode={mode}
      data-published-video-fullscreen={isFullscreen ? "true" : undefined}
      data-published-video-content-rotate={
        contentRotateDeg !== 0 ? String(contentRotateDeg) : undefined
      }
      data-play-pending={playPending ? "true" : undefined}
      data-autoplay-muted={muted ? "true" : "false"}
      data-list-passive-chrome={isListSurface ? "true" : undefined}
      data-list-chrome-revealed={
        isListSurface && listChromeRevealed ? "true" : undefined
      }
      data-list-video-warm={isWarm ? "true" : undefined}
      data-list-video-active={isActive ? "true" : undefined}
      style={style}
    >
      <div
        className="absolute inset-0 z-[1] touch-manipulation select-none [-webkit-touch-callout:none]"
        data-published-video-gesture-surface
        onPointerDownCapture={onSurfacePointerDownCapture}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerCancel}
        aria-label={playing ? "Pause video" : "Play video"}
        role="button"
        tabIndex={-1}
      >
        <div
          ref={contentRotateStageRef}
          className="pointer-events-none absolute inset-0 overflow-hidden"
          data-published-video-content-rotate-stage
        >
          <div
            style={contentRotateFitStyle}
            data-published-video-content-rotate-layer
          >
            <video
              ref={videoRef}
              className={[
                "pointer-events-none absolute inset-0 h-full w-full object-contain bg-black",
                showVideoFrame ? "opacity-100" : "opacity-0",
              ].join(" ")}
              playsInline
              preload="none"
              poster={posterUrl ?? undefined}
              muted={muted}
              loop={isListSurface}
              onEnded={() => {
                if (!isListSurface || !isActive) return;
                const video = videoRef.current;
                if (!video) return;
                try {
                  video.currentTime = 0;
                  void video.play();
                } catch {
                  /* ignore */
                }
              }}
            />

            {showPoster ? (
              <img
                ref={posterImgRef}
                src={posterUrl!}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain bg-black"
                draggable={false}
                onLoad={(e) => {
                  applyPosterProvisionalDimensions(e.currentTarget);
                }}
              />
            ) : null}
          </div>
        </div>

        {!posterUrl && !mediaReady ? (
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            aria-hidden
          />
        ) : null}

        {showPlaybackLoading ? <VideoPlaybackLoadingSpinner /> : null}
      </div>

      {gestureFlash ? (
        <span
          className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
          aria-hidden
          data-published-video-gesture-flash={gestureFlash}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-sm font-semibold text-white backdrop-blur-sm">
            {gestureFlash === "play" ? (
              <PiPlayFill className="ml-0.5 h-5 w-5" />
            ) : gestureFlash === "pause" ? (
              <PiPauseFill className="h-5 w-5" />
            ) : (
              "2×"
            )}
          </span>
        </span>
      ) : null}

      {showUnavailable ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-end justify-center pb-8">
          <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            Video unavailable
          </span>
        </div>
      ) : null}

      {showProcessingLabel ? (
        <div
          className="pointer-events-none absolute inset-0 z-[2] flex items-end justify-center pb-8"
          data-published-video-processing
        >
          <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
            Processing video…
          </span>
        </div>
      ) : null}

      {canPlay && showChrome ? (
        <>
          <div
            className={[
              "pointer-events-none absolute z-[4] flex flex-col items-end gap-1.5 transition-opacity duration-300",
              "opacity-100",
            ].join(" ")}
            style={
              chromeIsOverlayFullscreen
                ? {
                    top: VIDEO_FULLSCREEN_CONTROLS_TOP_CSS,
                    right: VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS,
                  }
                : { top: "0.5rem", right: "0.5rem" }
            }
            data-published-video-top-chrome
          >
            <div className="flex items-start gap-1.5">
              {expandVisible ? (
                <button
                  type="button"
                  data-video-control
                  className={`${chromeHit} flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm`}
                  aria-label={
                    onRequestMixedFullscreen
                      ? "Open fullscreen viewer"
                      : isFullscreen
                        ? "Exit fullscreen"
                        : "Fullscreen"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFullscreen();
                  }}
                >
                  <PiArrowsOutSimple className="h-4 w-4" />
                </button>
              ) : null}
              <div
                className="flex flex-col items-center gap-1.5"
                data-published-video-mute-rotate-stack
              >
                <button
                  type="button"
                  data-video-control
                  data-published-video-mute
                  className={`${chromeHit} flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm`}
                  aria-label={muted ? "Unmute video" : "Mute video"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMuted((m) => {
                      const next = !m;
                      setPublishedVideoSoundPreferenceMuted(next);
                      mutedRef.current = next;
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
                {showContentRotateControl ? (
                  <button
                    type="button"
                    data-video-control
                    data-published-video-rotate
                    className={`${chromeHit} flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm`}
                    aria-label="Rotate video"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestContentRotate?.();
                    }}
                  >
                    <PiArrowClockwise className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {showCenterPlay ? (
            <button
              type="button"
              data-published-video-center-affordance
              tabIndex={0}
              className={`${centerPlayHit} absolute left-1/2 top-1/2 z-[4] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm`}
              aria-label={
                playing
                  ? "Pause video"
                  : playPending
                    ? "Loading video"
                    : "Play video"
              }
              aria-busy={playPending || undefined}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                void togglePlay();
              }}
            >
              {playing ? (
                <PiPauseFill className="h-6 w-6" />
              ) : (
                <PiPlayFill className="ml-0.5 h-6 w-6" />
              )}
            </button>
          ) : null}

          {showScrubber ? (
            <div
              data-video-control
              className={`absolute inset-x-0 z-[4] px-3 opacity-100 transition-opacity duration-300 ${chromeHit}`}
              style={{
                bottom: chromeIsOverlayFullscreen
                  ? VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS
                  : PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS,
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
                style={{ touchAction: "none" }}
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
                    scrubActive ? "video-progress-scrub__handle--active" : "",
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
                  data-video-control
                  className="video-thin-scrub pointer-events-auto absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer appearance-none bg-transparent"
                  style={
                    {
                      touchAction: "none",
                      "--progress": playedPct,
                    } as CSSProperties
                  }
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                    scrubbingRef.current = true;
                    setScrubActive(true);
                    captureScrubPlaybackIntent();
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
                  onPointerCancel={(e) => {
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
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function publishedVideoPrefersNativeHls(
  video: Pick<HTMLVideoElement, "canPlayType">,
): boolean {
  return canPlayNativeHls(video as HTMLVideoElement);
}
