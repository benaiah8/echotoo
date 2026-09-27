/**
 * Validate future prepared-artifact metadata / bytes (PASS B).
 * No encoding.
 */

import {
  isAllowedBunnyVideoMimeType,
  normalizeBunnyVideoMimeType,
} from "../bunnyUpload/bunnyVideoConstraints";
import { INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION } from "./createVideoPreparationConstants";
import { isAllowedCreateVideoMimeType } from "./createVideoConstraints";
import { statNativeDraftVideoBytes } from "./nativeDraftVideoStorage";
import {
  PREPARE_ERROR_ARTIFACT_EMPTY,
  PREPARE_ERROR_ARTIFACT_MISSING,
  PREPARE_ERROR_ARTIFACT_TOO_LARGE,
  PREPARE_ERROR_ARTIFACT_UNSUPPORTED,
  clearPreparedArtifactFields,
} from "./videoPreparationState";
import type { DraftVideo } from "./types";
import { loadWebDraftVideoFile } from "./webDraftVideoStorage";

export type PreparedArtifactValidation =
  | { ok: true; sizeBytes: number }
  | { ok: false; errorCode: string };

/**
 * Sync metadata checks (reference, size, MIME, ceiling).
 */
export function validatePreparedArtifactMetadata(
  draft: DraftVideo,
): PreparedArtifactValidation {
  if (draft.preparationStrategy !== "transcode") {
    return { ok: true, sizeBytes: draft.size };
  }

  const ref = draft.preparedReference?.trim();
  if (!ref) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_MISSING };
  }

  const size = draft.preparedSizeBytes;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_EMPTY };
  }

  if (size > INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_TOO_LARGE };
  }

  const mime = draft.preparedMimeType || draft.mimeType;
  const normalized = normalizeBunnyVideoMimeType(mime);
  if (
    !isAllowedCreateVideoMimeType(normalized) &&
    !isAllowedBunnyVideoMimeType(normalized)
  ) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_UNSUPPORTED };
  }

  return { ok: true, sizeBytes: size };
}

/**
 * Async existence + non-zero size for prepared reference.
 */
export async function validatePreparedArtifactExists(
  draft: DraftVideo,
): Promise<PreparedArtifactValidation> {
  const meta = validatePreparedArtifactMetadata(draft);
  if (!meta.ok) return meta;
  if (draft.preparationStrategy !== "transcode") return meta;

  const ref = draft.preparedReference!.trim();
  const kind = draft.preparedStorageKind ?? draft.localStorageKind;

  if (kind === "native-fs") {
    const size = await statNativeDraftVideoBytes(ref);
    if (size == null) {
      return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_MISSING };
    }
    if (size <= 0) {
      return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_EMPTY };
    }
    return { ok: true, sizeBytes: size };
  }

  const file = await loadWebDraftVideoFile(ref);
  if (!file) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_MISSING };
  }
  if (file.size <= 0) {
    return { ok: false, errorCode: PREPARE_ERROR_ARTIFACT_EMPTY };
  }
  return { ok: true, sizeBytes: file.size };
}

/**
 * Clear prepared fields and return restartable local_ready when artifact bad.
 */
export function invalidatePreparedArtifact(
  draft: DraftVideo,
  errorCode: string,
): DraftVideo {
  return {
    ...clearPreparedArtifactFields(draft),
    preparationStatus: "local_ready",
    preparationStrategy: "transcode",
    prepareProgress: null,
    prepareErrorCode: errorCode,
  };
}
