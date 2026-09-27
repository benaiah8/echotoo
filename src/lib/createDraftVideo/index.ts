import { isNativeApp } from "../storage/utils/capacitorDetection";
import {
  classifyAndroidVideoUriScheme,
  logAndroidVideoDiagnostic,
} from "../devAndroidVideoDiagnostics";
import {
  readDraftVideoMeta,
  writeDraftVideoMeta,
} from "./draftVideoMeta";
import {
  deleteNativeDraftVideoDirectory,
  deleteNativeDraftVideoFile,
  resolveNativeDraftVideoPreviewUrl,
  saveNativeDraftVideoFromUri,
  buildNativePreparedVideoTempPath,
} from "./nativeDraftVideoStorage";
import { publishPostIdFromDraftLocalReference } from "./encoderSettingsFromPolicy";
import type { DraftVideo, DraftVideoStorageKind } from "./types";
import {
  deleteWebDraftVideoBlob,
  loadWebDraftVideoFile,
  saveWebDraftVideoBlob,
} from "./webDraftVideoStorage";
import {
  createLocalVideoPreviewUrl,
} from "../createFinalizeVideoPreview";
import { revokeLocalVideoPreviewUrlIfBlob } from "./localVideoAsset";

export type PersistDraftVideoInput = {
  publishPostId: string;
  file: File;
  /** Native acquisition URI — copied directly when available. */
  nativeSourceUri?: string | null;
  /** Accurate size when `file` is metadata-only (URI stat path). */
  sizeBytes?: number;
  /**
   * When false, persist bytes but do not overwrite draft meta yet
   * (safe replace — commit after preview validates).
   */
  commitMeta?: boolean;
};

const sessionPreviewUrls = new Map<string, string>();

function storageKindForPlatform(): DraftVideoStorageKind {
  return isNativeApp() ? "native-fs" : "idb-blob";
}

export async function persistDraftVideo(
  input: PersistDraftVideoInput,
): Promise<DraftVideo> {
  const localId = crypto.randomUUID();
  const kind = storageKindForPlatform();

  let localReference: string;

  if (kind === "native-fs") {
    const intendedStrategy = input.nativeSourceUri?.trim()
      ? "uri-copy"
      : "file-bytes";
    logAndroidVideoDiagnostic("ANDROID_VIDEO_PERSIST_START", {
      uriScheme: classifyAndroidVideoUriScheme(input.nativeSourceUri),
      persistStrategy: intendedStrategy,
      sizeBytes: input.sizeBytes ?? input.file.size,
      hasRuntimeFile: Boolean(input.file),
      runtimeFileSize: input.file.size,
      destinationKind: "create-drafts",
    });
    if (!input.nativeSourceUri?.trim()) {
      // Native drafts require URI→Filesystem.copy. Never arrayBuffer/btoa.
      throw new Error("NATIVE_VIDEO_INACCESSIBLE");
    }
    const saved = await saveNativeDraftVideoFromUri(
      input.publishPostId,
      localId,
      input.nativeSourceUri,
      input.file,
    );
    localReference = saved.path;
  } else {
    if (input.file.size <= 0) {
      throw new Error("NATIVE_VIDEO_EMPTY_FILE");
    }
    await saveWebDraftVideoBlob(input.publishPostId, localId, input.file);
    localReference = input.publishPostId;
  }

  const draftVideo: DraftVideo = {
    localId,
    fileName: input.file.name,
    mimeType: input.file.type || "video/mp4",
    size: input.sizeBytes ?? input.file.size,
    lastModified: input.file.lastModified,
    localStorageKind: kind,
    localReference,
    remoteMediaId: null,
    remoteVideoId: null,
  };

  if (input.commitMeta !== false) {
    writeDraftVideoMeta(draftVideo);
  }
  return draftVideo;
}

export function loadDraftVideo(): DraftVideo | null {
  return readDraftVideoMeta();
}

/**
 * Create preview / hydrate: native-fs → WebView URL (no full-file read).
 * Web → Blob File for object URL.
 */
