/**
 * PASS LI1C — publish-time DraftImage upload, retry, and payload mapping.
 */

import { uploadNormalizedPostImage } from "../../api/services/mediaUpload";
import type { DraftMediaOrderItem } from "../createDraftMediaOrder";
import { isNativeApp } from "../storage/utils/capacitorDetection";
import {
  draftImageReusableRemotePath,
  isDraftOwnedPostStoragePath,
} from "./draftImageRemoteCleanup";
import {
  clearDraftImagesMeta,
  readDraftImagesMeta,
  updateDraftImageRemoteFields,
} from "./draftImageMeta";
import {
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./localDraftImageUrl";
import {
  deleteNativeDraftImagesForPost,
} from "./nativeDraftImageStorage";
import {
  clearDraftImagePreviewCache,
  releaseDraftImagePreview,
} from "./previewCache";
import {
  extensionFromDraftImageMime,
  resolveDraftImageUploadBlob,
} from "./resolveDraftImageUploadBlob";
import type { DraftImage } from "./types";
import { parseDraftImage } from "./types";
import { deleteWebDraftImagesForPost } from "./webDraftImageStorage";

/** Max concurrent image Storage uploads during Publish. */
export const PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY = 2;

export type CreatePublishMediaSnapshot = {
  publishPostId: string;
  mediaOrder: DraftMediaOrderItem[];
  draftImages: DraftImage[];
  /** Slot-0 activity images (may include local sentinels + legacy remotes). */
  activityImages: string[];
};

export function snapshotCreatePublishMedia(options: {
  publishPostId: string;
  mediaOrder: DraftMediaOrderItem[];
  activityImages?: string[];
  draftImages?: DraftImage[];
}): CreatePublishMediaSnapshot {
  const draftImages = (options.draftImages ?? readDraftImagesMeta())
    .map((img) => parseDraftImage(img))
    .filter((img): img is DraftImage => Boolean(img));
  return {
    publishPostId: options.publishPostId.trim(),
    mediaOrder: options.mediaOrder.map((item) => ({ ...item })),
    draftImages,
    activityImages: Array.isArray(options.activityImages)
      ? options.activityImages.map(String)
      : [],
  };
}

/**
 * Surviving local DraftImages only — derived from captured mediaOrder identity.
 * Legacy remote URLs are not returned (they need no upload).
 */
export function selectSurvivingDraftImagesForPublish(
  snapshot: CreatePublishMediaSnapshot,
): DraftImage[] {
  const byId = new Map(
    snapshot.draftImages.map((img) => [img.localId, img] as const),
  );
  const out: DraftImage[] = [];
  const seen = new Set<string>();

  for (const item of snapshot.mediaOrder) {
    if (item.kind !== "image") continue;
    if (!isLocalDraftImageUrl(item.url)) continue;
    const localId =
      localIdFromLocalDraftImageUrl(item.url)?.trim() ||
      item.clientId.trim() ||
      "";
    if (!localId || seen.has(localId)) continue;
    const img = byId.get(localId);
    if (!img) continue;
    seen.add(localId);
    out.push(img);
  }
  return out;
}

export type CombinedMediaProgressState = {
  imageTotalBytes: number;
  imageCompletedBytes: number;
  videoTotalBytes: number;
  /** 0–100 live video upload percent. */
  videoPercent: number;
  /** Tiny PV3.4 poster upload bytes (subset of "Uploading media"). */
  posterTotalBytes: number;
  posterCompletedBytes: number;
  /** High-water mark so UI never jumps backward. */
  highWaterPercent: number;
};

export function createCombinedMediaProgressState(options: {
  images: DraftImage[];
  videoBytes: number;
  posterBytes?: number;
}): CombinedMediaProgressState {
  const imageTotalBytes = options.images.reduce(
    (sum, img) => sum + Math.max(0, img.size || 0),
    0,
  );
  return {
    imageTotalBytes,
    imageCompletedBytes: 0,
    videoTotalBytes: Math.max(0, options.videoBytes || 0),
    videoPercent: 0,
    posterTotalBytes: Math.max(0, options.posterBytes || 0),
    posterCompletedBytes: 0,
    highWaterPercent: 0,
  };
}

export function computeCombinedMediaProgressPercent(
  state: CombinedMediaProgressState,
): number {
  const total =
    state.imageTotalBytes + state.videoTotalBytes + state.posterTotalBytes;
  if (total <= 0) return 100;
  const videoCompleted =
    state.videoTotalBytes * (Math.max(0, Math.min(100, state.videoPercent)) / 100);
  const completed =
    state.imageCompletedBytes +
    state.posterCompletedBytes +
    videoCompleted;
  const raw = Math.max(0, Math.min(100, (completed / total) * 100));
  return raw;
}

export function applyCombinedMediaProgress(
  state: CombinedMediaProgressState,
  patch: Partial<
    Pick<
      CombinedMediaProgressState,
      | "imageCompletedBytes"
      | "videoPercent"
      | "posterCompletedBytes"
      | "posterTotalBytes"
    >
  >,
): { state: CombinedMediaProgressState; percent: number } {
  const next: CombinedMediaProgressState = {
    ...state,
    ...patch,
    imageCompletedBytes: Math.min(
      state.imageTotalBytes,
      patch.imageCompletedBytes ?? state.imageCompletedBytes,
    ),
    posterTotalBytes: Math.max(
      0,
      patch.posterTotalBytes ?? state.posterTotalBytes,
    ),
    posterCompletedBytes: Math.min(
      Math.max(0, patch.posterTotalBytes ?? state.posterTotalBytes),
      Math.max(0, patch.posterCompletedBytes ?? state.posterCompletedBytes),
    ),
  };
  const raw = computeCombinedMediaProgressPercent(next);
  const percent = Math.max(next.highWaterPercent, raw);
  next.highWaterPercent = percent;
  return { state: next, percent };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Upload cancelled.", "AbortError");
      }
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  };

  const pool = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}

