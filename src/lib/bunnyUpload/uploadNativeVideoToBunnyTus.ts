/**
 * Native Bunny TUS byte upload (PASS P2 / IOS2).
 * Streams from disk via EchoVideoUpload — never materializes File/base64.
 */

import {
  EchoVideoUpload,
  ECHO_VIDEO_UPLOAD_ERROR,
  type UploadCancelledEvent,
  type UploadCompletedEvent,
  type UploadCreatedEvent,
  type UploadFailedEvent,
  type UploadProgressEvent,
} from "../../plugins/echoVideoUpload";
import type {
  BunnyUploadInitResponse,
  BunnyUploadInitUploadRequired,
} from "./types";
import { assertUploadRequiredInit } from "./bunnyTusUpload";

export type NativeBunnyTusUploadParams = {
  jobId: string;
  filePath: string;
  fileSize: number;
  fileName: string;
  mimeType: string;
  init: BunnyUploadInitResponse;
  /** Persisted TUS Location for resume. */
  uploadUrl?: string | null;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  onUploadCreated?: (uploadUrl: string) => void;
  /** Called when a persisted uploadUrl is abandoned as stale. */
  onClearUploadUrl?: () => void;
};

function logNativeUpload(
  event: string,
  detail?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  console.info("[echotoo video publish]", event, detail ?? "");
}

export const VIDEO_UPLOAD_NETWORK_USER_MESSAGE =
  "Video upload interrupted. Check your connection and try again.";

export const VIDEO_UPLOAD_FILE_INACCESSIBLE_USER_MESSAGE =
  "Couldn't access the local video. Try adding it again.";

export const VIDEO_UPLOAD_AUTH_FAILED_USER_MESSAGE =
  "Video upload authorization failed.";

export const VIDEO_UPLOAD_CANCELLED_USER_MESSAGE = "Upload cancelled.";

export const VIDEO_UPLOAD_GENERIC_USER_MESSAGE =
  "Video upload failed. Please try again.";

export type NativeVideoUploadFailureKind =
  | "cancelled"
  | "network"
  | "file_inaccessible"
  | "auth_failed"
  | "unavailable"
  | "unknown";

/**
 * Classify plugin error codes using only codes defined in ECHO_VIDEO_UPLOAD_ERROR.
 * Unfamiliar codes → unknown (safe generic message).
 */
export function classifyEchoVideoUploadErrorCode(
  code: string | null | undefined,
): NativeVideoUploadFailureKind {
  const c = (code ?? "").trim();
  if (!c) return "unknown";
  if (c === ECHO_VIDEO_UPLOAD_ERROR.cancelled) return "cancelled";
  if (c === ECHO_VIDEO_UPLOAD_ERROR.network_failed) return "network";
  if (c === ECHO_VIDEO_UPLOAD_ERROR.auth_failed) return "auth_failed";
  if (c === ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable) {
    return "unavailable";
  }
  if (
    c === ECHO_VIDEO_UPLOAD_ERROR.file_missing ||
    c === ECHO_VIDEO_UPLOAD_ERROR.file_empty ||
    c === ECHO_VIDEO_UPLOAD_ERROR.path_not_allowed ||
    c === ECHO_VIDEO_UPLOAD_ERROR.file_size_mismatch
  ) {
    return "file_inaccessible";
  }
  return "unknown";
}

export function userFacingUploadError(code: string): string {
  const kind = classifyEchoVideoUploadErrorCode(code);
  switch (kind) {
    case "cancelled":
      return VIDEO_UPLOAD_CANCELLED_USER_MESSAGE;
    case "network":
      return VIDEO_UPLOAD_NETWORK_USER_MESSAGE;
    case "auth_failed":
      return VIDEO_UPLOAD_AUTH_FAILED_USER_MESSAGE;
    case "unavailable":
      return "Video upload is unavailable on this device. Please update the app and try again.";
    case "file_inaccessible":
      return VIDEO_UPLOAD_FILE_INACCESSIBLE_USER_MESSAGE;
    case "unknown":
    default:
      return VIDEO_UPLOAD_GENERIC_USER_MESSAGE;
  }
}

const RESUME_URL_RETRY_CODES = new Set<string>([
  ECHO_VIDEO_UPLOAD_ERROR.tus_head_failed,
  ECHO_VIDEO_UPLOAD_ERROR.tus_offset_invalid,
  ECHO_VIDEO_UPLOAD_ERROR.tus_location_missing,
]);

