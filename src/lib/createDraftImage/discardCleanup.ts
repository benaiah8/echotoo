/**
 * Async discard cleanup for Create local draft images (mirrors video discard).
 * After a failed Publish, also best-effort deletes draft-owned Storage objects.
 */

import { deleteMediaStorageObject } from "../../api/services/mediaUpload";
import { isNativeApp } from "../storage/utils/capacitorDetection";
import {
  clearDraftImagesMeta,
  readDraftImagesMeta,
} from "./draftImageMeta";
import { isDraftOwnedPostStoragePath } from "./draftImageRemoteCleanup";
import { deleteNativeDraftImagesForPost } from "./nativeDraftImageStorage";
import {
  clearDraftImagePreviewCache,
  releaseDraftImagePreview,
} from "./previewCache";
import type { DraftImage } from "./types";
import { deleteWebDraftImagesForPost } from "./webDraftImageStorage";

export type DraftImageDiscardSnapshot = {
  publishPostId: string | null | undefined;
  draftImages: DraftImage[];
  userId?: string | null;
};

export async function runDraftImageDiscardCleanup(
  snapshot: DraftImageDiscardSnapshot,
): Promise<void> {
  const id =
    typeof snapshot.publishPostId === "string"
      ? snapshot.publishPostId.trim()
      : "";
  const userId =
    typeof snapshot.userId === "string" ? snapshot.userId.trim() : "";

  for (const img of snapshot.draftImages) {
    releaseDraftImagePreview(img.localId);
    if (userId) {
      const path =
        img.remoteStoragePath?.trim() ||
        (isDraftOwnedPostStoragePath(img.remoteUrl, userId)
          ? img.remoteUrl!.trim()
          : "");
      if (path && isDraftOwnedPostStoragePath(path, userId)) {
        try {
          await deleteMediaStorageObject(path);
        } catch {
          /* orphan preferred */
        }
      }
    }
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

export function scheduleDraftImageDiscardCleanup(options: {
  publishPostId: string | null | undefined;
  /** Snapshot before wipe — discardAllDrafts clears draftMeta immediately. */
  draftImages?: DraftImage[] | null;
  userId?: string | null;
}): void {
  const draftImages =
    options.draftImages ??
    (typeof localStorage !== "undefined" ? readDraftImagesMeta() : []);
  void runDraftImageDiscardCleanup({
    publishPostId: options.publishPostId,
    draftImages,
    userId: options.userId ?? null,
  }).catch(() => {
    /* best-effort */
  });
}
