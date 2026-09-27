/**
 * Pass 3G — published video handoff restore lifecycle (Detail ↔ fullscreen,
 * list ↔ Detail). Pure helpers + one seek-then-play pipeline.
 * Snapshot restore contract is implemented; Feed↔Detail physical continuity
 * remains deferred product work.
 */

import type { PublishedVideoPlaybackSnapshot } from "./publishedVideoPlaybackSnapshot";
import {
  isPublishedVideoPlaybackSnapshotForMedia,
  resolvePublishedVideoSeekPlaybackAction,
  waitForPublishedVideoCanSeek,
  waitForPublishedVideoSeekSettled,
} from "./publishedVideoPlaybackSnapshot";
import {
  logPublishedVideoState,
  publishedVideoMediaSnapshot,
} from "./publishedVideoStateLog";

export type PublishedVideoHandoffLatchUi = {
  currentTime: number;
  muted: boolean;
  playing: false;
  playPending: boolean;
  localUserPaused: boolean;
};

export type PublishedVideoHandoffRestoreStatus =
  | "paused"
  | "played"
  | "failed"
  | "aborted"
  | "superseded";

export type PublishedVideoHandoffRestoreResult = {
  status: PublishedVideoHandoffRestoreStatus;
  appliedTime: number;
  generation: number;
  /** True only after play/pause finished or failed definitively. */
  consume: boolean;
};

export function resolvePublishedVideoHandoffLatchUi(
  snapshot: PublishedVideoPlaybackSnapshot,
): PublishedVideoHandoffLatchUi {
  const currentTime =
    typeof snapshot.currentTime === "number" &&
    Number.isFinite(snapshot.currentTime) &&
    snapshot.currentTime >= 0
      ? snapshot.currentTime
      : 0;
  return {
    currentTime,
    muted: Boolean(snapshot.muted),
    playing: false,
    playPending: Boolean(snapshot.wantsPlaying),
    localUserPaused: !snapshot.wantsPlaying,
  };
}

export function shouldSuppressCompetingPlayDuringHandoff(options: {
  restorePending: boolean;
  hasPendingHandoff: boolean;
  /** Explicit Play control — must not stay blocked by an abandoned restore. */
  explicitManualPlay?: boolean;
}): boolean {
  if (options.explicitManualPlay) return false;
  return options.restorePending || options.hasPendingHandoff;
}

/**
 * Pass 3H — Strict Mode cleanup/replay keeps stillMounted true before a
 * deferred unmount teardown microtask. Genuine unmount does not remount.
 */
export function shouldCommitDeferredPlaybackTeardown(options: {
  stillMounted: boolean;
}): boolean {
  return !options.stillMounted;
}

export function shouldTearDownIdlePublishedVideo(options: {
  isActive: boolean;
  isWarm: boolean;
}): boolean {
  return !options.isActive && !options.isWarm;
}

export type HandoffRestoreAbortDisposition = "ignore-stale" | "keep-pending";

/**
 * Aborted restore must not latch user-pause or consume on unmount.
 * A newer session owns the player; stale async work must not mutate it.
 */
export function resolveHandoffRestoreAbortDisposition(options: {
  restoreSession: number;
  currentSession: number;
}): HandoffRestoreAbortDisposition {
  if (options.restoreSession !== options.currentSession) return "ignore-stale";
  return "keep-pending";
}

export function abandonPublishedVideoHandoffForManualPlay(options: {
  pendingGeneration: number | null;
  restorePending: boolean;
  hasPendingHandoff: boolean;
}): {
  abandon: boolean;
  appliedGeneration: number | null;
  /** Pass 3I: drop hide-until-seek so recovered play() can paint. */
  releaseVisualSeekLock: boolean;
} {
  if (!options.restorePending && !options.hasPendingHandoff) {
    return {
      abandon: false,
      appliedGeneration: null,
      releaseVisualSeekLock: false,
    };
  }
  return {
    abandon: true,
    appliedGeneration:
      typeof options.pendingGeneration === "number" &&
      Number.isFinite(options.pendingGeneration)
        ? options.pendingGeneration
        : null,
    releaseVisualSeekLock: true,
  };
}

