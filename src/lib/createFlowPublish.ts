/**
 * Shared publish path for create flow (Preview page + Finalize direct publish).
 * Keeps insert/update, activities, XP, personalization, and cache invalidation in one place.
 */
import { supabase } from "./supabaseClient";
import { insertPost } from "../api/services/posts";
import { invalidatePostDetailCache } from "../api/queries/getPostById";
import { dataCache } from "./dataCache";
import { recordSignal } from "./feedPersonalization";
import { incrementMyXp } from "../api/services/xp";
import { sanitizeTagsForPublish } from "./createFlowLimits";
import { isDefaultStopTitle } from "./createFlowMeaningfulActivity";
import { persistOwnCreatedPrependPending } from "./ownCreatedPendingPrepend";

/** Legacy sessionStorage key — no longer written; cleared on new publish for hygiene. */
const LEGACY_OWN_CREATED_PUBLISHED_PENDING_KEY =
  "echotoo:own-created-published-pending";

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

function hasMeaningfulExtras(
  additionalInfo: CreateFlowDraftActivity["additionalInfo"]
): boolean {
  if (!Array.isArray(additionalInfo)) return false;
  return additionalInfo.some(
    (x) =>
      (x?.title ?? "").trim().length > 0 && (x?.value ?? "").trim().length > 0
  );
}

function hasMeaningfulActivityAtIndex(
  activity: CreateFlowDraftActivity,
  index: number
): boolean {
  const images = cleanImagesForActivity(activity?.images);
  if (images.length > 0) return true;

  const title = (activity.title ?? "").trim();
  if (title && !isDefaultStopTitle(title, index)) return true;

  if ((activity.customActivity ?? "").trim()) return true;
  if ((activity.activityType ?? "").trim()) return true;
  if ((activity.locationDesc ?? "").trim()) return true;
  if ((activity.location ?? "").trim()) return true;
  if ((activity.locationNotes ?? "").trim()) return true;
  if ((activity.locationUrl ?? "").trim()) return true;

  const tags = Array.isArray(activity.tags)
    ? activity.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tags.length > 0) return true;

  if (hasMeaningfulExtras(activity.additionalInfo)) return true;

  return false;
}

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
  /** When true, post accepts star ratings (defaults false). */
  ratingEnabled?: boolean;
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
 * New publishes also write `echotoo:own-created-prepend-pending` for local Created prepend (no profile_created cache wipe).
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
  const ratingEnabled = input.ratingEnabled ?? false;

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
        rating_enabled: ratingEnabled,
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
      rating_enabled: ratingEnabled,
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

  // Do not persist seeded placeholder stops with no user-provided content.
  const activitiesToPersist = sanitizedActivities.filter((a, i) =>
    hasMeaningfulActivityAtIndex(a, i)
  );

  if (activitiesToPersist.length) {
    if (input.isEditMode && input.editPostId) {
      const { error: deleteErr } = await supabase
        .from("activities")
        .delete()
        .eq("post_id", input.editPostId);
      if (deleteErr) throw deleteErr;
    }

    const items = activitiesToPersist.map(
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

  const createdCacheKey = `profile_created_${session.user.id}`;
  if (input.isEditMode && input.editPostId) {
    dataCache.delete(createdCacheKey);
  }
  dataCache.clearFeedCache().catch(() => {});
  invalidatePostDetailCache(post.id);

  const isNewPublish = !input.isEditMode;
  if (isNewPublish && session?.user?.id) {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(LEGACY_OWN_CREATED_PUBLISHED_PENDING_KEY);
      }
    } catch {
      /* noop */
    }

    type DbPostExtras = {
      created_at?: string;
      visibility?: "public" | "friends" | "private";
      recurrence_days?: string[] | null;
      selected_dates?: string[] | null;
      is_recurring?: boolean | null;
      rsvp_capacity?: number | null;
      rating_enabled?: boolean | null;
    };
    const row = post as ExecuteCreateFlowPublishResult["post"] & DbPostExtras;

    const markerAt = new Date().toISOString();
    const prependActivities = activitiesToPersist.map((a, i) => {
      const imgs = cleanImagesForActivity(a.images);
      return {
        order_idx: i,
        title:
          a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
        images: imgs.length ? imgs : null,
        location_name: a.location ?? null,
        location_desc: a.locationDesc ?? null,
        location_url: a.locationUrl ?? null,
        location_notes: a.locationNotes ?? null,
        additional_info: a.additionalInfo ?? null,
        tags: a.tags ?? null,
      };
    });

    persistOwnCreatedPrependPending({
      v: 1,
      postId: post.id,
      authorId: session.user.id,
      type:
        input.postType === "hangout" || post.type === "hangout"
          ? "hangout"
          : "experience",
      caption: typeof post.caption === "string" ? post.caption : null,
      tags: tags.length ? tags : null,
      created_at:
        typeof row.created_at === "string" && row.created_at.length
          ? row.created_at
          : markerAt,
      selected_dates:
        Array.isArray(row.selected_dates) && row.selected_dates.length
          ? row.selected_dates
          : input.selectedDatesIso.length
            ? input.selectedDatesIso
            : null,
      is_recurring:
        typeof row.is_recurring === "boolean" || row.is_recurring === null
          ? row.is_recurring
          : input.isRecurring ?? null,
      recurrence_days:
        Array.isArray(row.recurrence_days) && row.recurrence_days.length
          ? row.recurrence_days
          : input.recurrenceDays.length
            ? input.recurrenceDays
            : null,
      rsvp_capacity:
        typeof row.rsvp_capacity === "number" || row.rsvp_capacity === null
          ? row.rsvp_capacity
          : input.rsvpCapacity,
      rating_enabled:
        typeof row.rating_enabled === "boolean"
          ? row.rating_enabled
          : ratingEnabled,
      visibility: row.visibility ?? null,
      activities: prependActivities,
      markerAt,
    });
  }

  return { post };
}
