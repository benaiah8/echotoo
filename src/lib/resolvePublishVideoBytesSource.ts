/**
 * Resolve Publish byte-upload source after preparation gate (PASS P2 + IOS1–IOS3).
 *
 * Routing:
 * - Capacitor Android/iOS → native-path (EchoVideoUpload; never JS full-byte video)
 * - Web → File via resolveFile (tus-js-client)
 */

import type { DraftVideo } from "./createDraftVideo/types";
import {
  isNativeEchoVideoUploadPlatform,
} from "./createDraftVideo/ensurePublishVideoPreparation";
import { statNativeDraftVideoBytes } from "./createDraftVideo/nativeDraftVideoStorage";
import { resolvePreparedUploadAsset } from "./createDraftVideo/resolvePreparedUploadAsset";
import { resolveVideoPublishPreparationState } from "./createDraftVideo/resolveVideoPublishPreparationState";
import type { PublishVideoBytesSource } from "./createPublishVideoUpload";

function logPublish(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.info("[echotoo video publish]", event, detail ?? "");
}

function basenameFromReference(reference: string, fallback: string): string {
  const cleaned = reference.replace(/\\/g, "/");
  const parts = cleaned.split("/");
  const last = parts[parts.length - 1]?.trim();
  return last || fallback;
}

export type ResolvePublishVideoBytesResult =
  | { ok: true; bytes: PublishVideoBytesSource; assetKind: "source" | "prepared" }
  | { ok: false; error: string };

/**
 * Capacitor Android/iOS → native-path only (no File / base64 / Blob for video bytes).
 * Web → File via resolveFile (tus-js-client).
 *
 * There is no JS full-memory fallback when native upload is required.
 */
export async function resolvePublishVideoBytesSource(options: {
  draft: DraftVideo;
  /** Web only — File materialization for tus-js. Not used on Capacitor native. */
  resolveFile: () => Promise<File | null>;
  uploadJobId: string;
}): Promise<ResolvePublishVideoBytesResult> {
  const { draft, resolveFile, uploadJobId } = options;
  const state = resolveVideoPublishPreparationState(draft);
  const preparedAsset = resolvePreparedUploadAsset(draft);
  const nativeUploadRequired = isNativeEchoVideoUploadPlatform();

  let assetKind: "source" | "prepared" = "source";
  let reference = draft.localReference;
  let mimeType = draft.mimeType;
  let sizeBytes = draft.size;
  let fileName = draft.fileName;

  if (state === "ready_prepared" && preparedAsset && !preparedAsset.isSourcePassthrough) {
    assetKind = "prepared";
    reference = preparedAsset.reference;
    mimeType = preparedAsset.mimeType || "video/mp4";
    sizeBytes = preparedAsset.sizeBytes;
    fileName = basenameFromReference(reference, `${draft.localId}.prepared.mp4`);
  } else if (preparedAsset?.isSourcePassthrough || state === "ready_source") {
    assetKind = "source";
    reference = draft.localReference;
    mimeType = draft.mimeType;
    sizeBytes = draft.size;
    fileName = draft.fileName;
  } else if (!nativeUploadRequired) {
    // Web without resolved prep state: upload whatever File we can resolve.
    assetKind = "source";
  } else {
    return {
      ok: false,
      error: "Couldn't prepare the video. Try a shorter or smaller video.",
    };
  }

  logPublish("asset kind", {
    kind: assetKind,
    storageKind: draft.localStorageKind,
  });

  if (nativeUploadRequired) {
    if (draft.localStorageKind !== "native-fs") {
      return { ok: false, error: "Local video is missing." };
    }
    // Lightweight size check — no full-file read.
    const statted = await statNativeDraftVideoBytes(reference);
    if (typeof statted === "number" && statted > 0) {
      sizeBytes = statted;
    }
    if (sizeBytes <= 0) {
      return { ok: false, error: "Local video is missing." };
    }

    return {
      ok: true,
      assetKind,
      bytes: {
        kind: "native-path",
        filePath: reference,
        fileName,
        mimeType,
        fileSize: sizeBytes,
        uploadUrl: draft.nativeTusUploadUrl ?? null,
        uploadJobId,
      },
    };
  }

  // Web → tus-js File/Blob (browser memory is expected; no Capacitor base64 bridge).
  const file = await resolveFile();
  if (!file) {
    return { ok: false, error: "Local video is missing." };
  }

  return {
    ok: true,
    assetKind,
    bytes: { kind: "file", file },
  };
}
