/**
 * DEV-only published video playback state traces (PV3.8.1+).
 * No URLs / user ids / secrets.
 */

export type PublishedVideoStateLogFields = {
  mediaKey?: string;
  playerId?: string;
  surface?: string;
  videoPaused?: boolean;
  playing?: boolean;
  playIntent?: string;
  isActive?: boolean;
  isWarm?: boolean;
  playPending?: boolean;
  userPaused?: boolean | string | null;
  manualForce?: boolean | string | null;
  reason?: string;
  currentTime?: number;
  duration?: number;
  readyState?: number;
  networkState?: number;
  seeking?: boolean;
  srcPresent?: boolean;
  hlsAttached?: boolean;
  hlsLifecycle?: string;
  softPaused?: boolean;
  ownsPlayback?: boolean;
  handoffGeneration?: number | null;
  restorePending?: boolean;
  mediaEvent?: string;
  playErrorName?: string;
  playResult?: string;
  [key: string]: unknown;
};

let playerInstanceSeq = 0;
const lastTransitionByKey = new Map<string, string>();

/** Opaque per-mount player id (`vp-1`, `vp-2`, …). Not a media/user id. */
export function nextPublishedVideoPlayerInstanceId(): string {
  playerInstanceSeq += 1;
  return `vp-${playerInstanceSeq}`;
}

export function publishedVideoPlayErrorName(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : "Error";
}

/** Compact media snapshot for pause/resume forensics (no URLs). */
export function publishedVideoMediaSnapshot(
  video: HTMLVideoElement | null | undefined,
  extra: {
    hlsAttached?: boolean;
    softPaused?: boolean;
    ownsPlayback?: boolean;
  } = {},
): PublishedVideoStateLogFields {
  if (!video) {
    return {
      videoPaused: true,
      currentTime: 0,
      duration: 0,
      readyState: 0,
      networkState: 0,
      seeking: false,
      srcPresent: false,
      ...extra,
    };
  }
  let seeking = false;
  try {
    seeking = Boolean(video.seeking);
  } catch {
    seeking = false;
  }
  let srcPresent = false;
  try {
    srcPresent = Boolean(
      (typeof video.getAttribute === "function"
        ? video.getAttribute("src")?.trim()
        : "") || video.currentSrc,
    );
  } catch {
    srcPresent = Boolean(video.currentSrc);
  }
  return {
    videoPaused: video.paused,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    readyState: video.readyState,
    networkState: video.networkState,
    seeking,
    srcPresent,
    ...extra,
  };
}

export function logPublishedVideoState(
  event: string,
  fields: PublishedVideoStateLogFields = {},
): void {
  if (!import.meta.env.DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.info("[echotoo video state]", {
      t: typeof performance !== "undefined" ? performance.now() : Date.now(),
      event,
      ...fields,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Same as logPublishedVideoState, but drops consecutive identical transitions
 * (waiting/stalled/skip loops). Does not log currentTime in the fingerprint.
 */
export function logPublishedVideoStateTransition(
  event: string,
  fields: PublishedVideoStateLogFields = {},
): void {
  if (!import.meta.env.DEV) return;
  const key = String(fields.playerId || fields.mediaKey || event);
  const fingerprint = [
    event,
    fields.reason ?? "",
    fields.mediaEvent ?? "",
    fields.playResult ?? "",
    fields.hlsLifecycle ?? "",
    fields.readyState ?? "",
    fields.networkState ?? "",
    fields.videoPaused ?? "",
    fields.seeking ?? "",
    fields.playIntent ?? "",
    fields.handoffGeneration ?? "",
  ].join("|");
  if (lastTransitionByKey.get(key) === fingerprint) return;
  lastTransitionByKey.set(key, fingerprint);
  logPublishedVideoState(event, fields);
}

export function __resetPublishedVideoStateLogForTests(): void {
  playerInstanceSeq = 0;
  lastTransitionByKey.clear();
}