export type HandoffVisualSeekLockState = {
  restorePending: boolean;
  seekSettled: boolean;
};

/**
 * Pass 3I — visual hide-until-seek lock transitions.
 * Stale restore and abort-keep-pending must not re-hide a recovered player.
 */
export function nextHandoffVisualSeekLock(
  current: HandoffVisualSeekLockState,
  event:
    | "latch"
    | "seek-settled"
    | "restore-terminal"
    | "abandon-manual-play"
    | "stale-restore"
    | "restore-abort-keep-pending"
    | "media-identity-reset",
): HandoffVisualSeekLockState {
  switch (event) {
    case "latch":
      return { restorePending: true, seekSettled: false };
    case "seek-settled":
      return { restorePending: current.restorePending, seekSettled: true };
    case "restore-terminal":
      return { restorePending: false, seekSettled: true };
    case "abandon-manual-play":
      return { restorePending: false, seekSettled: true };
    case "media-identity-reset":
      return { restorePending: false, seekSettled: true };
    case "stale-restore":
    case "restore-abort-keep-pending":
      return current;
  }
}

/** Only the live restore session may mutate visual seek lock / display time. */
export function shouldCommitHandoffRestoreVisualState(options: {
  restoreSession: number;
  currentSession: number;
}): boolean {
  return options.restoreSession === options.currentSession;
}

/**
 * Paint the decoded video only when media can show a frame and hide-until-seek
 * is not holding the wrong timestamp.
 */
export function resolvePublishedVideoShowVideoFrame(options: {
  mediaReady: boolean;
  isWarm: boolean;
  status: string;
  restorePending: boolean;
  seekSettled: boolean;
  displayTime: number;
}): boolean {
  if (!options.mediaReady || options.isWarm || options.status !== "ready") {
    return false;
  }
  return !shouldHideVideoFrameUntilHandoffSeek({
    restorePending: options.restorePending,
    seekSettled: options.seekSettled,
    displayTime: options.displayTime,
  });
}

export function shouldIgnoreTimeupdateDuringHandoffSeek(options: {
  restorePending: boolean;
  seekSettled: boolean;
  scrubbing: boolean;
}): boolean {
  if (options.scrubbing) return true;
  return options.restorePending && !options.seekSettled;
}

/** Applied generation resets only when media identity changes — not when the prop is consumed. */
export function shouldResetAppliedHandoffGeneration(options: {
  previousMediaKey: string;
  nextMediaKey: string;
}): boolean {
  return options.previousMediaKey !== options.nextMediaKey;
}

export function shouldHideVideoFrameUntilHandoffSeek(options: {
  restorePending: boolean;
  seekSettled: boolean;
  displayTime: number;
}): boolean {
  if (!options.restorePending || options.seekSettled) return false;
  return options.displayTime > 0.35;
}

export type PublishedVideoPlayErrorKind = "abort" | "not-allowed" | "other";

export function classifyPublishedVideoPlayError(
  err: unknown,
): PublishedVideoPlayErrorKind {
  if (!err || typeof err !== "object") return "other";
  const name = String((err as { name?: unknown }).name ?? "");
  if (name === "AbortError") return "abort";
  if (name === "NotAllowedError") return "not-allowed";
  return "other";
}

export function resolvePublishedVideoHandoffPlayMute(options: {
  snapshotMuted: boolean;
  preferredMuted: boolean;
}): { initialMuted: boolean; allowMutedRetry: boolean } {
  return {
    initialMuted: options.snapshotMuted,
    allowMutedRetry: !options.snapshotMuted,
  };
}

/**
 * One muted retry for policy blocks / aborted unmuted play. Never loops.
 */
