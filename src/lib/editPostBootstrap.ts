/**
 * Canonical `localStorage["editPostData"]` shape for published-post edit mode.
 * All edit entry points must call {@link persistCanonicalEditPostData} so create/finalize
 * hydrate from one contract (see CreateActivitiesPage, CreateFinalizePage).
 */
import type { NavigateFunction } from "react-router-dom";
import { Paths } from "../router/Paths";
import type { PublishedMediaOrderItem } from "./createDraftMediaOrder";
import {
  buildEditDraftMediaOrderFromPublished,
  seedEditMediaOrderIntoDraftMeta,
  type PublishedVideoReference,
} from "./editPublishedMedia";
import type { PublishedPostMediaRow } from "./publishedMedia";
import { imageUrlsFromMediaOrder } from "./publishedMedia";
import { hasValidSavedStructuredSchedule } from "./createFlowPostType";

export const EDIT_POST_DATA_KEY = "editPostData" as const;

/** Activity row from `activities` table (subset). */
export type EditActivitySourceRow = {
  id?: string;
  title?: string | null;
  activity_type?: string | null;
  custom_activity?: string | null;
  location_desc?: string | null;
  location_name?: string | null;
  location_notes?: string | null;
  location_url?: string | null;
  additional_info?: { title: string; value: string }[] | null;
  tags?: string[] | null;
  images?: string[] | null;
  order_idx?: number | null;
  section_body?: string | null;
};

/** Post row from `posts` table (subset). */
export type EditPostSourceRow = {
  id: string;
  author_id?: string;
  type: string;
  caption: string | null;
  visibility?: string | null;
  is_anonymous?: boolean | null;
  anonymous_name?: string | null;
  anonymous_avatar?: string | null;
  rsvp_capacity?: number | null;
  selected_dates?: string[] | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  tags?: string[] | null;
  rating_enabled?: boolean | null;
  /** Authoritative mixed media order when present. */
  media_order?: unknown;
};

/** Client activity shape (matches CreateActivitiesPage / createFlowPublish). */
export type EditActivityClientShape = {
  id?: string;
  title: string | null;
  activityType: string;
  customActivity: string;
  locationDesc: string;
  location: string;
  locationNotes: string;
  locationUrl: string;
  additionalInfo: { title: string; value: string }[];
  tags: string[];
  images: string[];
  order_idx: number | null;
  sectionBody: string;
};

/**
 * Serialized overlay stack for post detail modal (`location.state` replay after republish).
 * Kept loose (`unknown`) so JSON round-trip through localStorage stays simple.
 */
export type EditPostReturnState = {
  backgroundLocation?: unknown;
  initialPost?: unknown;
};

export type CanonicalEditPostData = {
  postId: string;
  type: "experience" | "hangout";
  caption: string | null;
  visibility: string | null | undefined;
  is_anonymous: boolean | null;
  anonymous_name?: string | null;
  anonymous_avatar?: string | null;
  rsvp_capacity: number | null;
  selected_dates: string[] | null;
  is_recurring: boolean | null;
  recurrence_days: string[] | null;
  tags: string[] | null;
  /** Mirrors `posts.rating_enabled` */
  ratingEnabled?: boolean;
  /** Where to return after successful publish / exit flows that read it */
  returnPath?: string;
  /** When set, republish navigates with `state` so overlay detail restores (see {@link navigateAfterEditPublish}). */
  returnState?: EditPostReturnState;
  activities: EditActivityClientShape[];
  /** Reviewer editing another user's post — save via admin RPC. */
  isAdminEdit?: boolean;
  /** Original post owner auth user id (`posts.author_id`) for cache invalidation. */
  authorUserId?: string;
  /**
   * Authoritative published media_order (PV4). Hydrated for Edit mixed restore.
   * Kept separate from create-flow draft video — see {@link publishedVideo}.
   */
  mediaOrder?: PublishedMediaOrderItem[] | null;
  /** Retained remote video reference (not a create-flow draft video). */
  publishedVideo?: PublishedVideoReference | null;
  /** Compact attached post_media rows used to build the reference / order. */
  postMedia?: PublishedPostMediaRow[] | null;
  /**
   * Frozen at edit entry from the published row. D1 Save guard baseline —
   * must not be overwritten by working-copy schedule autosave.
   */
  publishedScheduleHasStructured?: boolean;
};

