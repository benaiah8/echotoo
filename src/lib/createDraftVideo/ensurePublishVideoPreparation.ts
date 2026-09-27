/**
 * Publish-time preparation gate (PASS P2).
 * Ensures the correct local asset is ready before Bunny init/upload.
 */

import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "../storage/utils/capacitorDetection";
import { PREPARE_FAILED_USER_MESSAGE } from "./createVideoPreparationConstants";
import { resolveVideoPreparationPolicy } from "./createVideoPreparationPolicy";
import {
  awaitActiveDraftVideoPreparation,
  ensureDraftVideoPreparationStarted,
  type DraftVideoPreparationCallbacks,
} from "./draftVideoPreparationController";
import { readDraftVideoMeta } from "./draftVideoMeta";
import { isNativeEchoVideoPrepareAvailable } from "./prepareDraftVideo";
import { resolveVideoPublishPreparationState } from "./resolveVideoPublishPreparationState";
import type { DraftVideo } from "./types";
import { clearPreparedArtifactFields } from "./videoPreparationState";
import { writeDraftVideoMeta } from "./draftVideoMeta";

export type EnsurePublishVideoPreparationResult =
  | { ok: true; draft: DraftVideo }
  | { ok: false; error: string };

export type EnsurePublishVideoPreparationOptions = {
  signal?: AbortSignal;
  /** Invoked when Publish must wait on / start native preparation. */
  onPreparing?: () => void;
  callbacks?: DraftVideoPreparationCallbacks;
};

function logPublishPrep(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info("[echotoo video publish]", event, detail ?? "");
}

function isNativePublishPrepPlatform(): boolean {
  try {
    return isNativeEchoVideoPrepareAvailable();
  } catch {
    return false;
  }
}

function refreshDraft(localId: string, fallback: DraftVideo): DraftVideo {
  const latest = readDraftVideoMeta();
  if (latest?.localId === localId) return latest;
  return fallback;
}

/**
 * Block Publish until preparation is ready on native (Android/iOS), or allow
 * web legacy source upload when no native encoder is available.
 */
export async function ensurePublishVideoPreparation(
  draftVideo: DraftVideo,
  options: EnsurePublishVideoPreparationOptions = {},
): Promise<EnsurePublishVideoPreparationResult> {
  let draft = draftVideo;
  const nativePrep = isNativePublishPrepPlatform();

  const checkAborted = (): EnsurePublishVideoPreparationResult | null => {
    if (options.signal?.aborted) {
      return { ok: false, error: "Upload cancelled." };
    }
    return null;
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const aborted = checkAborted();
    if (aborted) return aborted;

    draft = refreshDraft(draft.localId, draft);
    const state = resolveVideoPublishPreparationState(draft);
    logPublishPrep("preparation gate", { state, attempt });

    if (state === "blocked_prepare_failed") {
      return { ok: false, error: PREPARE_FAILED_USER_MESSAGE };
    }

    if (state === "ready_source" || state === "ready_prepared") {
      return { ok: true, draft };
    }

    if (!nativePrep) {
      // Web: no native encoder — keep legacy Publish on source File.
      logPublishPrep("preparation skip non-native", { state });
      return { ok: true, draft };
    }

    options.onPreparing?.();

    if (state === "wait_preparing") {
      logPublishPrep("publish waiting for preparation", {
        localId: draft.localId,
      });
      await awaitActiveDraftVideoPreparation(draft.localId);
      draft = refreshDraft(draft.localId, draft);
      const after = resolveVideoPublishPreparationState(draft);
      if (after === "blocked_prepare_failed") {
        return { ok: false, error: PREPARE_FAILED_USER_MESSAGE };
      }
      if (after === "ready_source" || after === "ready_prepared") {
        return { ok: true, draft };
      }
      // Fall through to needs_prepare if still stuck.
    }

    if (
      state === "needs_prepare" ||
      resolveVideoPublishPreparationState(draft) === "needs_prepare"
    ) {
      // Incomplete "prepared" metadata → reset and re-run encoder once.
      if (
        draft.preparationStatus === "prepared" &&
        draft.preparationStrategy === "transcode"
      ) {
        draft = {
          ...clearPreparedArtifactFields(draft),
          preparationStatus: "local_ready",
          preparationStrategy: "transcode",
        };
        writeDraftVideoMeta(draft);
        options.callbacks?.onDraftUpdated(draft);
      }

      const policy = resolveVideoPreparationPolicy({
        durationSeconds: draft.duration,
        sizeBytes: draft.size,
        width: draft.width,
        height: draft.height,
        mimeType: draft.mimeType,
      });

      logPublishPrep("needs_prepare start once", {
        localId: draft.localId,
        strategy: policy.strategy,
      });

      const callbacks: DraftVideoPreparationCallbacks = options.callbacks ?? {
        onDraftUpdated: () => undefined,
      };

      await ensureDraftVideoPreparationStarted(draft, policy, callbacks);
      // If ensure returned early because a job was already active, await it.
      await awaitActiveDraftVideoPreparation(draft.localId);

      draft = refreshDraft(draft.localId, draft);
      const after = resolveVideoPublishPreparationState(draft);
      if (after === "blocked_prepare_failed") {
        return { ok: false, error: PREPARE_FAILED_USER_MESSAGE };
      }
      if (after === "ready_source" || after === "ready_prepared") {
        return { ok: true, draft };
      }
    }
  }

  return { ok: false, error: PREPARE_FAILED_USER_MESSAGE };
}

/** True when Android or iOS native streaming upload should be used (PASS IOS2). */
export function isNativeEchoVideoUploadPlatform(): boolean {
  try {
    if (!isNativeApp()) return false;
    const platform = Capacitor.getPlatform();
    return platform === "android" || platform === "ios";
  } catch {
    return false;
  }
}

/**
 * True when native EchoVideoUpload may be invoked (Android OkHttp or iOS URLSession).
 * Web always false. Same sync platform gate as {@link isNativeEchoVideoUploadPlatform}.
 * Runtime plugin availability is enforced in uploadNativeVideoToBunnyTus via
 * getCapabilities() — failure is explicit (no JS full-byte fallback).
 */
export function isNativeEchoVideoUploadAvailable(): boolean {
  return isNativeEchoVideoUploadPlatform();
}

/** True when Android native streaming upload should be used. */
export function isAndroidNativeVideoUploadPlatform(): boolean {
  try {
    return isNativeApp() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}
