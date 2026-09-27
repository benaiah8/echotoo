/**
 * Create draft image foundation (PASS LI1A).
 * Durable local storage + preview resolver. Does not change eager upload yet.
 */

import { imgUrlPublic } from "../img";
import { isNativeApp } from "../storage/utils/capacitorDetection";
import {
  clearDraftImagesMeta,
  readDraftImagesMeta,
  removeDraftImageMeta,
  upsertDraftImageMeta,
  writeDraftImagesMeta,
} from "./draftImageMeta";
import {
  deleteNativeDraftImagesForPost,
  deleteNativeDraftImageFile,
  hasNativeDraftImageFile,
  resolveNativeDraftImagePreviewUrl,
  saveNativeDraftImageBlob,
} from "./nativeDraftImageStorage";
import {
  clearDraftImagePreviewCache,
  getCachedDraftImagePreviewUrl,
  releaseDraftImagePreview,
  setCachedDraftImagePreviewUrl,
} from "./previewCache";
import type { DraftImage, DraftImageStorageKind } from "./types";
import {
  draftImageLocalIdAsMediaOrderClientId,
  mediaOrderClientIdMatchesDraftImageLocalId,
  parseDraftImage,
} from "./types";
import {
  buildWebDraftImageKey,
  deleteWebDraftImageBlob,
  deleteWebDraftImagesForPost,
  hasWebDraftImageBlob,
  loadWebDraftImageBlob,
  saveWebDraftImageBlob,
} from "./webDraftImageStorage";

export type {
  DraftImage,
  DraftImageStorageKind,
} from "./types";
export {
  DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS,
  draftImageLocalIdAsMediaOrderClientId,
  isDraftImageStorageKind,
  mediaOrderClientIdMatchesDraftImageLocalId,
  parseDraftImage,
  parseDraftImages,
} from "./types";
export {
  clearDraftImagesMeta,
  readDraftImagesMeta,
  removeDraftImageMeta,
  updateDraftImageRemoteFields,
  upsertDraftImageMeta,
  writeDraftImagesMeta,
} from "./draftImageMeta";
export {
  buildWebDraftImageKey,
  deleteWebDraftImageBlob,
  deleteWebDraftImagesForPost,
  hasWebDraftImageBlob,
  loadWebDraftImageBlob,
  loadWebDraftImageRecord,
  saveWebDraftImageBlob,
} from "./webDraftImageStorage";
export {
  assertSafeNativeDraftImagePath,
  buildNativeDraftImageDirectory,
  buildNativeDraftImagePath,
  deleteNativeDraftImageFile,
  deleteNativeDraftImagesForPost,
  hasNativeDraftImageFile,
  isNativeDraftImagePath,
  loadNativeDraftImageBlob,
  resolveNativeDraftImagePreviewUrl,
  saveNativeDraftImageBlob,
} from "./nativeDraftImageStorage";
export {
  clearDraftImagePreviewCache,
  getCachedDraftImagePreviewUrl,
  releaseDraftImagePreview,
  setCachedDraftImagePreviewUrl,
  __draftImagePreviewCacheSizeForTests,
  __resetDraftImagePreviewCacheForTests,
} from "./previewCache";

export type PersistDraftImageInput = {
  publishPostId: string;
  /** When omitted, a new UUID is generated. */
  localId?: string;
  blob: Blob;
  fileName: string;
  mimeType?: string;
  width?: number;
  height?: number;
  /**
   * When false, persist bytes but do not upsert draftMeta.draftImages yet.
   * Default true.
   */
  commitMeta?: boolean;
};

function storageKindForPlatform(): DraftImageStorageKind {
  return isNativeApp() ? "native-fs" : "idb-blob";
}

function mimeFromBlob(blob: Blob, fileName: string): string {
  if (blob.type && blob.type.startsWith("image/")) return blob.type;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/webp";
}

/**
 * Persist an optimized image artifact into app-owned local storage.
 * Does not upload to Supabase. For LI1B wiring after prepareImageForUpload.
 */
export async function persistDraftImage(
  input: PersistDraftImageInput,
): Promise<DraftImage> {
  const publishPostId = input.publishPostId.trim();
  if (!publishPostId) {
    throw new Error("DRAFT_IMAGE_MISSING_PUBLISH_POST_ID");
  }
  if (!input.blob || input.blob.size <= 0) {
    throw new Error("DRAFT_IMAGE_EMPTY_BLOB");
  }

  const localId = (input.localId?.trim() || crypto.randomUUID()).trim();
  const mimeType = (
    input.mimeType?.trim() || mimeFromBlob(input.blob, input.fileName)
  ).trim();
  const kind = storageKindForPlatform();

  let localReference: string;
  if (kind === "native-fs") {
    localReference = await saveNativeDraftImageBlob(
      publishPostId,
      localId,
      input.blob,
      { fileName: input.fileName, mimeType },
    );
  } else {
    localReference = await saveWebDraftImageBlob(
      publishPostId,
      localId,
      input.blob,
      { fileName: input.fileName, mimeType },
    );
  }

  const draftImage: DraftImage = {
    localId,
    fileName: input.fileName || `image-${localId}`,
    mimeType,
    size: input.blob.size,
    localStorageKind: kind,
    localReference,
    remoteUrl: null,
    remoteStoragePath: null,
  };
  if (
    typeof input.width === "number" &&
    Number.isFinite(input.width) &&
    input.width > 0
  ) {
    draftImage.width = input.width;
  }
  if (
    typeof input.height === "number" &&
    Number.isFinite(input.height) &&
    input.height > 0
  ) {
    draftImage.height = input.height;
  }

  if (input.commitMeta !== false) {
    upsertDraftImageMeta(draftImage);
  }

  return draftImage;
}

