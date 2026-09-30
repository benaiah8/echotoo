import { uploadFileToBunnyTus } from "./bunnyUpload/bunnyTusUpload";
import {
  clearBunnyTusSingleFlight,
  runBunnyTusSingleFlight,
} from "./bunnyUpload/bunnyTusSingleFlight";
import { invokeBunnyUploadInit } from "./bunnyUpload/invokeBunnyUploadInit";
import {
  classifyEchoVideoUploadErrorCode,
  uploadNativeVideoToBunnyTus,
  VIDEO_UPLOAD_CANCELLED_USER_MESSAGE,
  VIDEO_UPLOAD_GENERIC_USER_MESSAGE,
} from "./bunnyUpload/uploadNativeVideoToBunnyTus";
import { validateBunnyVideoFile } from "./bunnyUpload/bunnyVideoConstraints";
import {
  updateDraftVideoNativeTusUploadUrl,
  updateDraftVideoRemoteIds,
} from "./createDraftVideo/draftVideoMeta";
import type { DraftVideo } from "./createDraftVideo/types";
import { prepareDraftVideoForUpload } from "./prepareDraftVideoForUpload";
import { fetchPostMediaById } from "./postMediaRow";
import {
  isPostMediaPublishReady,
  mapWaitForPostMediaPublishReadyError,
  waitForPostMediaPublishReady,
} from "./postMediaPublishReady";
import { shouldStartTusForInit } from "./createPostVideoUpload";
import {
  mapPublishFailureStageToAdmin,
  reportVideoPublishFailure,
} from "./reportVideoPublishFailure";

/** Web/legacy: full File (tus-js). */
export type PublishVideoFileBytes = {
  kind: "file";
  file: File;
};

/** Capacitor Android/iOS: stream from app-owned path (EchoVideoUpload). */
export type PublishVideoNativeBytes = {
  kind: "native-path";
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Optional persisted TUS Location for resume. */
  uploadUrl?: string | null;
  uploadJobId: string;
};

export type PublishVideoBytesSource =
  | PublishVideoFileBytes
  | PublishVideoNativeBytes;

export type PublishVideoUploadOptions = {
  publishPostId: string;
  bytes: PublishVideoBytesSource;
  draftVideo?: DraftVideo | null;
  /** Optional validated media-bucket poster object key (PV3.4). */
  posterStoragePath?: string | null;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  /** Fired when waiting on post_media processing/ready after bytes land. */
  onProcessing?: () => void;
};

export type PublishVideoUploadResult =
  | { ok: true; mediaId: string; skippedUpload: boolean }
  | { ok: false; error: string };

export type PublishFailureStage =
  | "prep"
  | "init"
  | "tus"
  | "processing"
  | "post_create";

const PUBLISH_DIAG_PREFIX = "[echotoo video publish]";

function logPublish(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info(PUBLISH_DIAG_PREFIX, event, detail ?? "");
}

export type PublishFailureOutcomeContext = {
  stage: PublishFailureStage;
  errorCode: string;
  recoverable: boolean;
  mediaId?: string | null;
  bunnyVideoId?: string | null;
  sizeBucket?: string | null;
  durationBucket?: string | null;
  width?: number | null;
  height?: number | null;
};

/**
 * Always-on concise failure outcome (production + DEV).
 * Safe fields only — never tokens, URLs, paths, or media bytes.
 * Also fire-and-forgets a video_publish crash report (skips cancels).
 */
