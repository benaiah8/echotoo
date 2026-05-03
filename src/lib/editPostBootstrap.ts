/**
 * Canonical `localStorage["editPostData"]` shape for published-post edit mode.
 * All edit entry points must call {@link persistCanonicalEditPostData} so create/finalize
 * hydrate from one contract (see CreateActivitiesPage, CreateFinalizePage).
 */
import type { NavigateFunction } from "react-router-dom";
import { Paths } from "../router/Paths";

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
};

/** Post row from `posts` table (subset). */
export type EditPostSourceRow = {
  id: string;
  type: string;
  caption: string | null;
  visibility?: string | null;
  is_anonymous?: boolean | null;
  rsvp_capacity?: number | null;
  selected_dates?: string[] | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  tags?: string[] | null;
  rating_enabled?: boolean | null;
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
  };
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

  return {
    postId: post.id,
    type: pt,
    caption: post.caption,
    visibility: post.visibility,
    is_anonymous: post.is_anonymous ?? null,
    rsvp_capacity: post.rsvp_capacity ?? null,
    selected_dates: post.selected_dates ?? null,
    is_recurring: post.is_recurring ?? null,
    recurrence_days: post.recurrence_days ?? null,
    tags: post.tags ?? null,
    ratingEnabled: post.rating_enabled ?? false,
    ...(returnPath !== undefined ? { returnPath } : {}),
    ...(returnState !== undefined ? { returnState } : {}),
    activities: activities.map(mapActivityRowToClientShape),
  };
}

export function persistCanonicalEditPostData(
  data: CanonicalEditPostData
): void {
  try {
    localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify(data));
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
