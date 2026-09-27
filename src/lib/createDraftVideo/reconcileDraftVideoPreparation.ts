/**
 * Resume reconciliation for preparation metadata (PASS B).
 */

import type { DraftVideo } from "./types";
import {
  invalidatePreparedArtifact,
  validatePreparedArtifactExists,
  validatePreparedArtifactMetadata,
} from "./validatePreparedVideoArtifact";
import { reconcileInterruptedPreparing } from "./videoPreparationState";

export type ReconcileDraftVideoPreparationResult = {
  draftVideo: DraftVideo;
  changed: boolean;
};

/**
 * On draft resume / hydrate:
 * - passthrough prepared → keep
 * - transcode prepared → validate artifact; invalidate if missing/corrupt
 * - preparing → restartable local_ready (encoder cannot survive process death)
 * - prepare_failed → preserve
 */
export async function reconcileDraftVideoPreparation(
  draft: DraftVideo,
): Promise<ReconcileDraftVideoPreparationResult> {
  if (draft.preparationStatus === "preparing") {
    const next = reconcileInterruptedPreparing(draft);
    return { draftVideo: next, changed: true };
  }

  if (
    draft.preparationStatus === "prepared" &&
    draft.preparationStrategy === "passthrough"
  ) {
    return { draftVideo: draft, changed: false };
  }

  if (
    draft.preparationStatus === "prepared" &&
    draft.preparationStrategy === "transcode"
  ) {
    const meta = validatePreparedArtifactMetadata(draft);
    if (!meta.ok) {
      return {
        draftVideo: invalidatePreparedArtifact(draft, meta.errorCode),
        changed: true,
      };
    }
    const exists = await validatePreparedArtifactExists(draft);
    if (!exists.ok) {
      return {
        draftVideo: invalidatePreparedArtifact(draft, exists.errorCode),
        changed: true,
      };
    }
    return { draftVideo: draft, changed: false };
  }

  return { draftVideo: draft, changed: false };
}
