/**
 * Shared publish path for create flow (Preview page + Finalize direct publish).
 * Keeps insert/update, activities, XP, personalization, and cache invalidation in one place.
 */
import { supabase } from "./supabaseClient";
import { insertPost } from "../api/services/posts";
import { dataCache } from "./dataCache";
import { recordSignal } from "./feedPersonalization";
import { incrementMyXp } from "../api/services/xp";
import { sanitizeTagsForPublish } from "./createFlowLimits";

export type CreateFlowDraftActivity = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  images?: unknown[];
  additionalInfo?: { title: string; value: string }[];
};

const isHttpUrl = (v: unknown): v is string =>
  typeof v === "string" &&
  (/^https?:\/\//.test(v) || (v.includes("/") && v.includes(".")));

const isCloudinaryUrl = (u: string) => u.includes("res.cloudinary.com");

export function cleanImagesForActivity(arr: unknown): string[] {
  const valid = Array.isArray(arr) ? arr.map(String).filter(isHttpUrl) : [];
  const nonCloudinary = valid.filter((u) => !isCloudinaryUrl(u));
  const hadCloudinary = valid.some(isCloudinaryUrl);
  if (hadCloudinary && nonCloudinary.length === 0) {
    console.warn(
      "[createFlowPublish] Dropping Cloudinary-only images (would store empty)",
      { droppedCount: valid.length }
    );
    return [];
  }
  return hadCloudinary ? nonCloudinary : valid;
}

const ANONYMOUS_GUARD = {
  is_anonymous: false,
  anonymous_name: null as string | null,
  anonymous_avatar: null as string | null,
};

export type ExecuteCreateFlowPublishInput = {
  postType: "experience" | "hangout";
  /** Plain text; newlines preserved end-to-end (no flattening). */
  caption: string;
  tags: string[];
  visibility: "public" | "friends";
  rsvpCapacity: number | null;
  selectedDatesIso: string[];
  isRecurring: boolean;
  recurrenceDays: string[];
  activities: CreateFlowDraftActivity[];
  isEditMode: boolean;
  editPostId?: string;
};

export type ExecuteCreateFlowPublishResult = {
  post: {
    id: string;
    type: string;
    caption: string | null;
    author_id: string;
    tags: string[] | null;
    is_recurring: boolean | null;
  };
};

/**
 * Inserts or updates post + activities; side effects: XP, personalization, caches, publishedPostLast.
 */
export async function executeCreateFlowPublish(
  input: ExecuteCreateFlowPublishInput
): Promise<ExecuteCreateFlowPublishResult> {
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session?.user) throw new Error("Not authenticated");

  const dbVisibility = input.visibility === "friends" ? "friends" : "public";
  const tags = sanitizeTagsForPublish(input.tags);

  let post: ExecuteCreateFlowPublishResult["post"];

  if (input.isEditMode && input.editPostId) {
    const { error: updateErr } = await supabase
      .from("posts")
      .update({
        type: input.postType === "hangout" ? "hangout" : "experience",
        caption: input.caption,
        visibility: dbVisibility as "public" | "friends" | "private",
        ...ANONYMOUS_GUARD,
        rsvp_capacity: input.rsvpCapacity,
        selected_dates: input.selectedDatesIso.length
          ? input.selectedDatesIso
          : null,
        is_recurring: input.isRecurring ?? null,
        recurrence_days: input.recurrenceDays.length
          ? input.recurrenceDays
          : null,
        tags: tags.length ? tags : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.editPostId);

    if (updateErr) throw updateErr;

    const { data: updatedPost, error: fetchErr } = await supabase
      .from("posts")
      .select("*")
      .eq("id", input.editPostId)
      .single();

    if (fetchErr) throw fetchErr;
    post = updatedPost;
  } else {
    post = await insertPost({
      type: input.postType === "hangout" ? "hangout" : "experience",
      caption: input.caption,
      visibility: dbVisibility as "public" | "friends" | "private",
      ...ANONYMOUS_GUARD,
      rsvp_capacity: input.rsvpCapacity,
      selected_dates: input.selectedDatesIso.length
        ? input.selectedDatesIso
        : null,
      is_recurring: input.isRecurring ?? null,
      recurrence_days: input.recurrenceDays.length
        ? input.recurrenceDays
        : null,
      tags: tags.length ? tags : null,
    });
  }

  if (!input.isEditMode) {
    try {
      await incrementMyXp(4);
    } catch {
      /* ignore */
    }
  }

  if (!input.isEditMode && post) {
    try {
      recordSignal(
        {
          tags: post.tags || null,
          author_id: post.author_id,
          type: post.type as "experience" | "hangout",
          is_recurring: post.is_recurring ?? null,
        },
        "create"
      );
    } catch {
      /* ignore */
    }
  }

  const sanitizedActivities = input.activities.map((a, i) => ({
    ...a,
    _idx: i,
    images: cleanImagesForActivity(a?.images),
  }));

  if (sanitizedActivities.length) {
    if (input.isEditMode && input.editPostId) {
      const { error: deleteErr } = await supabase
        .from("activities")
        .delete()
        .eq("post_id", input.editPostId);
      if (deleteErr) throw deleteErr;
    }

    const items = sanitizedActivities.map(
      (a: CreateFlowDraftActivity, i: number) => ({
        post_id: post.id,
        order_idx: i,
        title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
        activity_type: a.activityType ?? null,
        custom_activity: a.customActivity ?? null,
        location_name: a.location ?? null,
        location_desc: a.locationDesc ?? null,
        location_url: a.locationUrl ?? null,
        location_notes: a.locationNotes ?? null,
        additional_info: a.additionalInfo ?? null,
        tags: a.tags ?? null,
        images: cleanImagesForActivity(a.images),
      })
    );

    const { error: actErr } = await supabase.from("activities").insert(items);
    if (actErr) throw actErr;
  }

  try {
    localStorage.setItem(
      "publishedPostLast",
      JSON.stringify({
        id: post.id,
        type: post.type,
        caption: post.caption,
        tags,
        activities: sanitizedActivities,
      })
    );
  } catch {
    /* ignore */
  }

  dataCache.delete(`profile_created_${session.user.id}`);
  dataCache.clearFeedCache().catch(() => {});

  return { post };
}
