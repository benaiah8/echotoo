/**
 * Platform-neutral draft video preparation (PASS C3 + IOS1).
 * Android → EchoVideoPrepare Media3. iOS → AVFoundation. Web → no encoder.
 */

import { Capacitor } from "@capacitor/core";
import {
  EchoVideoPrepare,
  ECHO_VIDEO_PREPARE_ERROR,
  type PrepareCompletedEvent,
  type PrepareFailedEvent,
  type PrepareProgressEvent,
} from "../../plugins/echoVideoPrepare";
import { isNativeApp } from "../storage/utils/capacitorDetection";
import { VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE } from "./createVideoConstraints";
import { PREPARE_FAILED_USER_MESSAGE } from "./createVideoPreparationConstants";
import type { VideoPreparationPolicyResult } from "./createVideoPreparationPolicy";
import {
  encoderSettingsFromPreparationPolicy,
  publishPostIdFromDraftLocalReference,
} from "./encoderSettingsFromPolicy";
import {
  buildNativePreparedVideoPath,
  buildNativePreparedVideoTempPath,
} from "./preparedVideoPaths";
import type { DraftVideo } from "./types";
import {
  validatePreparedArtifactExists,
  validatePreparedArtifactMetadata,
} from "./validatePreparedVideoArtifact";
import {
  PREPARE_ERROR_ENCODER_NOT_IMPLEMENTED,
  applyPreparationDecisionAfterSourceReady,
  markPassthroughPrepared,
  markPrepareFailed,
  markPreparing,
  markTranscodePrepared,
} from "./videoPreparationState";
import {
  markVideoCrashCheckpoint,
  markVideoCrashDraftFileState,
  setVideoCrashCheckpoint,
} from "../videoCrashDiagnostics";
import {
  PREPARE_WATCHDOG_ABSOLUTE_MS,
  PREPARE_WATCHDOG_STALL_MS,
  PREPARE_WATCHDOG_START_MS,
  createNativeOperationWatchdog,
  isMeaningfulPrepareProgress,
} from "./nativeOperationWatchdog";

export type PrepareDraftVideoInput = {
  draftVideo: DraftVideo;
  policy: VideoPreparationPolicyResult;
  signal?: AbortSignal;
  /** 0..1 when a real encoder reports progress; null = indeterminate. */
  onProgress?: (progress: number | null) => void;
  /** Optional stable job id (controller supplies for cancel matching). */
  jobId?: string;
};

export type PrepareDraftVideoResult =
  | { ok: true; draftVideo: DraftVideo }
  | {
      ok: false;
      draftVideo: DraftVideo;
      errorCode: string;
      message: string;
    };

function userMessageForPrepareFailure(code: string): string {
  if (code === ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high) {
    return VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE;
  }
  return PREPARE_FAILED_USER_MESSAGE;
}

function logPrepare(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // Avoid full filesystem paths in logs.
  console.info("[echotoo video prepare]", event, detail ?? "");
}

/**
 * True when a native EchoVideoPrepare encoder may be invoked (Android Media3
 * or iOS AVFoundation). Web always false.
 */
export function isNativeEchoVideoPrepareAvailable(): boolean {
  try {
    if (!isNativeApp()) return false;
    const platform = Capacitor.getPlatform();
    return platform === "android" || platform === "ios";
  } catch {
    return false;
  }
}

/**
 * @deprecated Prefer {@link isNativeEchoVideoPrepareAvailable}. Kept as an
 * Android-named alias for older call sites; now platform-neutral.
 */
export function isAndroidEchoVideoPrepareAvailable(): boolean {
  return isNativeEchoVideoPrepareAvailable();
}

/**
 * Run preparation for one draft video.
 * Passthrough is immediate. Transcode uses native EchoVideoPrepare when available.
 */
