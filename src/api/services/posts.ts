// src/api/services/posts.ts
import { isDraftPostId, discardAllDrafts } from "../../lib/drafts";
import { supabase } from "../../lib/supabaseClient";
import { retry } from "../../lib/retry";
import { imgUrlPublic } from "../../lib/img";
import { getPostScheduleLabel } from "../../lib/postScheduleLabel";

export type PostType = "experience" | "hangout";

/** Compact chat card fields for Share S1 (viewer RLS). */
export type SharedPostCardData = {
  id: string;
  post_type: PostType;
  caption: string | null;
  cover_url: string | null;
  location_name: string | null;
  schedule_label: string | null;
};

const SHARED_POST_CARD_MAX_IDS = 100;

type SharedPostCardActivityRow = {
  title?: string | null;
  images?: string[] | null;
  order_idx?: number | null;
  location_name?: string | null;
};

type SharedPostCardPostRow = {
  id: string;
  type: string;
  caption?: string | null;
  selected_dates?: string[] | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  created_at?: string | null;
  activities?: SharedPostCardActivityRow[] | null;
};

function sortedActivities(
  activities: SharedPostCardActivityRow[] | null | undefined
): SharedPostCardActivityRow[] {
  if (!activities?.length) return [];
  return [...activities].sort(
    (a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0)
  );
}

function coverUrlFromActivities(
  activities: SharedPostCardActivityRow[]
): string | null {
  for (const a of activities) {
    const imgs = a.images;
    if (!imgs?.length) continue;
    for (const raw of imgs) {
      if (!raw) continue;
      const u = imgUrlPublic(raw);
      if (u) return u;
    }
  }
  return null;
}

function locationFromActivities(
  activities: SharedPostCardActivityRow[]
): string | null {
  for (const a of activities) {
    const loc = typeof a.location_name === "string" ? a.location_name.trim() : "";
    if (loc) return loc;
  }
  return null;
}

function mapPostRowToSharedCard(
  row: SharedPostCardPostRow
): SharedPostCardData | null {
  if (row.type !== "hangout" && row.type !== "experience") return null;
  const post_type = row.type;
  const activities = sortedActivities(row.activities);
  const captionRaw =
    typeof row.caption === "string" ? row.caption.trim() : "";
  const createdAt =
    typeof row.created_at === "string" && row.created_at
      ? row.created_at
      : new Date(0).toISOString();
  const schedule = getPostScheduleLabel({
    type: post_type,
    createdAt,
    selectedDates: row.selected_dates,
    isRecurring: row.is_recurring,
    recurrenceDays: row.recurrence_days,
  });
  const schedule_label = schedule.label?.trim() ? schedule.label : null;

  return {
    id: row.id,
    post_type,
    caption: captionRaw.length > 0 ? captionRaw : null,
    cover_url: coverUrlFromActivities(activities),
    location_name: locationFromActivities(activities),
    schedule_label,
  };
}

/**
 * Batch-fetch compact post cards for chat Share S1 under current-viewer RLS.
 * Returned ids → accessible; requested but omitted → inaccessible (caller marks unavailable).
 * Query/network failure → error on the result (caller must NOT mark unavailable).
 */
export async function getPostsByIdsForCards(
  postIds: string[]
): Promise<{ data: SharedPostCardData[]; error: unknown }> {
  const ids = [
    ...new Set(
      (postIds ?? [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    ),
  ].slice(0, SHARED_POST_CARD_MAX_IDS);

  if (ids.length === 0) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from("posts")
      .select(
        `
        id,
        type,
        caption,
        selected_dates,
        is_recurring,
        recurrence_days,
        created_at,
        activities (
          title,
          images,
          order_idx,
          location_name
        )
      `
      )
      .in("id", ids);

    if (error) {
      console.error("[getPostsByIdsForCards] PostgREST error:", error);
      return { data: [], error };
    }

    const cards: SharedPostCardData[] = [];
    for (const row of (data ?? []) as SharedPostCardPostRow[]) {
      if (!row?.id) continue;
      const mapped = mapPostRowToSharedCard(row);
      if (mapped) cards.push(mapped);
    }

    return { data: cards, error: null };
  } catch (err) {
    console.error("[getPostsByIdsForCards] Unexpected error:", err);
    return { data: [], error: err };
  }
}

/**
 * Best-effort FCM for new post: Edge resolves recipients from notifications (server fan-out)
 * and must not throw (publish should succeed regardless).
 */
export async function invokePostPublishedPush(data: {
  id: string;
  type: PostType;
  author_id: string;
}): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const { error } = await supabase.functions.invoke("send-post-push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        post_id: data.id,
        entity_type: data.type,
        actor_id: data.author_id,
      },
    });
    if (error) {
      console.warn("[send-post-push]", error.message);
    }
  } catch (e) {
    console.warn("[send-post-push]", e instanceof Error ? e.message : e);
  }
}