async function runNativeTusOnce(
  params: NativeBunnyTusUploadParams & {
    init: BunnyUploadInitUploadRequired;
    uploadUrl?: string | null;
  },
): Promise<void> {
  const { jobId, init, signal } = params;
  const handles: Array<{ remove: () => Promise<void> }> = [];

  const removeListeners = async () => {
    await Promise.all(
      handles.map((h) => h.remove().catch(() => undefined)),
    );
    handles.length = 0;
  };

  type Outcome =
    | { kind: "completed"; event: UploadCompletedEvent }
    | { kind: "failed"; code: string }
    | { kind: "cancelled" };

  const outcome = await new Promise<Outcome>((resolve) => {
    let settled = false;
    const settle = (value: Outcome) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const onAbort = () => {
      void EchoVideoUpload.cancelVideoUpload({ jobId }).catch(() => undefined);
      settle({ kind: "cancelled" });
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    void (async () => {
      try {
        handles.push(
          await EchoVideoUpload.addListener(
            "uploadProgress",
            (event: UploadProgressEvent) => {
              if (event.jobId !== jobId) return;
              if (event.bytesTotal <= 0) return;
              const percent = Math.round(
                Math.max(0, Math.min(1, event.progress)) * 100,
              );
              params.onProgress?.(percent);
            },
          ),
        );
        handles.push(
          await EchoVideoUpload.addListener(
            "uploadCreated",
            (event: UploadCreatedEvent) => {
              if (event.jobId !== jobId) return;
              logNativeUpload("upload created", { resumed: false });
              params.onUploadCreated?.(event.uploadUrl);
            },
          ),
        );
        handles.push(
          await EchoVideoUpload.addListener(
            "uploadCompleted",
            (event: UploadCompletedEvent) => {
              if (event.jobId !== jobId) return;
              settle({ kind: "completed", event });
            },
          ),
        );
        handles.push(
          await EchoVideoUpload.addListener(
            "uploadFailed",
            (event: UploadFailedEvent) => {
              if (event.jobId !== jobId) return;
              settle({
                kind: "failed",
                code: event.code || ECHO_VIDEO_UPLOAD_ERROR.network_failed,
              });
            },
          ),
        );
        handles.push(
          await EchoVideoUpload.addListener(
            "uploadCancelled",
            (event: UploadCancelledEvent) => {
              if (event.jobId !== jobId) return;
              settle({ kind: "cancelled" });
            },
          ),
        );

        const existingUrl = params.uploadUrl?.trim() || null;
        if (existingUrl) {
          logNativeUpload("upload resumed", {});
        } else {
          logNativeUpload("native vs web uploader", { uploader: "native-tus" });
        }

        await EchoVideoUpload.startVideoUpload({
          jobId,
          filePath: params.filePath,
          tusEndpoint: init.tusEndpoint,
          fileSize: params.fileSize,
          headers: {
            AuthorizationSignature: init.authorizationSignature,
            AuthorizationExpire: String(init.authorizationExpire),
            VideoId: init.videoId,
            LibraryId: init.libraryId,
          },
          metadata: {
            filetype: params.mimeType,
            title: params.fileName,
          },
          uploadUrl: existingUrl,
        });
      } catch (err) {
        const e = err as { code?: string };
        settle({
          kind: "failed",
          code: e.code || ECHO_VIDEO_UPLOAD_ERROR.network_failed,
        });
      }
    })();
  });

  await removeListeners();

  if (outcome.kind === "cancelled" || signal?.aborted) {
    throw new DOMException("Upload cancelled.", "AbortError");
  }

  if (outcome.kind === "failed") {
    const error = new Error(userFacingUploadError(outcome.code)) as Error & {
      code?: string;
    };
    error.code = outcome.code;
    throw error;
  }

  params.onProgress?.(100);
  logNativeUpload("upload completed", {
    bytesUploaded: outcome.event.bytesUploaded,
    bytesTotal: outcome.event.bytesTotal,
  });
}

/**
 * Stream an app-owned draft video path to Bunny via EchoVideoUpload.
 * Never falls back to JS full-byte video loading (PASS IOS3).
 */
export async function uploadNativeVideoToBunnyTus(
  params: NativeBunnyTusUploadParams,
): Promise<void> {
  assertUploadRequiredInit(params.init);
  const init = params.init;

  let caps: { available: boolean; streaming: boolean };
  try {
    caps = await EchoVideoUpload.getCapabilities();
  } catch {
    logNativeUpload("native upload capabilities failed", {});
    const error = new Error(
      userFacingUploadError(
        ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable,
      ),
    ) as Error & { code?: string };
    error.code = ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable;
    throw error;
  }

  if (!caps.available || !caps.streaming) {
    logNativeUpload("native upload unavailable", {
      available: caps.available,
      streaming: caps.streaming,
    });
    const error = new Error(
      userFacingUploadError(
        ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable,
      ),
    ) as Error & { code?: string };
    error.code = ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable;
    throw error;
  }

  try {
    await runNativeTusOnce({ ...params, init });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "")
        : "";
    const hadUrl = Boolean(params.uploadUrl?.trim());
    if (
      hadUrl &&
      RESUME_URL_RETRY_CODES.has(code) &&
      !params.signal?.aborted
    ) {
      logNativeUpload("stale uploadUrl — retry without resume", { code });
      params.onClearUploadUrl?.();
      await runNativeTusOnce({ ...params, init, uploadUrl: null });
      return;
    }
    throw err;
  }
}