export async function resolveDraftVideoPreview(options?: {
  draftVideo?: DraftVideo | null;
}): Promise<{
  draftVideo: DraftVideo;
  localPreviewUrl: string | null;
  localFile: File | null;
}> {
  const meta = options?.draftVideo ?? readDraftVideoMeta();
  if (!meta) {
    throw new Error("DRAFT_VIDEO_MISSING");
  }

  if (meta.localStorageKind === "native-fs") {
    const localPreviewUrl = await resolveNativeDraftVideoPreviewUrl(
      meta.localReference,
    );
    return { draftVideo: meta, localPreviewUrl, localFile: null };
  }

  const localFile = await loadWebDraftVideoFile(meta.localReference);
  return {
    draftVideo: meta,
    localPreviewUrl: null,
    localFile,
  };
}

/**
 * Web publish-time File materialization only (idb-blob drafts → File for tus-js).
 * Capacitor native-fs drafts never return a File here (IOS3): video publish uses
 * EchoVideoUpload native-path. Poster frame extraction calls
 * loadNativeDraftVideoFile directly when needed.
 */
export async function resolveDraftVideoFile(
  draftVideo?: DraftVideo | null,
): Promise<File | null> {
  const meta = draftVideo ?? readDraftVideoMeta();
  if (!meta) return null;

  if (meta.localStorageKind === "native-fs") {
    return null;
  }

  return loadWebDraftVideoFile(meta.localReference);
}

export async function deleteDraftVideo(
  publishPostId?: string | null,
): Promise<void> {
  const meta = readDraftVideoMeta();
  const id = publishPostId ?? meta?.localReference;

  // Single-video removal: delete ONLY video-owned files + clear meta.
  // Never rmdir create-drafts/{publishPostId} — that tree may still hold
  // mixed-media image assets under .../images/. Whole-directory wipe belongs
  // only to cleanupDraftVideoAssets (full draft discard / post-publish cleanup).

  if (meta) {
    await deletePreparedVideoStorageBytes(meta);
  }

  if (meta?.localStorageKind === "native-fs") {
    const postId =
      publishPostId ??
      (meta.localReference
        ? publishPostIdFromDraftLocalReference(meta.localReference)
        : null);
    if (postId && meta.localId) {
      const tempPath = buildNativePreparedVideoTempPath(postId, meta.localId);
      if (
        tempPath !== meta.localReference &&
        tempPath !== meta.preparedReference
      ) {
        await deleteNativeDraftVideoFile(tempPath, { optional: true });
      }
    }
    await deleteNativeDraftVideoFile(meta.localReference);
  } else if (meta) {
    await deleteWebDraftVideoBlob(meta.localReference);
  } else if (id && !isNativeApp()) {
    await deleteWebDraftVideoBlob(id);
  }

  if (meta?.localId) {
    revokeDraftVideoPreviewSource(meta.localId);
  }

  const latestAfter = readDraftVideoMeta();
  if (!latestAfter || latestAfter.localId === meta?.localId) {
    writeDraftVideoMeta(null);
  }
}

/**
 * Delete prepared artifact bytes when distinct from the source reference.
 */
export async function deletePreparedVideoStorageBytes(
  draft: DraftVideo,
): Promise<void> {
  const preparedRef = draft.preparedReference?.trim();
  if (!preparedRef) return;
  // Never delete the source via this helper.
  if (preparedRef === draft.localReference) return;

  const kind = draft.preparedStorageKind ?? draft.localStorageKind;
  if (kind === "native-fs") {
    await deleteNativeDraftVideoFile(preparedRef, { optional: true });
  } else {
    await deleteWebDraftVideoBlob(preparedRef);
  }
}

/**
 * Delete storage bytes for a specific draft video without clearing current meta.
 * Used after a successful replace so the previous native file is cleaned up.
 * Cleans source + prepared artifact (if any).
 */