export type ResolveDraftImagePreviewResult = {
  url: string | null;
  source: "session-cache" | "idb-blob" | "native-fs" | "remote" | "missing";
};

/**
 * Resolve a disposable preview URL for a DraftImage.
 * Web: one session object URL per localId. Native: convertFileSrc.
 * Remote fallback only when local artifact is unavailable.
 */
export async function resolveDraftImagePreview(
  draftImage: DraftImage,
  options?: { publishPostId?: string },
): Promise<ResolveDraftImagePreviewResult> {
  const parsed = parseDraftImage(draftImage);
  if (!parsed) {
    return { url: null, source: "missing" };
  }

  const cached = getCachedDraftImagePreviewUrl(parsed.localId);
  if (cached) {
    return { url: cached, source: "session-cache" };
  }

  if (parsed.localStorageKind === "native-fs") {
    const url = await resolveNativeDraftImagePreviewUrl(parsed.localReference);
    if (url) {
      setCachedDraftImagePreviewUrl(parsed.localId, url);
      return { url, source: "native-fs" };
    }
  } else {
    const publishPostId =
      options?.publishPostId?.trim() ||
      publishPostIdFromWebLocalReference(parsed.localReference);
    if (publishPostId) {
      const blob = await loadWebDraftImageBlob(publishPostId, parsed.localId);
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setCachedDraftImagePreviewUrl(parsed.localId, url);
        return { url, source: "idb-blob" };
      }
    }
  }

  const remote =
    (typeof parsed.remoteUrl === "string" && parsed.remoteUrl.trim()) ||
    (typeof parsed.remoteStoragePath === "string" &&
      parsed.remoteStoragePath.trim()) ||
    null;
  if (remote && !remote.startsWith("blob:")) {
    const publicUrl = imgUrlPublic(remote);
    if (publicUrl) {
      return { url: publicUrl, source: "remote" };
    }
  }

  return { url: null, source: "missing" };
}

function publishPostIdFromWebLocalReference(
  localReference: string,
): string | null {
  const parts = localReference.split("/");
  if (parts.length >= 2 && parts[0]) return parts[0];
  return null;
}

export type ReconcileDraftImagesResult = {
  kept: DraftImage[];
  removed: DraftImage[];
};

/**
 * Drop DraftImage meta entries whose durable local asset is missing.
 * Does not touch legacy remote-only activities[].images / mediaOrder URLs.
 */
export async function reconcileDraftImages(options?: {
  publishPostId?: string;
  images?: DraftImage[];
  /** When true (default), write kept list back to draftMeta. */
  commitMeta?: boolean;
}): Promise<ReconcileDraftImagesResult> {
  const images = options?.images ?? readDraftImagesMeta();
  const kept: DraftImage[] = [];
  const removed: DraftImage[] = [];

  for (const raw of images) {
    const img = parseDraftImage(raw);
    if (!img) {
      if (raw && typeof raw === "object") {
        removed.push(raw as DraftImage);
      }
      continue;
    }

    let exists = false;
    if (img.localStorageKind === "native-fs") {
      exists = await hasNativeDraftImageFile(img.localReference);
    } else {
      const publishPostId =
        options?.publishPostId?.trim() ||
        publishPostIdFromWebLocalReference(img.localReference);
      exists = publishPostId
        ? await hasWebDraftImageBlob(publishPostId, img.localId)
        : false;
    }

    if (exists) {
      kept.push(img);
    } else {
      releaseDraftImagePreview(img.localId);
      removed.push(img);
    }
  }

  if (options?.commitMeta !== false) {
    writeDraftImagesMeta(kept);
  }

  return { kept, removed };
}

/**
 * Delete one DraftImage local asset + meta + session preview.
 * Optionally best-effort deletes a draft-owned unpublished Storage object.
 * Default path never deletes remote Storage / published images.
 *
 * LI1D.5: logical meta removal is synchronous ({@link removeDraftImageFromDraftMeta});
 * physical IDB/FS/remote cleanup is async ({@link cleanupDraftImageAsset}).
 */
export function removeDraftImageFromDraftMeta(localId: string): DraftImage | null {
  const id = localId.trim();
  if (!id) return null;
  const meta =
    readDraftImagesMeta().find((img) => img.localId === id) ?? null;
  removeDraftImageMeta(id);
  return meta;
}

/**
 * Best-effort physical cleanup after logical DraftMeta removal.
 * Does not resurrect UI identity. Safe if meta was already removed.
 */
