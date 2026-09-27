/**
 * Resolve optimized DraftImage bytes for publish-time Storage upload.
 * Never uses blob: preview URLs or <img> pixels.
 */

import { loadNativeDraftImageBlob } from "./nativeDraftImageStorage";
import type { DraftImage } from "./types";
import { parseDraftImage } from "./types";
import { loadWebDraftImageBlob } from "./webDraftImageStorage";

function publishPostIdFromWebLocalReference(
  localReference: string,
): string | null {
  const parts = localReference.split("/");
  if (parts.length >= 2 && parts[0]) return parts[0];
  return null;
}

/**
 * Load the durable optimized artifact for upload (IDB Blob or native FS).
 */
export async function resolveDraftImageUploadBlob(
  draftImage: DraftImage,
  options?: { publishPostId?: string },
): Promise<Blob> {
  const parsed = parseDraftImage(draftImage);
  if (!parsed) {
    throw new Error("DRAFT_IMAGE_INVALID");
  }

  if (parsed.localStorageKind === "native-fs") {
    const blob = await loadNativeDraftImageBlob(parsed.localReference, {
      mimeType: parsed.mimeType,
    });
    if (blob && blob.size > 0) return blob;
    throw new Error("DRAFT_IMAGE_BYTES_MISSING");
  }

  const publishPostId =
    options?.publishPostId?.trim() ||
    publishPostIdFromWebLocalReference(parsed.localReference);
  if (!publishPostId) {
    throw new Error("DRAFT_IMAGE_MISSING_PUBLISH_POST_ID");
  }
  const blob = await loadWebDraftImageBlob(publishPostId, parsed.localId);
  if (!blob || blob.size <= 0) {
    throw new Error("DRAFT_IMAGE_BYTES_MISSING");
  }
  return blob;
}

export function extensionFromDraftImageMime(
  mimeType: string,
  fileName: string,
): string {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "jpeg") return "jpg";
  if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 5) return ext;
  return "webp";
}