export async function deleteDraftVideoStorageBytes(
  draft: DraftVideo,
  options?: {
    /** Never delete this generation's source (current replacement). */
    protectLocalId?: string | null;
    protectLocalReference?: string | null;
  },
): Promise<void> {
  const protectLocalId = options?.protectLocalId?.trim() || null;
  const protectRef = options?.protectLocalReference?.trim() || null;
  const currentMeta = readDraftVideoMeta();
  const currentRef = currentMeta?.localReference?.trim() || null;
  const currentLocalId = currentMeta?.localId?.trim() || null;

  // Never delete the generation that durable meta currently points at.
  if (currentLocalId && draft.localId === currentLocalId) {
    console.warn(
      "[createDraftVideo] refused deleteDraftVideoStorageBytes: draft is current meta generation",
    );
    return;
  }
  if (currentRef && draft.localReference === currentRef) {
    console.warn(
      "[createDraftVideo] refused deleteDraftVideoStorageBytes: draft.localReference is current meta source",
    );
    return;
  }
  if (protectLocalId && draft.localId === protectLocalId) {
    console.warn(
      "[createDraftVideo] refused deleteDraftVideoStorageBytes: protectLocalId match",
    );
    return;
  }
  if (protectRef && draft.localReference === protectRef) {
    console.warn(
      "[createDraftVideo] refused deleteDraftVideoStorageBytes: protectLocalReference match",
    );
    return;
  }

  // Prepared / temp must never delete the protected or current source path.
  const preparedRef = draft.preparedReference?.trim() || null;
  if (
    preparedRef &&
    preparedRef !== draft.localReference &&
    preparedRef !== protectRef &&
    preparedRef !== currentRef
  ) {
    await deletePreparedVideoStorageBytes(draft);
  }

  if (draft.localStorageKind === "native-fs") {
    const publishPostId = publishPostIdFromDraftLocalReference(
      draft.localReference,
    );
    if (publishPostId) {
      const tempPath = buildNativePreparedVideoTempPath(
        publishPostId,
        draft.localId,
      );
      if (
        tempPath !== protectRef &&
        tempPath !== currentRef &&
        tempPath !== draft.localReference
      ) {
        await deleteNativeDraftVideoFile(tempPath, { optional: true });
      }
    }
    // Scoped file delete only — never rmdir the draft directory here.
    if (
      draft.localReference !== protectRef &&
      draft.localReference !== currentRef
    ) {
      await deleteNativeDraftVideoFile(draft.localReference);
    }
  } else {
    // Web IDB is keyed by publishPostId — new video already overwrote the blob.
    // Do not delete the shared key after a successful replace.
  }
  if (draft.localId && draft.localId !== protectLocalId) {
    revokeDraftVideoPreviewSource(draft.localId);
  }
}

export type CleanupDraftVideoAssetsOptions = {
  publishPostId?: string | null;
  draftVideo?: DraftVideo | null;
  /** When set, attempt bunny-video-delete before local cleanup. */
  remoteMediaId?: string | null;
  deleteRemote?: boolean;
};

/**
 * Best-effort durable draft video cleanup (local bytes + metadata).
 * Optional remote Bunny delete when discarding failed publish orphans.
 */
export async function cleanupDraftVideoAssets(
  options: CleanupDraftVideoAssetsOptions = {},
): Promise<void> {
  const snapshot = options.draftVideo ?? null;
  const currentMeta = readDraftVideoMeta();
  const publishPostId = options.publishPostId ?? null;

  // If durable meta moved to a newer generation, only delete the snapshot's
  // files — never wipe the shared draft directory or clear current meta.
  const currentIsDifferentGeneration =
    Boolean(currentMeta?.localId) &&
    Boolean(snapshot?.localId) &&
    currentMeta!.localId !== snapshot!.localId;

  if (currentIsDifferentGeneration && snapshot) {
    await deleteDraftVideoStorageBytes(snapshot, {
      protectLocalId: currentMeta!.localId,
      protectLocalReference: currentMeta!.localReference,
    });
    return;
  }

  // Current meta still owns this draft — refuse directory wipe while a live
  // source under this publishPostId is referenced.
  if (
    currentMeta?.localStorageKind === "native-fs" &&
    publishPostId &&
    currentMeta.localReference.includes(`create-drafts/${publishPostId}/`)
  ) {
    // Only clear when snapshot matches current (true discard of this draft).
    if (snapshot && snapshot.localId !== currentMeta.localId) {
      await deleteDraftVideoStorageBytes(snapshot, {
        protectLocalId: currentMeta.localId,
        protectLocalReference: currentMeta.localReference,
      });
      return;
    }
  }

  const meta = snapshot ?? currentMeta;

  if (meta?.localId) {
    revokeDraftVideoPreviewSource(meta.localId);
  }

  if (meta) {
    await deletePreparedVideoStorageBytes(meta);
  }

  if (meta?.localStorageKind === "native-fs") {
    if (meta.localReference) {
      await deleteNativeDraftVideoFile(meta.localReference);
    }
    if (publishPostId) {
      // Final discard only — directory wipe after file delete when this draft
      // still owns meta (or meta already cleared).
      const latest = readDraftVideoMeta();
      if (
        !latest ||
        latest.localId === meta.localId ||
        !latest.localReference.includes(`create-drafts/${publishPostId}/`)
      ) {
        await deleteNativeDraftVideoDirectory(publishPostId);
      }
    }
  } else if (meta) {
    await deleteWebDraftVideoBlob(meta.localReference);
  } else if (publishPostId) {
    await deleteWebDraftVideoBlob(publishPostId);
    if (isNativeApp()) {
      const latest = readDraftVideoMeta();
      if (
        !latest ||
        !latest.localReference.includes(`create-drafts/${publishPostId}/`)
      ) {
        await deleteNativeDraftVideoDirectory(publishPostId);
      }
    }
  }

  // Never clear newer meta owned by a different generation.
  const latestAfter = readDraftVideoMeta();
  if (
    meta &&
    (!latestAfter || latestAfter.localId === meta.localId)
  ) {
    writeDraftVideoMeta(null);
  }
}