export function normalizePostTypeForEdit(
  type: string | null | undefined
): "experience" | "hangout" {
  const t = (type || "experience").toLowerCase();
  return t === "hangout" ? "hangout" : "experience";
}

export function mapActivityRowToClientShape(
  activity: EditActivitySourceRow
): EditActivityClientShape {
  return {
    id: activity.id,
    title: activity.title ?? null,
    activityType: activity.activity_type || "",
    customActivity: activity.custom_activity || "",
    locationDesc: activity.location_desc || "",
    location: activity.location_name || "",
    locationNotes: activity.location_notes || "",
    locationUrl: activity.location_url || "",
    additionalInfo: activity.additional_info || [],
    tags: activity.tags || [],
    images: activity.images || [],
    order_idx: activity.order_idx ?? null,
    sectionBody: activity.section_body || "",
  };
}

function collectActivityImageUrls(
  activities: EditActivityClientShape[],
): string[] {
  const out: string[] = [];
  for (const a of activities) {
    for (const url of a.images || []) {
      if (typeof url === "string" && url.trim()) out.push(url);
    }
  }
  return out;
}

/**
 * Builds the flat object persisted as `editPostData` from `getPostForEdit` (or equivalent) rows.
 */
export function buildCanonicalEditPostData(
  post: EditPostSourceRow,
  activities: EditActivitySourceRow[],
  options?: {
    returnPath?: string | null;
    returnState?: EditPostReturnState | null;
    postMedia?: PublishedPostMediaRow[] | null;
    mediaOrder?: unknown;
  }
): CanonicalEditPostData {
  const pt = normalizePostTypeForEdit(post.type);
  const returnPath =
    options?.returnPath === undefined || options?.returnPath === null
      ? undefined
      : options.returnPath;
  const returnState =
    options?.returnState === undefined || options?.returnState === null
      ? undefined
      : options.returnState;

  const mappedActivities = activities.map(mapActivityRowToClientShape);
  const mediaOrderRaw =
    options?.mediaOrder !== undefined
      ? options.mediaOrder
      : post.media_order ?? null;
  const postMedia = options?.postMedia ?? null;
  const galleryFromOrder = imageUrlsFromMediaOrder(mediaOrderRaw);
  const galleryFromActivities = collectActivityImageUrls(mappedActivities);
  const imageUrls = [
    ...galleryFromOrder,
    ...galleryFromActivities.filter((u) => !galleryFromOrder.includes(u)),
  ];

  let mediaOrder: PublishedMediaOrderItem[] | null = null;
  let publishedVideo: PublishedVideoReference | null = null;

  if (
    (Array.isArray(mediaOrderRaw) && mediaOrderRaw.length > 0) ||
    (Array.isArray(postMedia) && postMedia.length > 0)
  ) {
    const built = buildEditDraftMediaOrderFromPublished({
      mediaOrder: mediaOrderRaw,
      postMedia: postMedia ?? [],
      imageUrls,
    });
    mediaOrder = built.publishedOrder;
    publishedVideo = built.publishedVideo;

    // Keep slot-0 images aligned with authoritative media_order (tray + reconcile).
    const orderImageUrls = built.items
      .filter(
        (item): item is Extract<(typeof built.items)[number], { kind: "image" }> =>
          item.kind === "image",
      )
      .map((item) => item.url);
    if (mappedActivities.length === 0) {
      mappedActivities.push({
        title: "Stop 1",
        activityType: "",
        customActivity: "",
        locationDesc: "",
        location: "",
        locationNotes: "",
        locationUrl: "",
        additionalInfo: [],
        tags: [],
        images: orderImageUrls,
        order_idx: 0,
        sectionBody: "",
      });
    } else {
      const existing = mappedActivities[0].images || [];
      const merged = [...orderImageUrls];
      for (const url of existing) {
        if (!merged.includes(url)) merged.push(url);
      }
      mappedActivities[0] = { ...mappedActivities[0], images: merged };
    }
  }

  const selectedDates = Array.isArray(post.selected_dates)
    ? post.selected_dates
    : [];
  const recurrenceDays = Array.isArray(post.recurrence_days)
    ? post.recurrence_days
    : [];
  const publishedScheduleHasStructured = hasValidSavedStructuredSchedule({
    selectedDatesLength: selectedDates.length,
    recurrenceDaysLength: recurrenceDays.length,
    isRecurring: !!post.is_recurring,
  });

  return {
    postId: post.id,
    type: pt,
    caption: post.caption,
    visibility: post.visibility,
    is_anonymous: post.is_anonymous ?? null,
    anonymous_name: post.anonymous_name ?? null,
    anonymous_avatar: post.anonymous_avatar ?? null,
    rsvp_capacity: post.rsvp_capacity ?? null,
    selected_dates: post.selected_dates ?? null,
    is_recurring: post.is_recurring ?? null,
    recurrence_days: post.recurrence_days ?? null,
    tags: post.tags ?? null,
    ratingEnabled: post.rating_enabled ?? false,
    publishedScheduleHasStructured,
    ...(returnPath !== undefined ? { returnPath } : {}),
    ...(returnState !== undefined ? { returnState } : {}),
    activities: mappedActivities,
    mediaOrder,
    publishedVideo,
    postMedia: postMedia ?? null,
  };
}

