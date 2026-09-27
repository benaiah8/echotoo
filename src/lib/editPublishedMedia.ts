/**
 * Edit-mode published media model (PV4).
 * Remote retained video is NOT DraftVideo — no local-fs / TUS / prepare path.
 */

import type { DraftMediaOrderItem, PublishedMediaOrderItem } from "./createDraftMediaOrder";
import {
  createImageClientId,
  getOrCreateImageClientId,
  imageOrderItem,
  videoOrderItem,
  capDraftMediaOrder,
  writeDraftMediaOrderState,
  type DraftImageClientIdMap,
} from "./createDraftMediaOrder";
import type { PublishedMediaItem, PublishedVideoStatus } from "./publishedMedia/types";
import { isPublishedMediaOrder } from "./publishedMedia/types";
import { buildPublishedMediaItems } from "./publishedMedia/types";
import type { PublishedPostMediaRow } from "./publishedMedia/types";
import type { PostVideoUploadJob } from "./createPostVideoUpload";
import { supabase } from "./supabaseClient";
import {
  validateVideoEditPayload,
  type VideoEditPayload,
} from "./ownerPostMediaEditContract";

export const PUBLISHED_VIDEO_REF_LOCAL_ID_PREFIX = "published-ref:" as const;

export type PublishedVideoReference = {
  mediaId: string;
  bunnyVideoId: string;
  status: PublishedVideoStatus;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export function publishedVideoRefLocalId(mediaId: string): string {
  return `${PUBLISHED_VIDEO_REF_LOCAL_ID_PREFIX}${mediaId.trim()}`;
}

export function isPublishedVideoReferenceLocalId(
  localId: string | null | undefined,
): boolean {
  return Boolean(
    localId && localId.startsWith(PUBLISHED_VIDEO_REF_LOCAL_ID_PREFIX),
  );
}

export function isPublishedVideoReferenceJob(
  job: Pick<PostVideoUploadJob, "localId"> | null | undefined,
): boolean {
  return isPublishedVideoReferenceLocalId(job?.localId);
}

export function publishedVideoReferenceFromRow(
  row: PublishedPostMediaRow,
): PublishedVideoReference | null {
  const mediaId = row.id?.trim();
  const bunnyVideoId = row.bunny_video_id?.trim();
  if (!mediaId || !bunnyVideoId) return null;
  return {
    mediaId,
    bunnyVideoId,
    status: row.video_status,
    posterUrl: row.poster_url,
    width: row.width,
    height: row.height,
    durationSec: row.duration_sec,
  };
}

export function publishedVideoReferenceFromItem(
  item: Extract<PublishedMediaItem, { kind: "video" }>,
): PublishedVideoReference {
  return {
    mediaId: item.mediaId,
    bunnyVideoId: item.videoId,
    status: item.status,
    posterUrl: item.posterUrl,
    width: item.width,
    height: item.height,
    durationSec: item.durationSec,
  };
}

/** Map retained remote video → Create preview job (poster-only; never DraftVideo). */
export function mapPublishedVideoReferenceToJob(
  ref: PublishedVideoReference,
): PostVideoUploadJob {
  const ready = ref.status === "ready";
  return {
    mediaId: ref.mediaId,
    videoId: ref.bunnyVideoId,
    status: ready
      ? "ready"
      : ref.status === "failed"
        ? "error"
        : "processing",
    progress: ready ? 100 : 0,
    videoStatus: ref.status,
    posterUrl: ref.posterUrl,
    localFile: null,
    localPreviewUrl: null,
    localPosterUrl: null,
    localId: publishedVideoRefLocalId(ref.mediaId),
    videoWidth: ref.width ?? undefined,
    videoHeight: ref.height ?? undefined,
    videoDuration: ref.durationSec ?? undefined,
    errorMessage:
      ref.status === "failed" ? "Video processing failed." : undefined,
  };
}

/**
 * Build draft mediaOrder from authoritative published media_order + items.
 * Video clientId = published-ref:{mediaId} (stable; not a DraftVideo localId).
 */
export function buildEditDraftMediaOrderFromPublished(params: {
  mediaOrder: unknown;
  postMedia: PublishedPostMediaRow[];
  imageUrls: string[];
}): {
  draftOrder: DraftMediaOrderItem[];
  publishedOrder: PublishedMediaOrderItem[] | null;
  publishedVideo: PublishedVideoReference | null;
  items: PublishedMediaItem[];
  imageClientIdMap: DraftImageClientIdMap;
} {
  const items = buildPublishedMediaItems({
    imageUrls: params.imageUrls,
    mediaOrder: params.mediaOrder,
    postMedia: params.postMedia,
  });

  let map: DraftImageClientIdMap = {};
  const draftOrder: DraftMediaOrderItem[] = [];
  let publishedVideo: PublishedVideoReference | null = null;

  for (const item of items) {
    if (item.kind === "image") {
      const { clientId, map: next } = getOrCreateImageClientId(item.url, map);
      map = next;
      draftOrder.push(imageOrderItem(item.url, clientId));
      continue;
    }
    if (!publishedVideo) {
      publishedVideo = publishedVideoReferenceFromItem(item);
    }
    draftOrder.push(videoOrderItem(publishedVideoRefLocalId(item.mediaId)));
  }

  const publishedOrder = isPublishedMediaOrder(params.mediaOrder)
    ? (params.mediaOrder as PublishedMediaOrderItem[])
    : items.length
      ? items.map((item) =>
          item.kind === "image"
            ? ({ kind: "image", url: item.url } as PublishedMediaOrderItem)
            : ({ kind: "video", mediaId: item.mediaId } as PublishedMediaOrderItem),
        )
      : null;

  return {
    draftOrder: capDraftMediaOrder(draftOrder),
    publishedOrder,
    publishedVideo,
    items,
    imageClientIdMap: map,
  };
}

/** Persist edit hydration into draftMeta without marking create-draft dirty notify. */
export function seedEditMediaOrderIntoDraftMeta(
  draftOrder: DraftMediaOrderItem[],
  imageClientIdMap: DraftImageClientIdMap,
): void {
  writeDraftMediaOrderState(
    {
      mediaOrder: draftOrder,
      imageMediaClientIds: imageClientIdMap,
    },
    { notify: false },
  );
}

const EDIT_POST_DATA_KEY = "editPostData";

/** Slot-0 images for edit: prefer editPostData activities, else draftActivities. */
export function readSlot0ImagesForMediaOrder(): string[] {
  try {
    const editRaw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (editRaw) {
      const parsed = JSON.parse(editRaw) as { activities?: unknown[] };
      if (Array.isArray(parsed.activities) && parsed.activities.length > 0) {
        const act = parsed.activities[0] as { images?: unknown };
        if (Array.isArray(act?.images)) {
          return act.images
            .map(String)
            .filter(
              (u) =>
                /^https?:\/\//.test(u) ||
                (u.includes("/") && u.includes(".")),
            );
        }
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem("draftActivities");
    if (!raw) return [];
    const activities = JSON.parse(raw) as unknown;
    if (!Array.isArray(activities) || !activities.length) return [];
    const act = activities[0] as { images?: unknown };
    if (!Array.isArray(act?.images)) return [];
    return act.images
      .map(String)
      .filter(
        (u) =>
          /^https?:\/\//.test(u) || (u.includes("/") && u.includes(".")),
      );
  } catch {
    return [];
  }
}

export function readEditPublishedVideoReference(): PublishedVideoReference | null {
  try {
    const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      publishedVideo?: PublishedVideoReference | null;
    };
    const ref = parsed.publishedVideo;
    if (!ref || typeof ref !== "object") return null;
    if (typeof ref.mediaId !== "string" || !ref.mediaId.trim()) return null;
    if (typeof ref.bunnyVideoId !== "string" || !ref.bunnyVideoId.trim()) {
      return null;
    }
    return ref;
  } catch {
    return null;
  }
}

export function readEditBootstrapMediaOrder(): unknown {
  try {
    const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mediaOrder?: unknown };
    return parsed.mediaOrder ?? null;
  } catch {
    return null;
  }
}

/**
 * Owner RLS still allows updating posts.media_order without a republish.
 * Prefer folding media_order into owner_republish_post / admin_republish_post
 * when Save uses commitOwnerMediaInRepublish; this helper remains for the
 * legacy post-hoc owner path only.
 */
export async function updateOwnedPostMediaOrder(options: {
  postId: string;
  mediaOrder: PublishedMediaOrderItem[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const postId = options.postId?.trim();
  if (!postId) return { ok: false, error: "Missing post id" };

  const { error } = await supabase
    .from("posts")
    .update({ media_order: options.mediaOrder })
    .eq("id", postId);

  if (error) {
    return { ok: false, error: error.message || "Could not update media order" };
  }
  return { ok: true };
}

/** True when edit still holds a published remote video (not a new DraftVideo). */
export function editRetainsPublishedVideo(
  job: PostVideoUploadJob | null,
): boolean {
  return isPublishedVideoReferenceJob(job);
}

export type OwnerEditVideoOp =
  | "UNCHANGED"
  | "ADD"
  | "REPLACE"
  | "REMOVE"
  | "NONE";

/**
 * Derive Edit video Save intent from published baseline vs current composer job.
 * Do not treat missing DraftVideo meta as REMOVE while published-ref is current.
 */
export function deriveOwnerEditVideoOp(options: {
  videoJob: PostVideoUploadJob | null;
  bootstrapPublishedVideo: PublishedVideoReference | null | undefined;
}): OwnerEditVideoOp {
  const { videoJob, bootstrapPublishedVideo } = options;
  const hadPublished = Boolean(bootstrapPublishedVideo?.mediaId?.trim());
  const retainsPublished = isPublishedVideoReferenceJob(videoJob);
  const hasLocalEditVideo = Boolean(
    videoJob &&
      !retainsPublished &&
      (videoJob.status === "local" ||
        videoJob.status === "local_error" ||
        (typeof videoJob.localId === "string" &&
          videoJob.localId.trim() &&
          !isPublishedVideoReferenceLocalId(videoJob.localId))),
  );

  if (hadPublished && retainsPublished) return "UNCHANGED";
  if (hadPublished && !videoJob) return "REMOVE";
  if (hadPublished && hasLocalEditVideo) return "REPLACE";
  if (!hadPublished && hasLocalEditVideo) return "ADD";
  return "NONE";
}

/**
 * Build validated video_edit for owner_republish_post, or null to omit (UNCHANGED/NONE).
 * ADD/REPLACE require stagedMediaId from Save-time upload.
 */
export function buildOwnerEditVideoEditPayload(options: {
  op: OwnerEditVideoOp;
  stagedMediaId?: string | null;
  expectedAttachedMediaId?: string | null;
}):
  | { ok: true; payload: VideoEditPayload | null }
  | { ok: false; error: string } {
  const { op, stagedMediaId, expectedAttachedMediaId } = options;
  if (op === "NONE" || op === "UNCHANGED") {
    return { ok: true, payload: null };
  }

  const raw: Record<string, unknown> = { op };
  if (op === "ADD" || op === "REPLACE") {
    raw.staged_media_id = stagedMediaId ?? null;
  }
  if (op === "REPLACE" || op === "REMOVE") {
    const expected = expectedAttachedMediaId?.trim() || null;
    if (expected) {
      raw.expected_attached_media_id = expected;
    }
  }

  const validated = validateVideoEditPayload(raw);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  return { ok: true, payload: validated.data };
}

export function resolvePublishedMediaIdForEditSave(
  videoJob: PostVideoUploadJob | null,
): string | null {
  if (!isPublishedVideoReferenceJob(videoJob)) return null;
  const id = videoJob?.mediaId?.trim();
  return id || null;
}

/** Stable unused helper export for tests / future client ids. */
export function createEditImageClientId(): string {
  return createImageClientId();
}
