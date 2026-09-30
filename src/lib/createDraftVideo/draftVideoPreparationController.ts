/**
 * Single-flight Create preparation orchestrator (PASS C3).
 * Owns job identity so React re-renders cannot duplicate Media3 jobs.
 */

import { EchoVideoPrepare } from "../../plugins/echoVideoPrepare";
import { ECHO_VIDEO_PREPARE_ERROR } from "../../plugins/echoVideoPrepare/errors";
import { isCreateVideoResolutionOverLimit } from "./createVideoResolutionConstraints";
import type { VideoPreparationPolicyResult } from "./createVideoPreparationPolicy";
import {
  isNativeEchoVideoPrepareAvailable,
  prepareDraftVideo,
} from "./prepareDraftVideo";
import type { DraftVideo } from "./types";
import { readDraftVideoMeta, writeDraftVideoMeta } from "./draftVideoMeta";
import { PREPARE_FAILED_USER_MESSAGE } from "./createVideoPreparationConstants";
import { VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE } from "./createVideoConstraints";
import { markPrepareFailed, markPreparing } from "./videoPreparationState";

export type DraftVideoPreparationCallbacks = {
  /** Persist draft meta and refresh any UI that reads preparationStatus. */
  onDraftUpdated: (draft: DraftVideo) => void;
  /** Show prepare_failed user copy once. Optional errorCode for structured toasts. */
  onPrepareFailedUserMessage?: (message: string, errorCode?: string) => void;
};

/**
 * Never let a superseded/cancelled prepare generation overwrite the current
 * draft meta (replace race: old onProgress/completion must not clobber new source).
 */
function writeDraftMetaIfCurrentGeneration(draft: DraftVideo): boolean {
  const current = readDraftVideoMeta();
  if (current && current.localId !== draft.localId) {
    logPrepare("meta-write-skipped-stale-generation", {
      attemptedLocalId: draft.localId,
      currentLocalId: current.localId,
    });
    return false;
  }
  writeDraftVideoMeta(draft);
  return true;
}

type ActiveJob = {
  localId: string;
  jobId: string;
  abort: AbortController;
  promise: Promise<void>;
};

let activeJob: ActiveJob | null = null;
/** Prevents overlapping ensure() starts for the same localId. */
const startingLocalIds = new Set<string>();

function logPrepare(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info("[echotoo video prepare]", event, detail ?? "");
}

export function getActiveDraftVideoPreparationLocalId(): string | null {
  return activeJob?.localId ?? null;
}

export function isDraftVideoPreparationActiveFor(localId: string): boolean {
  return activeJob?.localId === localId;
}

/**
 * Await the in-flight preparation job for `localId` if one is active/starting.
 * Does not start a new encoder. Safe when no job exists (resolves immediately).
 */
export async function awaitActiveDraftVideoPreparation(
  localId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (startingLocalIds.has(localId) && Date.now() < deadline) {
    if (activeJob?.localId === localId) break;
    await new Promise((r) => setTimeout(r, 40));
  }
  const current = activeJob;
  if (!current || current.localId !== localId) return;
  try {
    await current.promise;
  } catch {
    /* outcome is on draft meta */
  }
}

/**
 * Cancel native job if any. Safe / idempotent.
 * Does not delete source. Native layer deletes tmp.
 */
export async function cancelActiveDraftVideoPreparation(
  reason = "cancel",
): Promise<void> {
  const current = activeJob;
  if (!current) return;
  logPrepare("cancel-request", { localId: current.localId, reason });
  current.abort.abort();
  try {
    await EchoVideoPrepare.cancelPreparation({ jobId: current.jobId });
  } catch {
    /* best-effort */
  }
  try {
    await current.promise;
  } catch {
    /* swallow */
  }
  if (activeJob?.jobId === current.jobId) {
    activeJob = null;
  }
  startingLocalIds.delete(current.localId);
}

/**
 * Start preparation when draft is transcode + local_ready (native encoder).
 * No-op for passthrough / prepared / prepare_failed / web / duplicates.
 */
