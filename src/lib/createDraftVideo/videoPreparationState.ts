/**
 * Local video preparation status helpers (PASS B).
 * Distinct from Bunny upload/processing statuses.
 */

import type {
  DraftVideo,
  DraftVideoStorageKind,
  VideoPreparationStatus,
  VideoPreparationStrategyStored,
} from "./types";
import type { VideoPreparationPolicyResult } from "./createVideoPreparationPolicy";

export type { VideoPreparationStatus, VideoPreparationStrategyStored };

export const PREPARE_ERROR_ENCODER_NOT_IMPLEMENTED = "ENCODER_NOT_IMPLEMENTED";
export const PREPARE_ERROR_INTERRUPTED = "PREPARE_INTERRUPTED";
export const PREPARE_ERROR_ARTIFACT_MISSING = "PREPARED_ARTIFACT_MISSING";
export const PREPARE_ERROR_ARTIFACT_EMPTY = "PREPARED_ARTIFACT_EMPTY";
export const PREPARE_ERROR_ARTIFACT_TOO_LARGE = "PREPARED_ARTIFACT_TOO_LARGE";
export const PREPARE_ERROR_ARTIFACT_UNSUPPORTED =
  "PREPARED_ARTIFACT_UNSUPPORTED_MIME";

export function clearPreparedArtifactFields(
  draft: DraftVideo,
): DraftVideo {
  return {
    ...draft,
    preparedReference: null,
    preparedStorageKind: null,
    preparedMimeType: null,
    preparedSizeBytes: null,
    preparedWidth: null,
    preparedHeight: null,
    preparedDuration: null,
  };
}

export function markPassthroughPrepared(draft: DraftVideo): DraftVideo {
  return {
    ...clearPreparedArtifactFields(draft),
    preparationStatus: "prepared",
    preparationStrategy: "passthrough",
    prepareProgress: null,
    prepareErrorCode: null,
  };
}

/**
 * After durable source + metadata exist: apply pure policy decision.
 * Passthrough → prepared (no duplicate file).
 * Prepare-required → local_ready + transcode (encoder not started in PASS B).
 */
export function applyPreparationDecisionAfterSourceReady(
  draft: DraftVideo,
  policy: VideoPreparationPolicyResult,
): DraftVideo {
  if (policy.strategy === "passthrough") {
    return markPassthroughPrepared(draft);
  }

  return {
    ...clearPreparedArtifactFields(draft),
    preparationStatus: "local_ready",
    preparationStrategy: "transcode",
    prepareProgress: null,
    prepareErrorCode: null,
  };
}

export function markPreparing(
  draft: DraftVideo,
  progress: number | null = null,
): DraftVideo {
  return {
    ...draft,
    preparationStatus: "preparing",
    preparationStrategy: draft.preparationStrategy ?? "transcode",
    prepareProgress: progress,
    prepareErrorCode: null,
  };
}

export function markPrepareFailed(
  draft: DraftVideo,
  errorCode: string,
): DraftVideo {
  return {
    ...clearPreparedArtifactFields(draft),
    preparationStatus: "prepare_failed",
    preparationStrategy: draft.preparationStrategy ?? "transcode",
    prepareProgress: null,
    prepareErrorCode: errorCode,
  };
}

export function markTranscodePrepared(
  draft: DraftVideo,
  artifact: {
    preparedReference: string;
    preparedStorageKind: DraftVideoStorageKind;
    preparedMimeType: string;
    preparedSizeBytes: number;
    preparedWidth?: number | null;
    preparedHeight?: number | null;
    preparedDuration?: number | null;
  },
): DraftVideo {
  return {
    ...draft,
    preparationStatus: "prepared",
    preparationStrategy: "transcode",
    prepareProgress: null,
    prepareErrorCode: null,
    preparedReference: artifact.preparedReference,
    preparedStorageKind: artifact.preparedStorageKind,
    preparedMimeType: artifact.preparedMimeType,
    preparedSizeBytes: artifact.preparedSizeBytes,
    preparedWidth: artifact.preparedWidth ?? null,
    preparedHeight: artifact.preparedHeight ?? null,
    preparedDuration: artifact.preparedDuration ?? null,
  };
}

/** Stale in-flight prepare after process death → restartable local_ready. */
export function reconcileInterruptedPreparing(draft: DraftVideo): DraftVideo {
  if (draft.preparationStatus !== "preparing") return draft;
  return {
    ...clearPreparedArtifactFields(draft),
    preparationStatus: "local_ready",
    preparationStrategy: "transcode",
    prepareProgress: null,
    prepareErrorCode: PREPARE_ERROR_INTERRUPTED,
  };
}