export async function cleanupDraftImageAsset(
  localId: string,
  options?: {
    publishPostId?: string;
    draftImage?: DraftImage | null;
    /** When true, best-effort delete draft-owned remote Storage object. */
    deleteDraftOwnedRemote?: boolean;
    userId?: string | null;
  },
): Promise<void> {
  const id = localId.trim();
  if (!id) return;
  const meta = options?.draftImage ?? null;

  if (options?.deleteDraftOwnedRemote && meta) {
    try {
      const { cleanupDraftImageRemoteIfPresent } = await import(
        "./draftImageRemoteCleanup"
      );
      await cleanupDraftImageRemoteIfPresent(meta, options.userId ?? null);
    } catch {
      /* prefer orphan over crash */
    }
  }

  releaseDraftImagePreview(id);

  if (meta?.localStorageKind === "native-fs") {
    await deleteNativeDraftImageFile(meta.localReference);
  } else {
    const publishPostId =
      options?.publishPostId?.trim() ||
      (meta
        ? publishPostIdFromWebLocalReference(meta.localReference)
        : null);
    if (publishPostId) {
      await deleteWebDraftImageBlob(publishPostId, id);
    }
  }

  // Idempotent — meta should already be gone after logical remove.
  removeDraftImageMeta(id);
}

export async function deleteDraftImage(
  localId: string,
  options?: {
    publishPostId?: string;
    draftImage?: DraftImage | null;
    /** When true, best-effort delete draft-owned remote Storage object. */
    deleteDraftOwnedRemote?: boolean;
    userId?: string | null;
  },
): Promise<void> {
  const id = localId.trim();
  const meta =
    options?.draftImage ??
    readDraftImagesMeta().find((img) => img.localId === id) ??
    null;
  // LI1D.5: logical identity gone before any await.
  removeDraftImageFromDraftMeta(id);
  await cleanupDraftImageAsset(id, {
    ...options,
    draftImage: meta,
  });
}

/**
 * Delete all DraftImages for a publishPostId (local only).
 * Does not delete Supabase Storage objects.
 */
export async function deleteAllDraftImagesForPost(
  publishPostId: string,
): Promise<void> {
  const id = publishPostId.trim();
  if (!id) return;

  const images = readDraftImagesMeta();
  for (const img of images) {
    releaseDraftImagePreview(img.localId);
  }

  if (isNativeApp()) {
    await deleteNativeDraftImagesForPost(id);
  } else {
    await deleteWebDraftImagesForPost(id);
  }

  clearDraftImagesMeta();
  clearDraftImagePreviewCache();
}

/** Convenience: clientId for mediaOrder from DraftImage.localId */
export function draftImageToMediaOrderClientId(image: DraftImage): string {
  return draftImageLocalIdAsMediaOrderClientId(image.localId);
}

export function assertDraftImageClientIdAlignment(
  clientId: string,
  image: DraftImage,
): boolean {
  return mediaOrderClientIdMatchesDraftImageLocalId(clientId, image.localId);
}

export {
  buildLocalDraftImageUrl,
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
  LOCAL_DRAFT_IMAGE_URL_PREFIX,
} from "./localDraftImageUrl";
export { scheduleDraftImageDiscardCleanup } from "./discardCleanup";
export { useCreateImagePreviewSrc } from "./useCreateImagePreviewSrc";
export {
  PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY,
  assertPublishImagePayloadHasNoLocalLeak,
  applyCombinedMediaProgress,
  cleanupDraftImagesAfterSuccessfulPublish,
  computeCombinedMediaProgressPercent,
  createCombinedMediaProgressState,
  mapActivityImagesToRemotePaths,
  mapMediaOrderImagesToRemotePaths,
  selectSurvivingDraftImagesForPublish,
  snapshotCreatePublishMedia,
  uploadSurvivingDraftImagesForPublish,
} from "./publishDraftImages";
export {
  draftImageReusableRemotePath,
  isDraftOwnedPostStoragePath,
  deleteDraftOwnedRemoteImageIfSafe,
} from "./draftImageRemoteCleanup";
export {
  resolveDraftImageUploadBlob,
  extensionFromDraftImageMime,
} from "./resolveDraftImageUploadBlob";

/** True when Create has local DraftImages that still need publish-time upload. */
export function hasUnpublishedLocalDraftImages(): boolean {
  return readDraftImagesMeta().some((img) => {
    const remote =
      (typeof img.remoteStoragePath === "string" &&
        img.remoteStoragePath.trim()) ||
      (typeof img.remoteUrl === "string" && img.remoteUrl.trim());
    return !remote;
  });
}

/**
 * @deprecated LI1B temporary gate — LI1C implements publish-time upload.
 * Kept only for test source-compat / migration notes; not used to block Publish.
 */
export const CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE =
  "Photo upload for new posts isn’t ready yet. Remove photos to continue, or try again after the next update.";

/**
 * Runtime gate: local-first Create image selection is enabled (LI1B/LI1C).
 */
export const CREATE_LOCAL_FIRST_IMAGES_ENABLED = true;