export function shouldRetryPublishedVideoPlayMuted(options: {
  errorKind: PublishedVideoPlayErrorKind;
  allowMutedRetry: boolean;
  alreadyRetriedMuted: boolean;
  currentlyMuted: boolean;
  /** Handoff only: AbortError from a competing play() gets one muted retry. */
  retryAbort?: boolean;
}): boolean {
  if (options.alreadyRetriedMuted) return false;
  if (!options.allowMutedRetry) return false;
  if (options.currentlyMuted) return false;
  if (options.errorKind === "not-allowed" || options.errorKind === "other") {
    return true;
  }
  return options.errorKind === "abort" && Boolean(options.retryAbort);
}

export async function applyPublishedVideoHandoffRestore(options: {
  video: HTMLVideoElement;
  snapshot: PublishedVideoPlaybackSnapshot;
  mediaKey: string;
  signal: AbortSignal;
  ensureReady: () => Promise<boolean>;
  getUserPaused: () => boolean;
  getUserWantsPlay: () => boolean;
  play: () => Promise<"played" | "rejected" | "aborted">;
  onSeekSettled?: (appliedTime: number) => void;
}): Promise<PublishedVideoHandoffRestoreResult> {
  const generation = options.snapshot.generation;
  const fail = (
    status: PublishedVideoHandoffRestoreStatus,
    appliedTime: number,
    consume: boolean,
  ): PublishedVideoHandoffRestoreResult => {
    logPublishedVideoState("handoff-restore-result", {
      mediaKey: options.mediaKey,
      handoffGeneration: generation,
      reason: status,
      currentTime: appliedTime,
      consume,
      ...publishedVideoMediaSnapshot(options.video),
    });
    return {
      status,
      appliedTime,
      generation,
      consume,
    };
  };

  const elementSnap = publishedVideoMediaSnapshot(options.video);
  logPublishedVideoState("handoff-restore-start", {
    mediaKey: options.mediaKey,
    handoffGeneration: generation,
    playIntent: options.snapshot.wantsPlaying ? "play" : "pause",
    ...elementSnap,
    snapshotCurrentTime: options.snapshot.currentTime,
    elementCurrentTime: elementSnap.currentTime,
  });

  if (!isPublishedVideoPlaybackSnapshotForMedia(options.snapshot, options.mediaKey)) {
    return fail("superseded", 0, false);
  }
  if (options.signal.aborted) return fail("aborted", 0, false);

  const ready = await options.ensureReady();
  if (options.signal.aborted) return fail("aborted", 0, false);
  if (!ready) return fail("failed", options.snapshot.currentTime, true);

  const canSeek = await waitForPublishedVideoCanSeek(
    options.video,
    options.signal,
  );
  if (options.signal.aborted) {
    return fail("aborted", options.snapshot.currentTime, false);
  }
  if (!canSeek) return fail("failed", options.snapshot.currentTime, true);

  const settled = await waitForPublishedVideoSeekSettled(
    options.video,
    options.snapshot.currentTime,
    options.signal,
  );
  if (options.signal.aborted) {
    return fail("aborted", settled.appliedTime, false);
  }
  if (!settled.ok) return fail("failed", settled.appliedTime, true);
  logPublishedVideoState("handoff-seek-settled", {
    mediaKey: options.mediaKey,
    handoffGeneration: generation,
    currentTime: settled.appliedTime,
    ...publishedVideoMediaSnapshot(options.video),
  });
  options.onSeekSettled?.(settled.appliedTime);

  const action = resolvePublishedVideoSeekPlaybackAction({
    capturedWantsPlaying: options.snapshot.wantsPlaying,
    userPaused: options.getUserPaused(),
    userWantsPlay: options.getUserWantsPlay(),
    ended: Boolean(options.video.ended),
  });

  if (action === "pause") {
    try {
      options.video.pause();
    } catch {
      /* ignore */
    }
    return fail("paused", settled.appliedTime, true);
  }

  const playResult = await options.play();
  if (options.signal.aborted) {
    return fail("aborted", settled.appliedTime, false);
  }
  if (playResult === "played") {
    return fail("played", settled.appliedTime, true);
  }
  // Competing play() AbortError is a definitive failure after the play path
  // already applied its bounded muted retry — consume so we never loop.
  return fail("failed", settled.appliedTime, true);
}