export async function ensureDraftVideoPreparationStarted(
  draftVideo: DraftVideo,
  policy: VideoPreparationPolicyResult,
  callbacks: DraftVideoPreparationCallbacks,
): Promise<void> {
  if (policy.strategy === "passthrough") {
    return;
  }
  if (draftVideo.preparationStrategy === "passthrough") {
    return;
  }
  if (draftVideo.preparationStatus === "prepared") {
    return;
  }
  if (draftVideo.preparationStatus === "prepare_failed") {
    return;
  }
  if (draftVideo.preparationStatus !== "local_ready") {
    // preparing with live job → already running
    if (
      draftVideo.preparationStatus === "preparing" &&
      activeJob?.localId === draftVideo.localId
    ) {
      return;
    }
    if (draftVideo.preparationStatus !== "preparing") {
      return;
    }
    // preparing without active job (shouldn't happen after reconcile) — fall through only if localId unmatched
    if (activeJob?.localId === draftVideo.localId) return;
  }

  if (!isNativeEchoVideoPrepareAvailable()) {
    logPrepare("ensure-skip-platform", { localId: draftVideo.localId });
    return;
  }

  // Never start native encode for known over-limit sources (old drafts / bypass paths).
  if (
    isCreateVideoResolutionOverLimit(draftVideo.width, draftVideo.height)
  ) {
    const failed = markPrepareFailed(
      draftVideo,
      ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high,
    );
    if (writeDraftMetaIfCurrentGeneration(failed)) {
      callbacks.onDraftUpdated(failed);
    }
    callbacks.onPrepareFailedUserMessage?.(
      VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
      ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high,
    );
    return;
  }

  if (startingLocalIds.has(draftVideo.localId)) {
    return;
  }
  if (activeJob?.localId === draftVideo.localId) {
    return;
  }

  // Different video still preparing (replace race) — cancel first.
  if (activeJob && activeJob.localId !== draftVideo.localId) {
    await cancelActiveDraftVideoPreparation("superseded");
  }

  startingLocalIds.add(draftVideo.localId);
  const jobId = `prep-${draftVideo.localId}-${Date.now().toString(36)}`;
  const abort = new AbortController();

  let draft = markPreparing(draftVideo, null);
  if (!writeDraftMetaIfCurrentGeneration(draft)) {
    startingLocalIds.delete(draftVideo.localId);
    return;
  }
  callbacks.onDraftUpdated(draft);

  const run = (async () => {
    try {
      const result = await prepareDraftVideo({
        draftVideo: draft,
        policy,
        signal: abort.signal,
        jobId,
        onProgress: (progress) => {
          if (abort.signal.aborted) return;
          if (activeJob?.jobId !== jobId) return;
          const latest = { ...draft, prepareProgress: progress };
          draft = latest;
          // Avoid rewriting meta on every tick if possible — still need UI epoch.
          const progressDraft = {
            ...draft,
            preparationStatus: "preparing" as const,
            prepareProgress: progress,
          };
          if (!writeDraftMetaIfCurrentGeneration(progressDraft)) return;
          callbacks.onDraftUpdated(progressDraft);
        },
      });

      if (abort.signal.aborted || (!result.ok && result.errorCode === "cancelled")) {
        logPrepare("ensure-aborted", { localId: draftVideo.localId, jobId });
        return;
      }

      // Includes prepare_timeout → markPrepareFailed left preparationStatus prepare_failed
      // (never stuck on preparing). activeJob cleared in finally once this settles.
      if (!writeDraftMetaIfCurrentGeneration(result.draftVideo)) {
        return;
      }
      callbacks.onDraftUpdated(result.draftVideo);

      if (!result.ok) {
        callbacks.onPrepareFailedUserMessage?.(
          result.message || PREPARE_FAILED_USER_MESSAGE,
          result.errorCode,
        );
      }
    } finally {
      if (activeJob?.jobId === jobId) {
        activeJob = null;
      }
      startingLocalIds.delete(draftVideo.localId);
    }
  })();

  activeJob = {
    localId: draftVideo.localId,
    jobId,
    abort,
    promise: run,
  };

  await run;
}
