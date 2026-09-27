/**
 * Pass 3B — playback continuity snapshot between Detail and fullscreen players.
 * Local handoff only (no global store). Validates mediaKey + generation.
 */

export type PublishedVideoPlaybackSnapshot = {
  mediaKey: string;
  currentTime: number;
  wantsPlaying: boolean;
  muted: boolean;
  /** Monotonic token — stale async restores must ignore older generations. */
  generation: number;
};

export function createPublishedVideoPlaybackSnapshot(options: {
  mediaKey: string;
  currentTime: number;
  wantsPlaying: boolean;
  muted: boolean;
  generation: number;
}): PublishedVideoPlaybackSnapshot | null {
  const mediaKey = options.mediaKey?.trim();
  if (!mediaKey) return null;
  const currentTime =
    typeof options.currentTime === "number" &&
    Number.isFinite(options.currentTime) &&
    options.currentTime >= 0
      ? options.currentTime
      : 0;
  return {
    mediaKey,
    currentTime,
    wantsPlaying: Boolean(options.wantsPlaying),
    muted: Boolean(options.muted),
    generation:
      typeof options.generation === "number" &&
      Number.isFinite(options.generation)
        ? options.generation
        : 0,
  };
}

/** Capture from a live video element + player intent. */
export function capturePublishedVideoPlaybackFromElement(options: {
  mediaKey: string;
  video: HTMLVideoElement | null | undefined;
  /** Fallback when element time is unavailable. */
  fallbackCurrentTime?: number;
  wantsPlaying: boolean;
  muted: boolean;
  generation: number;
}): PublishedVideoPlaybackSnapshot | null {
  const mediaKey = options.mediaKey?.trim();
  if (!mediaKey) return null;
  const video = options.video;
  let currentTime = 0;
  if (video && Number.isFinite(video.currentTime) && video.currentTime >= 0) {
    currentTime = video.currentTime;
  } else if (
    typeof options.fallbackCurrentTime === "number" &&
    Number.isFinite(options.fallbackCurrentTime) &&
    options.fallbackCurrentTime >= 0
  ) {
    currentTime = options.fallbackCurrentTime;
  }
  return createPublishedVideoPlaybackSnapshot({
    mediaKey,
    currentTime,
    wantsPlaying: options.wantsPlaying,
    muted: options.muted,
    generation: options.generation,
  });
}

export function isPublishedVideoPlaybackSnapshotForMedia(
  snapshot: PublishedVideoPlaybackSnapshot | null | undefined,
  mediaKey: string,
): snapshot is PublishedVideoPlaybackSnapshot {
  if (!snapshot) return false;
  const key = mediaKey?.trim();
  return Boolean(key) && snapshot.mediaKey === key;
}

/** Clamp seek into seekable ranges when available; otherwise keep non-negative finite. */
export function clampPublishedVideoSeekTime(
  video: HTMLVideoElement,
  requestedTime: number,
): number {
  const t =
    typeof requestedTime === "number" && Number.isFinite(requestedTime)
      ? Math.max(0, requestedTime)
      : 0;
  try {
    if (video.seekable && video.seekable.length > 0) {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return Math.min(Math.max(t, start), end);
      }
    }
  } catch {
    /* ignore */
  }
  if (
    Number.isFinite(video.duration) &&
    video.duration > 0 &&
    t > video.duration
  ) {
    return video.duration;
  }
  return t;
}

/**
 * Resolve when the element can accept seeking (metadata / seekable).
 * AbortSignal cancels without arbitrary timeouts.
 */
export function waitForPublishedVideoCanSeek(
  video: HTMLVideoElement,
  signal?: AbortSignal | null,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  const canSeekNow = (): boolean => {
    try {
      if (video.seekable && video.seekable.length > 0) return true;
    } catch {
      /* ignore */
    }
    return video.readyState >= HTMLMediaElement.HAVE_METADATA;
  };
  if (canSeekNow()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("durationchange", onReady);
      signal?.removeEventListener("abort", onAbort);
      resolve(ok);
    };
    const onReady = () => {
      if (canSeekNow()) finish(true);
    };
    const onAbort = () => finish(false);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("durationchange", onReady);
    signal?.addEventListener("abort", onAbort, { once: true });
    // Re-check in case metadata arrived between schedule and listeners.
    if (canSeekNow()) finish(true);
  });
}

export function applyPublishedVideoCurrentTime(
  video: HTMLVideoElement,
  requestedTime: number,
): number {
  const next = clampPublishedVideoSeekTime(video, requestedTime);
  try {
    video.currentTime = next;
  } catch {
    /* ignore seek errors */
  }
  return next;
}

/** How close currentTime must be to treat a seek as settled / no-op. */
export const PUBLISHED_VIDEO_SEEK_SETTLE_EPSILON_SEC = 0.35;

export function isPublishedVideoSeekNearTime(
  video: HTMLVideoElement,
  targetTime: number,
  epsilonSec: number = PUBLISHED_VIDEO_SEEK_SETTLE_EPSILON_SEC,
): boolean {
  if (!Number.isFinite(targetTime) || !Number.isFinite(epsilonSec)) return false;
  try {
    const t = video.currentTime;
    if (!Number.isFinite(t)) return false;
    return Math.abs(t - targetTime) <= epsilonSec;
  } catch {
    return false;
  }
}

/**
 * Pass 3D — after assigning currentTime, wait until seeking settles.
 * Resolves immediately when the seek is a no-op or already complete.
 * AbortSignal cancels; no wall-clock timeouts.
 */
export function waitForPublishedVideoSeekSettled(
  video: HTMLVideoElement,
  requestedTime: number,
  signal?: AbortSignal | null,
): Promise<{ ok: boolean; appliedTime: number }> {
  const appliedTime = applyPublishedVideoCurrentTime(video, requestedTime);
  if (signal?.aborted) {
    return Promise.resolve({ ok: false, appliedTime });
  }

  const settledNow = (): boolean => {
    try {
      if (video.seeking) return false;
    } catch {
      /* treat as not seeking */
    }
    return isPublishedVideoSeekNearTime(video, appliedTime);
  };

  if (settledNow()) {
    return Promise.resolve({ ok: true, appliedTime });
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      resolve({ ok, appliedTime });
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    // Seek may complete synchronously, or never enter seeking for a no-op.
    queueMicrotask(() => {
      if (!done && settledNow()) finish(true);
    });
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (!done && settledNow()) finish(true);
      });
    }
  });
}

/**
 * Pass 3D — final play/pause after a scrub or handoff seek settles.
 * Deliberate user pause wins; ended media must not restart via play().
 */
export function resolvePublishedVideoSeekPlaybackAction(options: {
  capturedWantsPlaying: boolean;
  userPaused: boolean;
  userWantsPlay: boolean;
  ended: boolean;
}): "play" | "pause" {
  if (options.userPaused) return "pause";
  if (options.ended) return "pause";
  if (options.capturedWantsPlaying || options.userWantsPlay) return "play";
  return "pause";
}
