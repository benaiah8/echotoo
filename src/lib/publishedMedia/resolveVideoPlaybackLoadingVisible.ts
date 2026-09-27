/**
 * When to show the shared video playback loading spinner.
 * Distinct from Create file-ingest / prepare progress (PreviewUploadOverlayPill).
 */

export const VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS = 25_000;

export type ResolveVideoPlaybackLoadingVisibleInput = {
  /** HLS id / object URL / convertFileSrc present. */
  hasPlayableSource: boolean;
  /** Failed / unavailable media — show error UI instead. */
  mediaFailed: boolean;
  /** Still waiting for first decodable frame (e.g. !mediaReady). */
  awaitingFirstFrame: boolean;
  /** Actively buffering after a first frame (waiting/stalled). */
  isBuffering: boolean;
  /**
   * Ready frame exists and playback is paused intentionally.
   * Never show a spinner solely because a ready video is paused.
   */
  isPausedWithReadyFrame: boolean;
  /** Invisible list warm — never paint chrome/spinner. */
  isWarm?: boolean;
  /** Stall watchdog fired — hide spinner so it cannot conceal a stuck load. */
  stallTimedOut?: boolean;
};

/**
 * First-frame / handoff-seek gate for published players.
 * Handoff restore with an incomplete seek is treated as awaiting a frame.
 */
export function resolvePublishedVideoAwaitingFirstFrame(options: {
  statusReady: boolean;
  hasPlayableSource: boolean;
  mediaReady: boolean;
  handoffRestorePending: boolean;
  handoffSeekSettled: boolean;
}): boolean {
  if (!options.statusReady || !options.hasPlayableSource) return false;
  if (!options.mediaReady) return true;
  if (options.handoffRestorePending && !options.handoffSeekSettled) {
    return true;
  }
  return false;
}

/**
 * True while awaiting the first playable frame or actively rebuffering.
 * False for paused-ready, warm, failed, missing source, or stall timeout.
 * Awaiting-first-frame / buffering wins over paused-ready (handoff seek).
 */
export function resolveVideoPlaybackLoadingVisible(
  options: ResolveVideoPlaybackLoadingVisibleInput,
): boolean {
  if (!options.hasPlayableSource) return false;
  if (options.mediaFailed) return false;
  if (options.isWarm) return false;
  if (options.stallTimedOut) return false;
  if (options.awaitingFirstFrame || options.isBuffering) return true;
  if (options.isPausedWithReadyFrame) return false;
  return false;
}
