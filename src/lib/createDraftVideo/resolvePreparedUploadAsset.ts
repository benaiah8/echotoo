/**
 * Pure helpers: which local asset Publish should upload (PASS B).
 * No Bunny calls.
 */

import type { DraftVideo, DraftVideoStorageKind } from "./types";

export type PreparedUploadAsset = {
  /** Filesystem path or IDB key. */
  reference: string;
  storageKind: DraftVideoStorageKind;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  /** True when Publish uses the original source (passthrough). */
  isSourcePassthrough: boolean;
};

/**
 * Resolve the local upload artifact for a prepared draft.
 * Passthrough → source. Transcode prepared → preparedReference.
 * Incomplete / failed → null.
 */
export function resolvePreparedUploadAsset(
  draft: DraftVideo,
): PreparedUploadAsset | null {
  if (draft.preparationStatus !== "prepared") return null;

  if (draft.preparationStrategy === "passthrough") {
    return {
      reference: draft.localReference,
      storageKind: draft.localStorageKind,
      mimeType: draft.mimeType,
      sizeBytes: draft.size,
      width: draft.width ?? null,
      height: draft.height ?? null,
      duration: draft.duration ?? null,
      isSourcePassthrough: true,
    };
  }

  if (draft.preparationStrategy === "transcode") {
    const ref = draft.preparedReference?.trim();
    if (!ref) return null;
    const kind = draft.preparedStorageKind ?? draft.localStorageKind;
    const size = draft.preparedSizeBytes;
    if (typeof size !== "number" || size <= 0) return null;
    return {
      reference: ref,
      storageKind: kind,
      mimeType: draft.preparedMimeType || draft.mimeType,
      sizeBytes: size,
      width: draft.preparedWidth ?? null,
      height: draft.preparedHeight ?? null,
      duration: draft.preparedDuration ?? draft.duration ?? null,
      isSourcePassthrough: false,
    };
  }

  return null;
}
