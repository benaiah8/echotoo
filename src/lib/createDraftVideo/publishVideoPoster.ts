/**
 * PV3.4 — reuse Create local poster → optimize → upload tiny poster to media bucket.
 */

import {
  deleteMediaStorageObject,
  MEDIA_STORAGE_BUCKET,
  uploadNormalizedPostImage,
} from "../../api/services/mediaUpload";
import { imgUrlPublic } from "../img";
import {
  normalizeImageForUploadWithPolicy,
  type ImageNormalizePolicy,
} from "../postImagePipeline";
import type { NormalizedPostImage } from "../postImagePipeline";
import {
  extractVideoPosterFrame,
  extractVideoPosterFrameFromSrc,
  DRAFT_VIDEO_POSTER_MAX_EDGE_PX,
} from "./extractVideoPosterFrame";
import {
  readDraftVideoMeta,
  updateDraftVideoRemotePoster,
} from "./draftVideoMeta";
import type { DraftVideo } from "./types";
import { loadNativeDraftVideoFile } from "./nativeDraftVideoStorage";
import { loadWebDraftVideoFile } from "./webDraftVideoStorage";
import { isNativeApp } from "../storage/utils/capacitorDetection";

/** Keep long edge at Create poster cap; prefer WebP. */
export const VIDEO_POSTER_UPLOAD_POLICY: ImageNormalizePolicy = {
  maxEdgePx: DRAFT_VIDEO_POSTER_MAX_EDGE_PX,
  webpQuality: 0.8,
  jpegQuality: 0.82,
};

const OWNED_POST_POSTER_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/post\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png)$/i;

export function isOwnedPostMediaPosterStoragePath(
  path: string,
  userId: string,
): boolean {
  const trimmed = path.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) {
    return false;
  }
  const uid = userId.trim();
  if (!uid || !trimmed.startsWith(`${uid}/post/`)) return false;
  return OWNED_POST_POSTER_PATH_RE.test(trimmed);
}

export type EnsurePublishVideoPosterOptions = {
  userId: string;
  draftVideo?: DraftVideo | null;
  /** Session-only Create poster object URL. */
  localPosterUrl?: string | null;
  /** Optional local preview URL for re-extract fallback. */
  localPreviewUrl?: string | null;
  localFile?: File | Blob | null;
};

export type EnsurePublishVideoPosterResult = {
  storagePath: string;
  publicUrl: string;
  bytes: number;
  reusedRemote: boolean;
};

async function blobFromLocalPosterUrl(
  localPosterUrl: string,
): Promise<Blob | null> {
  try {
    const res = await fetch(localPosterUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size <= 0) return null;
    return blob;
  } catch {
    return null;
  }
}

async function obtainPosterJpegBlob(
  options: EnsurePublishVideoPosterOptions,
): Promise<Blob | null> {
  const localPoster = options.localPosterUrl?.trim() || "";
  if (localPoster) {
    const fromUrl = await blobFromLocalPosterUrl(localPoster);
    if (fromUrl) return fromUrl;
  }

  const preview = options.localPreviewUrl?.trim() || "";
  if (preview) {
    try {
      const frame = await extractVideoPosterFrameFromSrc(preview);
      return frame.blob;
    } catch {
      /* fall through */
    }
  }

  let file = options.localFile ?? null;
  if (!file) {
    const draft = options.draftVideo ?? readDraftVideoMeta();
    if (draft?.localReference) {
      try {
        file = isNativeApp()
          ? await loadNativeDraftVideoFile(draft.localReference, {
              fileName: draft.fileName,
              mimeType: draft.mimeType,
            })
          : await loadWebDraftVideoFile(draft.localReference);
      } catch {
        file = null;
      }
    }
  }
  if (file) {
    try {
      const frame = await extractVideoPosterFrame(file);
      return frame.blob;
    } catch {
      return null;
    }
  }
  return null;
}

async function optimizePosterBlob(blob: Blob): Promise<NormalizedPostImage> {
  const type = (blob.type || "image/jpeg").toLowerCase();
  const file = new File(
    [blob],
    type.includes("png") ? "video-poster.png" : "video-poster.jpg",
    { type: type.startsWith("image/") ? type : "image/jpeg" },
  );
  return normalizeImageForUploadWithPolicy(file, VIDEO_POSTER_UPLOAD_POLICY);
}

/**
 * Resolve or upload the tiny publish poster. Retries reuse remotePosterStoragePath.
 */
export async function ensurePublishVideoPoster(
  options: EnsurePublishVideoPosterOptions,
): Promise<EnsurePublishVideoPosterResult | null> {
  const userId = options.userId.trim();
  if (!userId) return null;

  const draft = options.draftVideo ?? readDraftVideoMeta();
  const existingPath = draft?.remotePosterStoragePath?.trim() || "";
  const existingUrl = draft?.remotePosterUrl?.trim() || "";
  if (
    existingPath &&
    isOwnedPostMediaPosterStoragePath(existingPath, userId)
  ) {
    const publicUrl =
      existingUrl || imgUrlPublic(existingPath, MEDIA_STORAGE_BUCKET) || "";
    if (publicUrl) {
      return {
        storagePath: existingPath,
        publicUrl,
        bytes: 0,
        reusedRemote: true,
      };
    }
  }

  const jpegBlob = await obtainPosterJpegBlob(options);
  if (!jpegBlob) return null;

  const normalized = await optimizePosterBlob(jpegBlob);
  const storagePath = await uploadNormalizedPostImage(normalized, { userId });
  if (!isOwnedPostMediaPosterStoragePath(storagePath, userId)) {
    // Should not happen with uploadNormalizedPostImage; refuse to persist.
    await deleteMediaStorageObject(storagePath);
    return null;
  }
  const publicUrl = imgUrlPublic(storagePath, MEDIA_STORAGE_BUCKET);
  if (!publicUrl) {
    await deleteMediaStorageObject(storagePath);
    return null;
  }

  updateDraftVideoRemotePoster(storagePath, publicUrl);
  return {
    storagePath,
    publicUrl,
    bytes: normalized.blob.size,
    reusedRemote: false,
  };
}

/**
 * Best-effort delete of a draft-owned poster Storage object.
 * Prefer orphan over destructive delete when ownership is unproven.
 */
export async function deleteOwnedDraftVideoPosterBestEffort(
  draft: DraftVideo | null | undefined,
  userId?: string | null,
): Promise<void> {
  const path = draft?.remotePosterStoragePath?.trim() || "";
  if (!path) return;
  const fromPath = path.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/post\//i,
  )?.[1];
  const uid = (typeof userId === "string" && userId.trim()) || fromPath || "";
  if (!uid || !isOwnedPostMediaPosterStoragePath(path, uid)) return;
  await deleteMediaStorageObject(path);
}