/** Admin edit bootstrap: same as owner edit plus reviewer flags. */
export function buildAdminEditPostData(
  post: EditPostSourceRow,
  activities: EditActivitySourceRow[],
  options?: {
    returnPath?: string | null;
    returnState?: EditPostReturnState | null;
    postMedia?: PublishedPostMediaRow[] | null;
    mediaOrder?: unknown;
  }
): CanonicalEditPostData {
  const base = buildCanonicalEditPostData(post, activities, options);
  const authorUserId = post.author_id;
  if (!authorUserId) {
    throw new Error("Missing post author for admin edit");
  }
  return {
    ...base,
    isAdminEdit: true,
    authorUserId,
  };
}

export function readCanonicalEditPostData(): CanonicalEditPostData | null {
  try {
    const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanonicalEditPostData;
    if (!parsed?.postId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistCanonicalEditPostData(
  data: CanonicalEditPostData
): void {
  try {
    localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify(data));
    // Seed draft mediaOrder before Finalize mounts (exact media_order restore).
    if (
      (Array.isArray(data.mediaOrder) && data.mediaOrder.length > 0) ||
      data.publishedVideo ||
      (Array.isArray(data.postMedia) && data.postMedia.length > 0)
    ) {
      const gallery: string[] = [];
      for (const a of data.activities || []) {
        for (const url of a.images || []) {
          if (typeof url === "string" && url.trim()) gallery.push(url);
        }
      }
      const built = buildEditDraftMediaOrderFromPublished({
        mediaOrder: data.mediaOrder ?? null,
        postMedia: data.postMedia ?? [],
        imageUrls: gallery,
      });
      if (built.draftOrder.length > 0) {
        seedEditMediaOrderIntoDraftMeta(
          built.draftOrder,
          built.imageClientIdMap,
        );
      }
    }
  } catch {
    /* ignore */
  }
}

/** First step of edit flow: `/create/finalize?type=…` */
export function createEditActivitiesHref(
  postType: string | null | undefined
): string {
  const t = normalizePostTypeForEdit(postType);
  return `${Paths.createFinalize}?type=${t}`;
}

/**
 * After republishing an edit: restores post detail **modal** when `returnState.backgroundLocation`
 * was saved (edit started from overlay). Otherwise plain `navigate(returnPath)`.
 */
export function navigateAfterEditPublish(
  navigate: NavigateFunction,
  opts: { returnPath: string; returnState?: EditPostReturnState | null }
): void {
  const { returnPath, returnState } = opts;
  const bg = returnState?.backgroundLocation;
  if (bg != null) {
    navigate(returnPath, {
      state: {
        backgroundLocation: bg,
        ...(returnState?.initialPost != null
          ? { initialPost: returnState.initialPost }
          : {}),
      },
    });
  } else {
    navigate(returnPath);
  }
}