export async function prepareDraftVideo(
  input: PrepareDraftVideoInput,
): Promise<PrepareDraftVideoResult> {
  if (input.signal?.aborted) {
    return {
      ok: false,
      draftVideo: input.draftVideo,
      errorCode: "cancelled",
      message: PREPARE_FAILED_USER_MESSAGE,
    };
  }

  if (input.policy.strategy === "passthrough") {
    input.onProgress?.(null);
    return {
      ok: true,
      draftVideo: markPassthroughPrepared(input.draftVideo),
    };
  }

  // Ensure strategy metadata is applied.
  let draft = applyPreparationDecisionAfterSourceReady(
    input.draftVideo,
    input.policy,
  );

  if (!isNativeEchoVideoPrepareAvailable()) {
    logPrepare("skip-non-native", { localId: draft.localId });
    return {
      ok: false,
      draftVideo: {
        ...draft,
        prepareErrorCode: PREPARE_ERROR_ENCODER_NOT_IMPLEMENTED,
      },
      errorCode: PREPARE_ERROR_ENCODER_NOT_IMPLEMENTED,
      message: PREPARE_FAILED_USER_MESSAGE,
    };
  }

  markVideoCrashCheckpoint("prepare-capabilities");
  let caps;
  try {
    caps = await EchoVideoPrepare.getCapabilities();
  } catch {
    caps = null;
  }
  if (!caps?.encoderImplemented) {
    logPrepare("encoder-unavailable", { localId: draft.localId });
    markVideoCrashCheckpoint("prepare-failed");
    return {
      ok: false,
      draftVideo: markPrepareFailed(
        draft,
        ECHO_VIDEO_PREPARE_ERROR.encoder_unavailable,
      ),
      errorCode: ECHO_VIDEO_PREPARE_ERROR.encoder_unavailable,
      message: PREPARE_FAILED_USER_MESSAGE,
    };
  }

  const publishPostId = publishPostIdFromDraftLocalReference(draft.localReference);
  if (!publishPostId) {
    return {
      ok: false,
      draftVideo: markPrepareFailed(draft, "invalid_options"),
      errorCode: "invalid_options",
      message: PREPARE_FAILED_USER_MESSAGE,
    };
  }

  const settings = encoderSettingsFromPreparationPolicy(input.policy, draft);
  const jobId =
    input.jobId?.trim() ||
    `prep-${draft.localId}-${Date.now().toString(36)}`;
  const destinationPath = buildNativePreparedVideoPath(
    publishPostId,
    draft.localId,
  );
  const temporaryPath = buildNativePreparedVideoTempPath(
    publishPostId,
    draft.localId,
  );

  draft = markPreparing(draft, null);
  input.onProgress?.(null);

  markVideoCrashDraftFileState("exists_before_prepare");

  logPrepare("start", {
    localId: draft.localId,
    jobId,
    targetLongEdge: settings.targetLongEdge,
    targetVideoBitrate: settings.targetVideoBitrate,
    targetFps: settings.targetFps,
    reason: input.policy.reason,
  });

  const handles: Array<{ remove: () => Promise<void> }> = [];
  const removeListeners = async () => {
    await Promise.all(
      handles.map((h) => h.remove().catch(() => undefined)),
    );
    handles.length = 0;
  };

  try {
    const outcome = await new Promise<
      | { kind: "completed"; event: PrepareCompletedEvent }
      | { kind: "failed"; code: string; message?: string }
      | { kind: "cancelled" }
    >( (resolve) => {
      let settled = false;
      let lastMeaningfulProgress: number | null = null;
      const settle = (
        value:
          | { kind: "completed"; event: PrepareCompletedEvent }
          | { kind: "failed"; code: string; message?: string }
          | { kind: "cancelled" },
      ) => {
        if (settled) return;
        settled = true;
        watchdog.dispose();
        resolve(value);
      };
      const watchdog = createNativeOperationWatchdog({
        startTimeoutMs: PREPARE_WATCHDOG_START_MS,
        stallTimeoutMs: PREPARE_WATCHDOG_STALL_MS,
        absoluteTimeoutMs: PREPARE_WATCHDOG_ABSOLUTE_MS,
        onTimeout: () => {
          void EchoVideoPrepare.cancelPreparation({ jobId }).catch(
            () => undefined,
          );
          settle({
            kind: "failed",
            code: ECHO_VIDEO_PREPARE_ERROR.prepare_timeout,
          });
        },
      });

      const onAbort = () => {
        void EchoVideoPrepare.cancelPreparation({ jobId }).catch(() => undefined);
        settle({ kind: "cancelled" });
      };

      if (input.signal) {
        if (input.signal.aborted) {
          onAbort();
          return;
        }
        input.signal.addEventListener("abort", onAbort, { once: true });
      }

      void (async () => {
        try {
          handles.push(
            await EchoVideoPrepare.addListener(
              "prepareProgress",
              (event: PrepareProgressEvent) => {
                if (event.jobId !== jobId) return;
                markVideoCrashCheckpoint("prepare-progress");
                const progress =
                  typeof event.progress === "number" &&
                  Number.isFinite(event.progress)
                    ? Math.max(0, Math.min(1, event.progress))
                    : null;
                if (
                  isMeaningfulPrepareProgress(progress, lastMeaningfulProgress)
                ) {
                  lastMeaningfulProgress = progress as number;
                  watchdog.markActivity();
                }
                input.onProgress?.(progress);
              },
            ),
          );
          handles.push(
            await EchoVideoPrepare.addListener(
              "prepareCompleted",
              (event: PrepareCompletedEvent) => {
                if (event.jobId !== jobId) return;
                settle({ kind: "completed", event });
              },
            ),
          );
          handles.push(
            await EchoVideoPrepare.addListener(
              "prepareFailed",
              (event: PrepareFailedEvent) => {
                if (event.jobId !== jobId) return;
                settle({
                  kind: "failed",
                  code: event.code || ECHO_VIDEO_PREPARE_ERROR.encode_failed,
                  message: event.message,
                });
              },
            ),
          );
          handles.push(
            await EchoVideoPrepare.addListener("prepareCancelled", (event) => {
              if (event.jobId !== jobId) return;
              settle({ kind: "cancelled" });
            }),
          );

          markVideoCrashCheckpoint("prepare-listeners-ready");

          // CRITICAL: persist before crossing into native Media3 / MediaCodec.
          await setVideoCrashCheckpoint("prepare-start");

          try {
            await EchoVideoPrepare.prepareVideo({
              jobId,
              sourcePath: draft.localReference,
              destinationPath,
              temporaryPath,
              targetLongEdge: settings.targetLongEdge,
              targetVideoBitrate: settings.targetVideoBitrate,
              targetFps: settings.targetFps,
              audioBitrate: settings.audioBitrate,
            });
            markVideoCrashCheckpoint("prepare-accepted");
            watchdog.markAccepted();
          } catch (err) {
            const e = err as { code?: string; message?: string };
            settle({
              kind: "failed",
              code: e.code || ECHO_VIDEO_PREPARE_ERROR.encode_failed,
              message: e.message,
            });
          }
        } catch (err) {
          const e = err as { code?: string; message?: string };
          settle({
            kind: "failed",
            code: e.code || ECHO_VIDEO_PREPARE_ERROR.encode_failed,
            message: e.message,
          });
        }
      })();
    });

    await removeListeners();

    if (outcome.kind === "cancelled" || input.signal?.aborted) {
      logPrepare("cancelled", { localId: draft.localId, jobId });
      markVideoCrashCheckpoint("prepare-cancel");
      return {
        ok: false,
        draftVideo: draft,
        errorCode: "cancelled",
        message: PREPARE_FAILED_USER_MESSAGE,
      };
    }

    if (outcome.kind === "failed") {
      logPrepare("failed", {
        localId: draft.localId,
        jobId,
        code: outcome.code,
      });
      markVideoCrashCheckpoint("prepare-failed");
      const failed = markPrepareFailed(draft, outcome.code);
      return {
        ok: false,
        draftVideo: failed,
        errorCode: outcome.code,
        message: userMessageForPrepareFailure(outcome.code),
      };
    }

    const completed = outcome.event;
    const preparedDraft = markTranscodePrepared(draft, {
      preparedReference: completed.outputPath,
      preparedStorageKind: "native-fs",
      preparedMimeType: completed.mimeType || "video/mp4",
      preparedSizeBytes: completed.sizeBytes,
      preparedWidth: completed.width,
      preparedHeight: completed.height,
      preparedDuration:
        completed.durationMs > 0 ? completed.durationMs / 1000 : null,
    });

    const metaOk = validatePreparedArtifactMetadata(preparedDraft);
    if (!metaOk.ok) {
      logPrepare("output-invalid-meta", {
        localId: draft.localId,
        code: metaOk.errorCode,
      });
      markVideoCrashCheckpoint("prepare-failed");
      return {
        ok: false,
        draftVideo: markPrepareFailed(draft, metaOk.errorCode),
        errorCode: metaOk.errorCode,
        message: PREPARE_FAILED_USER_MESSAGE,
      };
    }
    const existsOk = await validatePreparedArtifactExists(preparedDraft);
    if (!existsOk.ok) {
      logPrepare("output-invalid-exists", {
        localId: draft.localId,
        code: existsOk.errorCode,
      });
      markVideoCrashCheckpoint("prepare-failed");
      return {
        ok: false,
        draftVideo: markPrepareFailed(draft, existsOk.errorCode),
        errorCode: existsOk.errorCode,
        message: PREPARE_FAILED_USER_MESSAGE,
      };
    }

    logPrepare("completed", {
      localId: draft.localId,
      jobId,
      sizeBytes: completed.sizeBytes,
      width: completed.width,
      height: completed.height,
    });
    markVideoCrashCheckpoint("prepare-complete");
    input.onProgress?.(null);
    return { ok: true, draftVideo: preparedDraft };
  } catch (err) {
    await removeListeners();
    const message = err instanceof Error ? err.message : String(err);
    logPrepare("exception", { localId: draft.localId, message });
    markVideoCrashCheckpoint("prepare-failed");
    return {
      ok: false,
      draftVideo: markPrepareFailed(
        draft,
        ECHO_VIDEO_PREPARE_ERROR.encode_failed,
      ),
      errorCode: ECHO_VIDEO_PREPARE_ERROR.encode_failed,
      message: PREPARE_FAILED_USER_MESSAGE,
    };
  }
}
