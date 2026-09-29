/**
 * Privacy-safe Post Detail media fetch (media_order + attached post_media +
 * legacy activities images used by Feed/Profile/Detail).
 * Uses anon client + RLS (owner OR can_view_post).
 *
 * Note: feed/list RPC JSON may include a computed `first_image_url`, but that
 * is not a `posts` column — do not select it from `.from("posts")`.
 */

import { supabase } from "../supabaseClient";
import { resolvePublishedPostImageUrls } from "./resolvePublishedPostImageUrls";
import type {
  PublishedPostMediaRow,
  PublishedVideoStatus,
} from "./types";
import { isPublishedMediaOrder } from "./types";

const POST_MEDIA_DETAIL_SELECT =
  "id, post_id, sort_order, kind, bunny_video_id, video_status, poster_url, duration_sec, width, height";

const ACTIVITIES_IMAGE_SELECT = "post_id, order_idx, images";

export type PublishedPostMediaForDetail = {
  mediaOrder: unknown;
  postMedia: PublishedPostMediaRow[];
  /**
   * Gallery image URLs — same resolvePublishedPostImageUrls priority as
   * Feed seed / Post Detail handoff (media_order → activities.images;
   * optional first_image_url only when feed-seeded callers supply it).
   */
  imageUrls: string[];
};

function parseVideoStatus(value: unknown): PublishedVideoStatus {
  if (
    value === "pending" ||
    value === "uploading" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
}

function mapRow(raw: Record<string, unknown>): PublishedPostMediaRow | null {
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.bunny_video_id !== "string" || !raw.bunny_video_id.trim()) {
    return null;
  }
  return {
    id: raw.id,
    post_id: typeof raw.post_id === "string" ? raw.post_id : null,
    sort_order:
      typeof raw.sort_order === "number" && Number.isFinite(raw.sort_order)
        ? raw.sort_order
        : 0,
    kind: typeof raw.kind === "string" ? raw.kind : "video",
    bunny_video_id: raw.bunny_video_id.trim(),
    video_status: parseVideoStatus(raw.video_status),
    poster_url:
      typeof raw.poster_url === "string" && raw.poster_url.trim()
        ? raw.poster_url.trim()
        : null,
    duration_sec:
      typeof raw.duration_sec === "number" && Number.isFinite(raw.duration_sec)
        ? raw.duration_sec
        : null,
    width:
      typeof raw.width === "number" && Number.isFinite(raw.width)
        ? raw.width
        : null,
    height:
      typeof raw.height === "number" && Number.isFinite(raw.height)
        ? raw.height
        : null,
  };
}

function emptyDetail(): PublishedPostMediaForDetail {
  return { mediaOrder: null, postMedia: [], imageUrls: [] };
}

export async function getPublishedPostMediaForDetail(
  postId: string,
): Promise<PublishedPostMediaForDetail> {
  const id = postId?.trim();
  if (!id) {
    return emptyDetail();
  }
  const byId = await getPublishedPostMediaForPosts([id]);
  return byId.get(id) ?? emptyDetail();
}

/**
 * Batched privacy-safe media fetch for many posts (same tables/fields as Detail).
 * Every requested id is present in the map; missing/RLS-denied → empty manifest.
 */
export async function getPublishedPostMediaForPosts(
  postIds: readonly string[],
): Promise<Map<string, PublishedPostMediaForDetail>> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of postIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const out = new Map<string, PublishedPostMediaForDetail>();
  for (const id of ids) {
    out.set(id, emptyDetail());
  }
  if (ids.length === 0) return out;

  const [postsResult, mediaResult, activitiesResult] = await Promise.all([
    supabase
      .from("posts")
      .select("id, media_order")
      .in("id", ids),
    supabase
      .from("post_media")
      .select(POST_MEDIA_DETAIL_SELECT)
      .in("post_id", ids)
      .order("sort_order", { ascending: true }),
    supabase
      .from("activities")
      .select(ACTIVITIES_IMAGE_SELECT)
      .in("post_id", ids)
      .order("order_idx", { ascending: true }),
  ]);

  if (postsResult.error) {
    console.warn(
      "[publishedMedia] batch media_order fetch failed",
      postsResult.error.message,
    );
  }
  if (mediaResult.error) {
    console.warn(
      "[publishedMedia] batch post_media fetch failed",
      mediaResult.error.message,
    );
  }
  if (activitiesResult.error) {
    console.warn(
      "[publishedMedia] batch activities images fetch failed",
      activitiesResult.error.message,
    );
  }

  const mediaOrderByPost = new Map<string, unknown>();

  const posts = Array.isArray(postsResult.data) ? postsResult.data : [];
  for (const row of posts) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id || !out.has(id)) continue;
    const mediaOrderRaw = rec.media_order ?? null;
    const mediaOrder = isPublishedMediaOrder(mediaOrderRaw)
      ? mediaOrderRaw
      : mediaOrderRaw;
    mediaOrderByPost.set(id, mediaOrder);
    const prev = out.get(id)!;
    out.set(id, { ...prev, mediaOrder });
  }

  const mediaRows = Array.isArray(mediaResult.data) ? mediaResult.data : [];
  const byPost = new Map<string, PublishedPostMediaRow[]>();
  for (const raw of mediaRows) {
    const mapped = mapRow(raw as Record<string, unknown>);
    if (!mapped || !mapped.post_id) continue;
    const list = byPost.get(mapped.post_id) ?? [];
    list.push(mapped);
    byPost.set(mapped.post_id, list);
  }
  for (const [postId, list] of byPost) {
    if (!out.has(postId)) continue;
    const prev = out.get(postId)!;
    out.set(postId, { ...prev, postMedia: list });
  }

  type ActRow = { images?: string[] | null };
  const activitiesByPost = new Map<string, ActRow[]>();
  const activityRows = Array.isArray(activitiesResult.data)
    ? activitiesResult.data
    : [];
  for (const raw of activityRows) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const postId = typeof rec.post_id === "string" ? rec.post_id.trim() : "";
    if (!postId || !out.has(postId)) continue;
    const images = Array.isArray(rec.images)
      ? (rec.images as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.length > 0,
        )
      : null;
    const list = activitiesByPost.get(postId) ?? [];
    list.push({ images });
    activitiesByPost.set(postId, list);
  }

  for (const id of ids) {
    const prev = out.get(id)!;
    const mediaOrder = mediaOrderByPost.has(id)
      ? mediaOrderByPost.get(id)
      : prev.mediaOrder;
    const imageUrls = resolvePublishedPostImageUrls({
      media_order: mediaOrder,
      activities: activitiesByPost.get(id) ?? [],
      first_image_url: null,
    });
    out.set(id, {
      mediaOrder: mediaOrder ?? null,
      postMedia: prev.postMedia,
      imageUrls,
    });
  }

  return out;
}

/** Lightweight poll for a single attached video row (processing → ready). */
export async function fetchPublishedPostMediaRowById(
  mediaId: string,
): Promise<PublishedPostMediaRow | null> {
  const id = mediaId?.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("post_media")
    .select(POST_MEDIA_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}
