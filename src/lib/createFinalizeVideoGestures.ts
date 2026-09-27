export type VideoTapZone = "left" | "center" | "right";

export const VIDEO_TAP_ZONE_LEFT_MAX = 0.35;
export const VIDEO_TAP_ZONE_RIGHT_MIN = 0.65;
export const VIDEO_DOUBLE_TAP_WINDOW_MS = 300;
export const VIDEO_LONG_PRESS_MS = 450;
export const VIDEO_SEEK_DELTA_SEC = 3;
export const VIDEO_CHROME_HIDE_MS = 2500;
export const VIDEO_PLAYBACK_RATE_FAST = 2;
/** Horizontal movement that classifies the pointer as a carousel slide, not a tap. */
export const VIDEO_SLIDE_GESTURE_THRESHOLD_PX = 10;
/** Any movement above this cancels pending hold-2x. */
export const VIDEO_LONG_PRESS_STATIONARY_PX = 6;

export type HeroPointerGestureKind = "undecided" | "slide" | "other";

export function getVideoTapZone(fractionX: number): VideoTapZone {
  if (fractionX < VIDEO_TAP_ZONE_LEFT_MAX) return "left";
  if (fractionX > VIDEO_TAP_ZONE_RIGHT_MIN) return "right";
  return "center";
}

export function clampVideoTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(time, duration));
}

export function computeDoubleTapSeekTime(
  direction: "back" | "forward",
  currentTime: number,
  duration: number,
  deltaSec = VIDEO_SEEK_DELTA_SEC,
): number {
  const delta = direction === "back" ? -deltaSec : deltaSec;
  return clampVideoTime(currentTime + delta, duration);
}

export function isDoubleTap(
  prevTimeMs: number | null,
  nowMs: number,
  windowMs = VIDEO_DOUBLE_TAP_WINDOW_MS,
): boolean {
  if (prevTimeMs == null) return false;
  return nowMs - prevTimeMs <= windowMs;
}

export function canUseVideoFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled !== false;
}

/**
 * Fraction of video played for scrubber fill (0–1).
 * Safe when duration/currentTime are unknown or non-finite.
 */
export function computeVideoPlayedProgress(
  currentTime: number,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(currentTime) || currentTime <= 0) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

export function videoPlayedProgressCssPercent(
  currentTime: number,
  duration: number,
): string {
  return `${computeVideoPlayedProgress(currentTime, duration) * 100}%`;
}

export function classifyHeroPointerGesture(
  dx: number,
  dy: number,
  slideThresholdPx = VIDEO_SLIDE_GESTURE_THRESHOLD_PX,
): HeroPointerGestureKind {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < slideThresholdPx && absY < slideThresholdPx) return "undecided";
  if (absX >= slideThresholdPx && absX >= absY) return "slide";
  return "other";
}

export function exceedsStationaryThreshold(
  dx: number,
  dy: number,
  stationaryPx = VIDEO_LONG_PRESS_STATIONARY_PX,
): boolean {
  return Math.hypot(dx, dy) >= stationaryPx;
}

/** Tap / double-tap / hold-2x only when the pointer never became a horizontal slide. */
export function shouldCommitVideoTapGestures(
  kind: HeroPointerGestureKind,
): boolean {
  return kind !== "slide";
}

/**
 * Touch inside Swiper often fires `pointerleave` after a valid `pointerup`.
 * Leave must not wipe a scheduled tap / double-tap.
 */
export function shouldAbortPendingVideoTapOnPointerLeave(): boolean {
  return false;
}

export function shouldAbortPendingVideoTapOnPointerCancel(): boolean {
  return true;
}

export type PendingVideoTapState = {
  singleTapScheduled: boolean;
  lastTap: { time: number; zone: VideoTapZone } | null;
  holdArmed: boolean;
  holdActive: boolean;
};

export function applyPointerLeaveToPendingVideoTap(
  pending: PendingVideoTapState,
): PendingVideoTapState {
  if (!shouldAbortPendingVideoTapOnPointerLeave()) return pending;
  return {
    singleTapScheduled: false,
    lastTap: null,
    holdArmed: false,
    holdActive: false,
  };
}

export function applyPointerCancelToPendingVideoTap(
  pending: PendingVideoTapState,
): PendingVideoTapState {
  if (!shouldAbortPendingVideoTapOnPointerCancel()) return pending;
  return {
    singleTapScheduled: false,
    lastTap: null,
    holdArmed: false,
    holdActive: false,
  };
}

export type VideoPointerUpOutcome =
  | { action: "playpause" }
  | { action: "seek"; direction: "back" | "forward" }
  | { action: "end-hold" }
  | { action: "none" };

export function resolveVideoPointerUp(params: {
  kind: HeroPointerGestureKind;
  holdActive: boolean;
  zone: VideoTapZone;
  lastTap: { time: number; zone: VideoTapZone } | null;
  now: number;
}): VideoPointerUpOutcome {
  if (!shouldCommitVideoTapGestures(params.kind)) {
    return { action: "none" };
  }
  if (params.holdActive) {
    return { action: "end-hold" };
  }
  if (
    (params.zone === "left" || params.zone === "right") &&
    params.lastTap &&
    params.lastTap.zone === params.zone &&
    isDoubleTap(params.lastTap.time, params.now)
  ) {
    return {
      action: "seek",
      direction: params.zone === "left" ? "back" : "forward",
    };
  }
  return { action: "playpause" };
}