export type NewPost = {
  type: PostType;
  caption: string;
  // NEW
  visibility?: "public" | "friends" | "private"; // public default
  is_anonymous?: boolean; // false default
  anonymous_name?: string | null; // NEW: anonymous name
  anonymous_avatar?: string | null; // NEW: anonymous avatar
  rsvp_capacity?: number | null; // null default
  selected_dates?: string[] | null; // ISO strings
  is_recurring?: boolean | null; // recurrence flag
  recurrence_days?: string[] | null; // ["MO","TU",...]
  tags?: string[] | null;
  status?: "draft" | "published"; // NEW: draft or published status
  /** When true, viewers may submit star ratings (DB default false). */
  rating_enabled?: boolean;
};

export async function insertPost(input: NewPost) {
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .insert([
      {
        type: input.type,
        caption: input.caption,
        visibility: input.visibility ?? "public",
        is_anonymous: input.is_anonymous ?? false,
        anonymous_name: input.anonymous_name ?? null, // NEW: anonymous name
        anonymous_avatar: input.anonymous_avatar ?? null, // NEW: anonymous avatar
        rsvp_capacity: input.rsvp_capacity ?? null,
        selected_dates: input.selected_dates ?? null,
        is_recurring: input.is_recurring ?? null,
        recurrence_days: input.recurrence_days ?? null,
        tags: input.tags ?? null,
        status: input.status ?? "published", // NEW: default to published
        rating_enabled: input.rating_enabled ?? false,
        author_id: session.user.id,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;

  // Follower notifications: DB trigger fan-out; push via Edge (same as atomic publish path).
  if (data.status === "published") {
    void invokePostPublishedPush(data);
  }

  return data; // { id, ... }
}

export async function saveDraft(input: NewPost) {
  // Save draft - same as insertPost but with status: "draft"
  return insertPost({ ...input, status: "draft" });
}

export async function publishDraft(postId: string) {
  // Convert draft to published post
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "published" })
    .eq("id", postId)
    .eq("author_id", session.user.id) // Security: only owner can publish
    .select("*")
    .single();

  if (error) throw error;
  if (data.status === "published") {
    void invokePostPublishedPush(data);
  }
  return data;
}

export async function getPost(id: string) {
  // [OPTIMIZATION: Phase 7.2] Add retry logic to database query
  // Why: Handles transient network failures gracefully, improves reliability
  const result = await retry(
    async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    {
      maxRetries: 3,
      initialDelay: 1000,
      onRetry: (attempt, err) => {
        console.log(`[getPost] Retry attempt ${attempt} for post ${id}:`, err);
      },
    }
  );

  return result;
}

export async function deletePost(id: string) {
  if (isDraftPostId(id)) {
    discardAllDrafts();
    return true;
  }

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  const { invokeDeletePublishedPost, DELETE_PUBLISHED_POST_USER_ERROR } =
    await import("../../lib/deletePublishedPost/invokeDeletePublishedPost");

  const result = await invokeDeletePublishedPost({ postId: id });
  if (!result.ok) {
    throw new Error(result.error || DELETE_PUBLISHED_POST_USER_ERROR);
  }

  const { invalidateOnPostDelete } = await import("../../lib/cacheInvalidation");
  invalidateOnPostDelete(id);

  return true;
}

export async function getPostForEdit(id: string) {
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  // [OPTIMIZATION: Phase 7.2] Add retry logic to database queries
  // Why: Handles transient network failures gracefully, improves reliability
  const result = await retry(
    async () => {
      // Get post data
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();

      if (postError) throw postError;
      if (post.author_id !== session.user.id) {
        throw new Error("You can only edit your own posts");
      }

      // Get activities data
      const { data: activities, error: activitiesError } = await supabase
        .from("activities")
        .select("*")
        .eq("post_id", id)
        .order("order_idx", { ascending: true });

      if (activitiesError) throw activitiesError;

      // Attached published media (PV4 edit hydration). Prefer detail helper shape.
      const { getPublishedPostMediaForDetail } = await import(
        "../../lib/publishedMedia/getPublishedPostMediaForDetail"
      );
      const media = await getPublishedPostMediaForDetail(id);

      return {
        post,
        activities: activities || [],
        mediaOrder: media.mediaOrder ?? post.media_order ?? null,
        postMedia: media.postMedia ?? [],
      };
    },
    {
      maxRetries: 3,
      initialDelay: 1000,
      onRetry: (attempt, err) => {
        console.log(
          `[getPostForEdit] Retry attempt ${attempt} for post ${id}:`,
          err
        );
      },
    }
  );

  return result;
}