export type UploadSurvivingDraftImagesResult =
  | {
      ok: true;
      localIdToRemotePath: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
      cancelled?: boolean;
      localIdToRemotePath: Record<string, string>;
    };

/**
 * Upload or reuse surviving DraftImages. Persists remote path on each success
 * before continuing. Concurrency capped at {@link PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY}.
 */
export async function uploadSurvivingDraftImagesForPublish(options: {
  snapshot: CreatePublishMediaSnapshot;
  userId: string;
  signal?: AbortSignal;
  onImageCompleted?: (info: {
    localId: string;
    remotePath: string;
    completedImageBytes: number;
    totalImageBytes: number;
  }) => void;
}): Promise<UploadSurvivingDraftImagesResult> {
  const surviving = selectSurvivingDraftImagesForPublish(options.snapshot);
  const localIdToRemotePath: Record<string, string> = {};
  let completedImageBytes = 0;
  const totalImageBytes = surviving.reduce(
    (sum, img) => sum + Math.max(0, img.size || 0),
    0,
  );

  if (!surviving.length) {
    return { ok: true, localIdToRemotePath };
  }

  try {
    await mapPool(
      surviving,
      PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY,
      async (img) => {
        if (options.signal?.aborted) {
          throw new DOMException("Upload cancelled.", "AbortError");
        }

        const reusable = draftImageReusableRemotePath(img, options.userId);
        if (reusable) {
          localIdToRemotePath[img.localId] = reusable;
          completedImageBytes += Math.max(0, img.size || 0);
          options.onImageCompleted?.({
            localId: img.localId,
            remotePath: reusable,
            completedImageBytes,
            totalImageBytes,
          });
          return;
        }

        // Stale/invalid remote metadata — clear before re-upload.
        if (img.remoteStoragePath || img.remoteUrl) {
          updateDraftImageRemoteFields(img.localId, {
            remoteStoragePath: null,
            remoteUrl: null,
          });
        }

        const blob = await resolveDraftImageUploadBlob(img, {
          publishPostId: options.snapshot.publishPostId,
        });
        if (options.signal?.aborted) {
          throw new DOMException("Upload cancelled.", "AbortError");
        }

        const extension = extensionFromDraftImageMime(
          img.mimeType,
          img.fileName,
        );
        const contentType =
          img.mimeType?.trim() ||
          (extension === "jpg"
            ? "image/jpeg"
            : extension === "png"
              ? "image/png"
              : "image/webp");

        const remote = await uploadNormalizedPostImage(
          { blob, contentType, extension },
          { userId: options.userId },
        );

        if (options.signal?.aborted) {
          // Bytes may already be on Storage — persist for retry; do not create post.
          const path = remote.trim();
          if (isDraftOwnedPostStoragePath(path, options.userId)) {
            updateDraftImageRemoteFields(img.localId, {
              remoteStoragePath: path,
              remoteUrl: null,
            });
            localIdToRemotePath[img.localId] = path;
          } else if (path) {
            updateDraftImageRemoteFields(img.localId, {
              remoteStoragePath: null,
              remoteUrl: path,
            });
            localIdToRemotePath[img.localId] = path;
          }
          throw new DOMException("Upload cancelled.", "AbortError");
        }

        const path = remote.trim();
        if (!path) {
          throw new Error("Image upload returned an empty path.");
        }

        if (isDraftOwnedPostStoragePath(path, options.userId)) {
          updateDraftImageRemoteFields(img.localId, {
            remoteStoragePath: path,
            remoteUrl: null,
          });
        } else {
          updateDraftImageRemoteFields(img.localId, {
            remoteStoragePath: null,
            remoteUrl: path,
          });
        }
        localIdToRemotePath[img.localId] = path;
        completedImageBytes += Math.max(0, img.size || 0);
        options.onImageCompleted?.({
          localId: img.localId,
          remotePath: path,
          completedImageBytes,
          totalImageBytes,
        });
      },
      options.signal,
    );

    // Every surviving localId must resolve.
    for (const img of surviving) {
      if (!localIdToRemotePath[img.localId]?.trim()) {
        return {
          ok: false,
          error: "Some photos failed to upload. Please try again.",
          localIdToRemotePath,
        };
      }
    }

    return { ok: true, localIdToRemotePath };
  } catch (e) {
    const cancelled =
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && /cancel/i.test(e.message));
    return {
      ok: false,
      cancelled,
      error: cancelled
        ? "Upload cancelled."
        : e instanceof Error && e.message.trim()
          ? e.message
          : "Some photos failed to upload. Please try again.",
      localIdToRemotePath,
    };
  }
}

