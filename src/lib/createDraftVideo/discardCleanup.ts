import { deleteCreatePostVideo } from "../bunnyUpload/invokeBunnyVideoDelete";
import type { DraftVideo } from "./types";
import { cleanupDraftVideoAssets } from "./index";
import { cancelActiveDraftVideoPreparation } from "./draftVideoPreparationController";

export type DraftVideoDiscardSnapshot = {
  publishPostId: string | null;
  draftVideo: DraftVideo | null;
};

/**
 * Fire-and-forget durable video cleanup on draft discard / TTL / start-new.
 * Deletes local bytes and optionally remote Bunny slot when unpublished.
 */
export function scheduleDraftVideoDiscardCleanup(
  snapshot: DraftVideoDiscardSnapshot,
): void {
  void runDraftVideoDiscardCleanup(snapshot);
}

export async function runDraftVideoDiscardCleanup(
  snapshot: DraftVideoDiscardSnapshot,
): Promise<void> {
  const { publishPostId, draftVideo } = snapshot;
  const remoteMediaId = draftVideo?.remoteMediaId?.trim() || null;

  // Stop Media3 before deleting files.
  try {
    await cancelActiveDraftVideoPreparation("discard");
  } catch {
    /* best-effort */
  }

  if (remoteMediaId && publishPostId) {
    try {
      await deleteCreatePostVideo({
        publishPostId,
        mediaId: remoteMediaId,
      });
    } catch (err) {
      console.warn("[createDraftVideo] remote discard cleanup failed", err);
    }
  }

  // Best-effort draft poster Storage cleanup (owned path only).
  try {
    const { deleteOwnedDraftVideoPosterBestEffort } = await import(
      "./publishVideoPoster"
    );
    await deleteOwnedDraftVideoPosterBestEffort(draftVideo);
  } catch (err) {
    console.warn("[createDraftVideo] poster discard cleanup failed", err);
  }

  await cleanupDraftVideoAssets({ publishPostId, draftVideo });
}

/**
 * After successful publish — local bytes only; published post_media stays attached.
 */
export async function cleanupDraftVideoAfterSuccessfulPublish(): Promise<void> {
  try {
    await cleanupDraftVideoAssets();
  } catch (err) {
    console.warn(
      "[createDraftVideo] post-publish local cleanup failed (non-fatal)",
      err,
    );
  }
}
