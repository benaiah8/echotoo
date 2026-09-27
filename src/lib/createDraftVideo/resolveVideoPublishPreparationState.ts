/**
 * Pure Publish-side preparation gate (PASS B).
 * Does not start Bunny upload.
 */

import type { DraftVideo } from "./types";
import { resolvePreparedUploadAsset } from "./resolvePreparedUploadAsset";

export type VideoPublishPreparationState =
  | "ready_source"
  | "ready_prepared"
  | "wait_preparing"
  | "needs_prepare"
  | "blocked_prepare_failed";

export function resolveVideoPublishPreparationState(
  draft: DraftVideo,
): VideoPublishPreparationState {
  const status = draft.preparationStatus;

  if (status === "preparing") return "wait_preparing";
  if (status === "prepare_failed") return "blocked_prepare_failed";

  if (status === "prepared") {
    const asset = resolvePreparedUploadAsset(draft);
    if (!asset) {
      // Metadata says prepared but artifact unresolved → need prepare again.
      return "needs_prepare";
    }
    return asset.isSourcePassthrough ? "ready_source" : "ready_prepared";
  }

  // local_ready, missing, or unknown — may still need preparation.
  if (draft.preparationStrategy === "passthrough") {
    // Incomplete passthrough marking — treat source as ready once decided.
    return "ready_source";
  }

  if (draft.preparationStrategy === "transcode") {
    return "needs_prepare";
  }

  // No decision yet.
  return "needs_prepare";
}