export function assertPublishImagePayloadHasNoLocalLeak(
  activitiesImages: string[][],
  mediaOrder: DraftMediaOrderItem[],
): void {
  const bad = (u: string) =>
    isLocalDraftImageUrl(u) ||
    u.startsWith("blob:") ||
    u.startsWith("data:");

  for (const images of activitiesImages) {
    for (const u of images) {
      if (bad(String(u))) {
        if (import.meta.env.DEV) {
          console.error(
            "[LI1C] local image sentinel leaked into publish payload",
            u,
          );
        }
        throw new Error("PUBLISH_LOCAL_IMAGE_LEAK");
      }
    }
  }
  for (const item of mediaOrder) {
    if (item.kind === "image" && bad(item.url)) {
      if (import.meta.env.DEV) {
        console.error(
          "[LI1C] local image sentinel leaked into media_order",
          item.url,
        );
      }
      throw new Error("PUBLISH_LOCAL_IMAGE_LEAK");
    }
  }
}

/**
 * Map activity image list: local sentinel → remote path; legacy remotes unchanged.
 */
export function mapActivityImagesToRemotePaths(
  images: string[],
  localIdToRemotePath: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const raw of images) {
    const url = String(raw);
    if (!url.trim()) continue;
    if (url.startsWith("blob:") || url.startsWith("data:")) {
      throw new Error("PUBLISH_LOCAL_IMAGE_LEAK");
    }
    if (isLocalDraftImageUrl(url)) {
      const localId = localIdFromLocalDraftImageUrl(url);
      const remote = localId ? localIdToRemotePath[localId]?.trim() : "";
      if (!remote) {
        throw new Error("UNRESOLVED_LOCAL_DRAFT_IMAGE");
      }
      out.push(remote);
      continue;
    }
    out.push(url);
  }
  return out;
}

/**
 * Rewrite captured mediaOrder image URLs to remote paths (identity via clientId/localId).
 */
export function mapMediaOrderImagesToRemotePaths(
  mediaOrder: DraftMediaOrderItem[],
  localIdToRemotePath: Record<string, string>,
): DraftMediaOrderItem[] {
  return mediaOrder.map((item) => {
    if (item.kind !== "image") return item;
    if (!isLocalDraftImageUrl(item.url)) return item;
    const localId =
      item.clientId.trim() ||
      localIdFromLocalDraftImageUrl(item.url)?.trim() ||
      "";
    const remote = localId ? localIdToRemotePath[localId]?.trim() : "";
    if (!remote) {
      throw new Error("UNRESOLVED_LOCAL_DRAFT_IMAGE");
    }
    return { kind: "image", clientId: item.clientId, url: remote };
  });
}

/**
 * After owner_create_post success — local assets only; Storage objects stay published.
 */
export async function cleanupDraftImagesAfterSuccessfulPublish(
  publishPostId: string | null | undefined,
): Promise<void> {
  const id = typeof publishPostId === "string" ? publishPostId.trim() : "";
  for (const img of readDraftImagesMeta()) {
    releaseDraftImagePreview(img.localId);
  }
  if (id) {
    if (isNativeApp()) {
      await deleteNativeDraftImagesForPost(id);
    } else {
      await deleteWebDraftImagesForPost(id);
    }
  }
  clearDraftImagesMeta();
  clearDraftImagePreviewCache();
}