export function logPublishFailureOutcome(
  payload: PublishFailureOutcomeContext,
): void {
  const errorCode = String(payload.errorCode || "unknown").slice(0, 64);
  console.info(`${PUBLISH_DIAG_PREFIX} PUBLISH_FAILURE_OUTCOME`, {
    stage: payload.stage,
    errorCode,
    recoverable: payload.recoverable,
  });
  try {
    reportVideoPublishFailure({
      stage: mapPublishFailureStageToAdmin(payload.stage),
      errorCode,
      recoverable: payload.recoverable,
      mediaId: payload.mediaId,
      bunnyVideoId: payload.bunnyVideoId,
      sizeBucket: payload.sizeBucket,
      durationBucket: payload.durationBucket,
      width: payload.width,
      height: payload.height,
    });
  } catch {
    /* telemetry must never affect Publish */
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function tusFailureFromUnknown(error: unknown): {
  error: string;
  errorCode: string;
  recoverable: boolean;
} {
  if (isAbortError(error)) {
    return {
      error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE,
      errorCode: "cancelled",
      recoverable: true,
    };
  }

  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : null;

  if (code) {
    const kind = classifyEchoVideoUploadErrorCode(code);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : VIDEO_UPLOAD_GENERIC_USER_MESSAGE;
    return {
      error: message,
      errorCode: code,
      recoverable: kind !== "unavailable",
    };
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : VIDEO_UPLOAD_GENERIC_USER_MESSAGE;
  return {
    error: message,
    errorCode: "unknown",
    recoverable: true,
  };
}

async function awaitPublishProcessingGate(
  mediaId: string,
  signal?: AbortSignal,
): Promise<Extract<PublishVideoUploadResult, { ok: false }> | null> {
  try {
    await waitForPostMediaPublishReady(mediaId, { signal });
    return null;
  } catch (error) {
    const mapped = mapWaitForPostMediaPublishReadyError(error);
    logPublishFailureOutcome({
      stage: "processing",
      errorCode: mapped.code,
      recoverable: true,
      mediaId,
    });
    return { ok: false, error: mapped.error };
  }
}

async function trySkipUploadForExistingSlot(
  mediaId: string,
  signal?: AbortSignal,
): Promise<PublishVideoUploadResult | null> {
  if (signal?.aborted) {
    return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
  }

  const row = await fetchPostMediaById(mediaId);
  if (!row) return null;

  if (isPostMediaPublishReady(row.video_status)) {
    return { ok: true, mediaId, skippedUpload: true };
  }

  // pending/uploading → fall through to re-init + resume byte upload (P2).
  if (row.video_status === "pending" || row.video_status === "uploading") {
    return null;
  }

  if (row.video_status === "failed") {
    return { ok: false, error: "Video processing failed." };
  }

  return null;
}

function identityFromBytes(bytes: PublishVideoBytesSource): {
  name: string;
  size: number;
  type: string;
} {
  if (bytes.kind === "file") {
    return {
      name: bytes.file.name,
      size: bytes.file.size,
      type: bytes.file.type,
    };
  }
  return {
    name: bytes.fileName,
    size: bytes.fileSize,
    type: bytes.mimeType,
  };
}

/**
 * Publish-time Bunny init → TUS → poll until post_media is processing/ready.
 * Byte upload is abstracted: web File/tus-js vs Capacitor native stream.
 * Never rejects — failures return `{ ok: false }`.
 */
export async function createPublishVideoUpload(
  options: PublishVideoUploadOptions,
): Promise<PublishVideoUploadResult> {
  try {
    return await createPublishVideoUploadInner(options);
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      logPublishFailureOutcome({
        stage: "tus",
        errorCode: "cancelled",
        recoverable: true,
      });
      return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
    }
    logPublishFailureOutcome({
      stage: "tus",
      errorCode: "unexpected",
      recoverable: true,
    });
    logPublish("publish unexpected", {
      message:
        error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { ok: false, error: VIDEO_UPLOAD_GENERIC_USER_MESSAGE };
  }
}

async function createPublishVideoUploadInner(
  options: PublishVideoUploadOptions,
): Promise<PublishVideoUploadResult> {
  const { publishPostId, bytes, signal, onProgress, onProcessing } = options;
  const posterStoragePath = options.posterStoragePath?.trim() || null;

  if (signal?.aborted) {
    return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
  }

  const existingMediaId =
    options.draftVideo?.remoteMediaId?.trim() || null;
  if (existingMediaId) {
    const skip = await trySkipUploadForExistingSlot(existingMediaId, signal);
    if (skip) {
      if (skip.ok) {
        // Still seed poster_url on reused processing/ready rows when provided.
        if (posterStoragePath) {
          const identity = identityFromBytes(bytes);
          const validation = validateBunnyVideoFile({
            name: identity.name,
            size: identity.size,
            type: identity.type,
          });
          if (validation.ok) {
            await invokeBunnyUploadInit({
              publishPostId,
              fileName: identity.name,
              fileSize: identity.size,
              mimeType: validation.mimeType,
              posterStoragePath,
            });
          }
        }
        logPublish("retry skips re-upload", { mediaId: skip.mediaId });
        onProcessing?.();
      } else {
        logPublishFailureOutcome({
          stage: "processing",
          errorCode: "processing_failed",
          recoverable: true,
          mediaId: existingMediaId,
          bunnyVideoId: options.draftVideo?.remoteVideoId ?? null,
        });
      }
      return skip;
    }
  }

  const identity = identityFromBytes(bytes);
  const validation = validateBunnyVideoFile({
    name: identity.name,
    size: identity.size,
    type: identity.type,
  });
  if (!validation.ok) {
    logPublishFailureOutcome({
      stage: "init",
      errorCode: "validation_failed",
      recoverable: true,
    });
    return { ok: false, error: validation.error };
  }

  let fileForWeb: File | null = null;
  if (bytes.kind === "file") {
    fileForWeb = await prepareDraftVideoForUpload(bytes.file);
  }

  const init = await invokeBunnyUploadInit({
    publishPostId,
    fileName: identity.name,
    fileSize: identity.size,
    mimeType: validation.mimeType,
    posterStoragePath,
  });

  if (signal?.aborted) {
    return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
  }

  if (!init.ok) {
    logPublishFailureOutcome({
      stage: "init",
      errorCode: "init_failed",
      recoverable: true,
    });
    return { ok: false, error: init.error };
  }

  // Persist remote identity before TUS so processing failures can skip re-upload
  // when the slot is already processing/ready on retry.
  updateDraftVideoRemoteIds(init.data.mediaId, init.data.videoId);

  if (!shouldStartTusForInit(init.data)) {
    onProcessing?.();
    if (isPostMediaPublishReady(init.data.videoStatus)) {
      logPublish("post_media processing gate reached", {
        status: init.data.videoStatus,
        skippedUpload: true,
      });
      return { ok: true, mediaId: init.data.mediaId, skippedUpload: true };
    }
    const processingFailure = await awaitPublishProcessingGate(
      init.data.mediaId,
      signal,
    );
    if (processingFailure) {
      return processingFailure;
    }
    logPublish("post_media processing gate reached", {
      skippedUpload: true,
    });
    return { ok: true, mediaId: init.data.mediaId, skippedUpload: true };
  }

  const videoId = init.data.videoId;

  try {
    await runBunnyTusSingleFlight(videoId, async () => {
      if (bytes.kind === "native-path") {
        logPublish("native vs web uploader", { uploader: "native-tus" });
        await uploadNativeVideoToBunnyTus({
          jobId: bytes.uploadJobId,
          filePath: bytes.filePath,
          fileSize: bytes.fileSize,
          fileName: bytes.fileName,
          mimeType: validation.mimeType,
          init: init.data,
          uploadUrl: bytes.uploadUrl,
          signal,
          onProgress: (percent) => onProgress?.(percent),
          onUploadCreated: (uploadUrl) => {
            updateDraftVideoNativeTusUploadUrl(uploadUrl);
          },
          onClearUploadUrl: () => {
            updateDraftVideoNativeTusUploadUrl(null);
          },
        });
      } else {
        logPublish("native vs web uploader", { uploader: "web-tus-js" });
        const prepared = fileForWeb!;
        await uploadFileToBunnyTus(prepared, init.data, {
          signal,
          onProgress: (percent) => onProgress?.(percent),
        });
      }
    });
  } catch (error) {
    clearBunnyTusSingleFlight(videoId);
    if (signal?.aborted || isAbortError(error)) {
      logPublishFailureOutcome({
        stage: "tus",
        errorCode: "cancelled",
        recoverable: true,
      });
      return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
    }
    const mapped = tusFailureFromUnknown(error);
    logPublishFailureOutcome({
      stage: "tus",
      errorCode: mapped.errorCode,
      recoverable: mapped.recoverable,
      mediaId: init.data.mediaId,
      bunnyVideoId: videoId,
    });
    logPublish("publish failed stage", {
      stage: "tus_upload",
      errorCode: mapped.errorCode,
    });
    return { ok: false, error: mapped.error };
  }

  if (signal?.aborted) {
    return { ok: false, error: VIDEO_UPLOAD_CANCELLED_USER_MESSAGE };
  }

  onProcessing?.();
  const processingFailure = await awaitPublishProcessingGate(
    init.data.mediaId,
    signal,
  );
  if (processingFailure) {
    // Remote mediaId/videoId already persisted — retry can skip TUS when ready.
    return processingFailure;
  }
  logPublish("post_media processing gate reached", {
    mediaId: init.data.mediaId,
  });
  return { ok: true, mediaId: init.data.mediaId, skippedUpload: false };
}