export function createDraftVideoPreviewSource(
  file: File,
  localId: string,
): string {
  const prev = sessionPreviewUrls.get(localId);
  if (prev) revokeLocalVideoPreviewUrlIfBlob(prev);
  const url = createLocalVideoPreviewUrl(file);
  sessionPreviewUrls.set(localId, url);
  return url;
}

export function revokeDraftVideoPreviewSource(localId: string): void {
  const url = sessionPreviewUrls.get(localId);
  if (url) {
    revokeLocalVideoPreviewUrlIfBlob(url);
    sessionPreviewUrls.delete(localId);
  }
}

export type { DraftVideo, VideoPreparationStatus, VideoPreparationStrategyStored } from "./types";
export type { LocalVideoAsset } from "./localVideoAsset";
export {
  ADD_VIDEO_FAILED_USER_MESSAGE,
} from "./localVideoAsset";
export {
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  SOURCE_MAX_BYTES,
  VIDEO_TOO_LONG_USER_MESSAGE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
  VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
  VIDEO_READ_FAILED_USER_MESSAGE,
  VIDEO_INACCESSIBLE_USER_MESSAGE,
  VIDEO_INGEST_UNEXPECTED_USER_MESSAGE,
  VIDEO_WILL_PREPARE_USER_MESSAGE,
  VIDEO_REQUIREMENTS_TITLE,
  VIDEO_REQUIREMENTS_ITEMS,
  VIDEO_REQUIREMENTS_LINES,
  VIDEO_REQUIREMENTS_OPTIMIZATION_LINE,
  SUPPORTS_UNIFIED_NATIVE_CAMERA_CAPTURE,
  REPLACE_VIDEO_CONFIRM_TITLE,
  REPLACE_VIDEO_CONFIRM_BODY,
  REPLACE_VIDEO_CONFIRM_LEAD,
  REPLACE_VIDEO_CONFIRM_EMPHASIS,
  messageForCreateVideoAcquisitionFailure,
  mapCreateVideoSourceValidationReason,
  getCreateVideoValidationToastContent,
  isCreateVideoDurationOverLimit,
  isAllowedCreateVideoMimeType,
  validateCreateVideoSource,
} from "./createVideoConstraints";
export {
  MAX_CREATE_VIDEO_LONG_EDGE_PX,
  MAX_CREATE_VIDEO_SHORT_EDGE_PX,
  MAX_CREATE_VIDEO_PIXEL_AREA,
  isCreateVideoResolutionOverLimit,
  toCreateVideoDisplaySize,
} from "./createVideoResolutionConstraints";
export type { VideoDisplaySize } from "./createVideoResolutionConstraints";
export type {
  CreateVideoAcquisitionFailureReason,
  CreateVideoValidationToastContent,
} from "./createVideoConstraints";
export {
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
  INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION,
  PREPARING_VIDEO_USER_MESSAGE,
  PREPARE_TOO_LARGE_USER_MESSAGE,
  PREPARE_FAILED_USER_MESSAGE,
  PREPARE_UNSUPPORTED_USER_MESSAGE,
} from "./createVideoPreparationConstants";
export {
  resolveVideoPreparationPolicy,
  computeAdaptivePrepareTargetBytes,
  computeSourceTotalBitrateBps,
  hasMeaningfulPrepareSavings,
  wouldPrepareViolateQualityFloor,
} from "./createVideoPreparationPolicy";
export type {
  VideoPreparationPolicyInput,
  VideoPreparationPolicyResult,
  VideoPreparationStrategy,
} from "./createVideoPreparationPolicy";
export {
  applyPreparationDecisionAfterSourceReady,
  clearPreparedArtifactFields,
  markPassthroughPrepared,
  markPreparing,
  markPrepareFailed,
  markTranscodePrepared,
  reconcileInterruptedPreparing,
  PREPARE_ERROR_ENCODER_NOT_IMPLEMENTED,
  PREPARE_ERROR_INTERRUPTED,
  PREPARE_ERROR_ARTIFACT_MISSING,
  PREPARE_ERROR_ARTIFACT_EMPTY,
} from "./videoPreparationState";
export {
  resolvePreparedUploadAsset,
} from "./resolvePreparedUploadAsset";
export type { PreparedUploadAsset } from "./resolvePreparedUploadAsset";
export {
  resolveVideoPublishPreparationState,
} from "./resolveVideoPublishPreparationState";
export type { VideoPublishPreparationState } from "./resolveVideoPublishPreparationState";
export {
  validatePreparedArtifactMetadata,
  validatePreparedArtifactExists,
  invalidatePreparedArtifact,
} from "./validatePreparedVideoArtifact";
export {
  reconcileDraftVideoPreparation,
} from "./reconcileDraftVideoPreparation";
export {
  prepareDraftVideo,
  isNativeEchoVideoPrepareAvailable,
  isAndroidEchoVideoPrepareAvailable,
} from "./prepareDraftVideo";
export type {
  PrepareDraftVideoInput,
  PrepareDraftVideoResult,
} from "./prepareDraftVideo";
export {
  ensureDraftVideoPreparationStarted,
  cancelActiveDraftVideoPreparation,
  awaitActiveDraftVideoPreparation,
  getActiveDraftVideoPreparationLocalId,
  isDraftVideoPreparationActiveFor,
} from "./draftVideoPreparationController";
export {
  ensurePublishVideoPreparation,
  isNativeEchoVideoUploadPlatform,
  isNativeEchoVideoUploadAvailable,
  isAndroidNativeVideoUploadPlatform,
} from "./ensurePublishVideoPreparation";
export type {
  EnsurePublishVideoPreparationOptions,
  EnsurePublishVideoPreparationResult,
} from "./ensurePublishVideoPreparation";
export {
  encoderSettingsFromPreparationPolicy,
  publishPostIdFromDraftLocalReference,
} from "./encoderSettingsFromPolicy";
export type { DraftVideoEncoderSettings } from "./encoderSettingsFromPolicy";
export {
  clearDraftVideoRemoteIds,
  readDraftVideoMeta,
  updateDraftVideoRemoteIds,
  updateDraftVideoNativeTusUploadUrl,
  updateDraftVideoRemotePoster,
  writeDraftVideoMeta,
} from "./draftVideoMeta";
export {
  ensurePublishVideoPoster,
  deleteOwnedDraftVideoPosterBestEffort,
  isOwnedPostMediaPosterStoragePath,
  VIDEO_POSTER_UPLOAD_POLICY,
} from "./publishVideoPoster";
export type {
  EnsurePublishVideoPosterOptions,
  EnsurePublishVideoPosterResult,
} from "./publishVideoPoster";
export {
  resolveNativeDraftVideoPreviewUrl,
  buildNativeDraftVideoPath,
  buildNativePreparedVideoPath,
  buildNativePreparedVideoTempPath,
} from "./nativeDraftVideoStorage";
