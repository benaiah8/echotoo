/**
 * After a new publish, stores a bounded payload so Own Profile Created can prepend
 * a FeedItem-shaped row locally without forcing a Created-list refetch.
 */
import type { FeedItem } from "../api/queries/getPublicFeed";
import type { Profile } from "../contexts/ProfileContext";

export const OWN_CREATED_PREPEND_PENDING_KEY =
  "echotoo:own-created-prepend-pending";

const MAX_ACTIVITIES = 24;
const MAX_STRING = 6000;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

export type OwnCreatedPrependActivityStored = {
  order_idx: number;
  title: string | null;
  images: string[] | null;
  location_name?: string | null;
  location_desc?: string | null;
  location_url?: string | null;
  location_notes?: string | null;
  additional_info?: { title: string; value: string }[] | null;
  tags?: string[] | null;
};

export type OwnCreatedPrependPendingPayload = {
  v: 1;
  postId: string;
  authorId: string;
  type: "experience" | "hangout";
  caption: string | null;
  tags: string[] | null;
  created_at: string;
  selected_dates: string[] | null;
  is_recurring: boolean | null;
  recurrence_days: string[] | null;
  rsvp_capacity: number | null;
  rating_enabled: boolean;
  visibility?: "public" | "friends" | "private" | null;
  activities: OwnCreatedPrependActivityStored[];
  markerAt: string;
};

export type ConsumeOwnCreatedPrependResult =
  | { kind: "none" }
  | { kind: "consumed"; payload: OwnCreatedPrependPendingPayload }
  | { kind: "mismatch_cleared"; markerAuthorId: string };

/** Read prepend marker without removing it (merge + hydrate on first Own Profile paint). */
export type PeekOwnCreatedPrependResult =
  | { kind: "none" }
  | { kind: "pending"; payload: OwnCreatedPrependPendingPayload }
  | {
      /** Same account guard as consume — call `consume` to clear orphaned marker */
      kind: "mismatch_should_clear";
      markerAuthorId: string;
    };

export function peekOwnCreatedPrependPending(
  currentAuthUserId: string
): PeekOwnCreatedPrependResult {
  if (
    typeof sessionStorage === "undefined" ||
    !currentAuthUserId ||
    typeof currentAuthUserId !== "string"
  ) {
    return { kind: "none" };
  }

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(OWN_CREATED_PREPEND_PENDING_KEY);
  } catch {
    return { kind: "none" };
  }

  if (!raw?.trim()) {
    return { kind: "none" };
  }

  const parsed = parsePayload(raw);
  if (!parsed) {
    return { kind: "none" };
  }

  if (parsed.authorId !== currentAuthUserId) {
    return {
      kind: "mismatch_should_clear",
      markerAuthorId: parsed.authorId,
    };
  }

  return { kind: "pending", payload: parsed };
}

function parsePayload(raw: string): OwnCreatedPrependPendingPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 1) return null;
    const postId = typeof o.postId === "string" ? o.postId : "";
    const authorId = typeof o.authorId === "string" ? o.authorId : "";
    const typeRaw = typeof o.type === "string" ? o.type : "";
    const caption = typeof o.caption === "string" ? o.caption : null;
    const created_at =
      typeof o.created_at === "string" && o.created_at.length
        ? o.created_at
        : new Date().toISOString();
    const markerAt =
      typeof o.markerAt === "string" ? o.markerAt : new Date().toISOString();
    const rating_enabled = Boolean(o.rating_enabled);

    if (!postId || !authorId || (typeRaw !== "experience" && typeRaw !== "hangout")) {
      return null;
    }

    const tags = Array.isArray(o.tags)
      ? (o.tags as unknown[]).map((t) => String(t)).filter(Boolean).slice(0, 80)
      : null;

    const selected_dates =
      Array.isArray(o.selected_dates)
        ? (o.selected_dates as unknown[]).map((d) => String(d))
        : null;

    const recurrence_days =
      Array.isArray(o.recurrence_days)
        ? (o.recurrence_days as unknown[]).map((d) => String(d))
        : null;

    const is_recurring =
      typeof o.is_recurring === "boolean"
        ? o.is_recurring
        : typeof o.is_recurring === "object" && o.is_recurring === null
          ? null
          : null;

    const rsvp_capacity =
      o.rsvp_capacity === null ||
      typeof o.rsvp_capacity === "number"
        ? (o.rsvp_capacity as number | null)
        : null;

    const visibility =
      typeof o.visibility === "string" &&
      (o.visibility === "public" ||
        o.visibility === "friends" ||
        o.visibility === "private")
        ? o.visibility
        : null;

    const activitiesRaw = Array.isArray(o.activities) ? o.activities : [];
    const activities: OwnCreatedPrependActivityStored[] = [];
    let i = 0;
    for (const raw of activitiesRaw.slice(0, MAX_ACTIVITIES)) {
      const a = raw as Record<string, unknown>;
      const title =
        typeof a.title === "string"
          ? clip(a.title, 500)
          : a.title === null
            ? null
            : null;
      const imgs = Array.isArray(a.images)
        ? (a.images as unknown[])
            .map((u) => String(u))
            .filter((u) => /^https?:\/\//i.test(u))
            .slice(0, 48)
        : null;
      const additional_info =
        Array.isArray(a.additional_info)
          ? (a.additional_info as { title: string; value: string }[])
              .filter(
                (x) =>
                  x &&
                  typeof x.title === "string" &&
                  typeof x.value === "string"
              )
              .slice(0, 20)
              .map((x) => ({
                title: clip(x.title, 240),
                value: clip(x.value, MAX_STRING),
              }))
          : null;
      activities.push({
        order_idx: typeof a.order_idx === "number" ? a.order_idx : i,
        title,
        images: imgs && imgs.length ? imgs : null,
        location_name:
          typeof a.location_name === "string"
            ? clip(a.location_name, 500)
            : (a.location_name as null) ?? null,
        location_desc:
          typeof a.location_desc === "string"
            ? clip(a.location_desc, MAX_STRING)
            : (a.location_desc as null) ?? null,
        location_url:
          typeof a.location_url === "string"
            ? clip(a.location_url, 2000)
            : (a.location_url as null) ?? null,
        location_notes:
          typeof a.location_notes === "string"
            ? clip(a.location_notes, MAX_STRING)
            : (a.location_notes as null) ?? null,
        additional_info,
        tags: Array.isArray(a.tags)
          ? (a.tags as unknown[]).map((t) => String(t)).filter(Boolean).slice(0, 40)
          : null,
      });
      i += 1;
    }

    return {
      v: 1,
      postId,
      authorId,
      type: typeRaw as "experience" | "hangout",
      caption:
        caption != null ? clip(caption, MAX_STRING) : null,
      tags,
      created_at,
      selected_dates,
      is_recurring,
      recurrence_days,
      rsvp_capacity,
      rating_enabled,
      visibility,
      activities,
      markerAt,
    };
  } catch {
    return null;
  }
}

function storageRemove(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(OWN_CREATED_PREPEND_PENDING_KEY);
    }
  } catch {
    /* noop */
  }
}

/**
 * Persist after successful NEW publish only. URLs/metadata only — no blobs.
 */
export function persistOwnCreatedPrependPending(
  payload: OwnCreatedPrependPendingPayload
): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      OWN_CREATED_PREPEND_PENDING_KEY,
      JSON.stringify(payload)
    );
  } catch {
    /* quota / privacy mode */
  }
}

/** Read/remove marker once; validates author matches auth user id. */
export function consumeOwnCreatedPrependPending(
  currentAuthUserId: string
): ConsumeOwnCreatedPrependResult {
  if (
    typeof sessionStorage === "undefined" ||
    !currentAuthUserId ||
    typeof currentAuthUserId !== "string"
  ) {
    return { kind: "none" };
  }

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(OWN_CREATED_PREPEND_PENDING_KEY);
  } catch {
    return { kind: "none" };
  }

  if (!raw?.trim()) {
    return { kind: "none" };
  }

  const parsed = parsePayload(raw);
  if (!parsed) {
    storageRemove();
    return { kind: "none" };
  }

  if (parsed.authorId !== currentAuthUserId) {
    storageRemove();
    return {
      kind: "mismatch_cleared",
      markerAuthorId: parsed.authorId,
    };
  }

  storageRemove();
  return { kind: "consumed", payload: parsed };
}

export type MinimalProfileForLocalFeedItem = Pick<
  Profile,
  "id" | "user_id" | "username" | "display_name" | "avatar_url"
>;

/**
 * Build a feed row suitable for `<Post />` on Created tab (owner).
 */
export function buildLocalPrependedFeedItem(
  profile: MinimalProfileForLocalFeedItem | null,
  pending: OwnCreatedPrependPendingPayload
): FeedItem {
  const activitiesMapped = pending.activities.map((a, idx) => ({
    title: a.title,
    images: a.images,
    order_idx:
      typeof a.order_idx === "number" ? a.order_idx : idx,
    location_name: a.location_name ?? null,
    location_desc: a.location_desc ?? null,
    location_url: a.location_url ?? null,
    location_notes: a.location_notes ?? null,
    additional_info: a.additional_info ?? null,
    tags: a.tags ?? null,
  }));

  const has_images = activitiesMapped.some(
    (row) =>
      Array.isArray(row.images) &&
      row.images.some((u) => typeof u === "string" && u.length > 0)
  );

  const author =
    profile && profile.user_id === pending.authorId
      ? {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        }
      : {
          id: pending.authorId,
          username: null as string | null,
          display_name: null as string | null,
          avatar_url: null as string | null,
        };

  const item: FeedItem = {
    id: pending.postId,
    type: pending.type,
    caption: pending.caption,
    is_anonymous: false,
    anonymous_name: null,
    anonymous_avatar: null,
    created_at: pending.created_at,
    selected_dates: pending.selected_dates,
    tags: pending.tags,
    author_id: pending.authorId,
    author,
    follow_status: "friends",
    is_liked: false,
    is_saved: false,
    like_count: 0,
    save_count: 0,
    effective_like_count: 0,
    effective_save_count: 0,
    comment_count: 0,
    has_images,
    rsvp_data: pending.type === "hangout"
      ? {
          users: [],
          currentUserStatus: null,
          going_count: 0,
        }
      : null,
    status: "published",
    visibility: pending.visibility ?? undefined,
    rsvp_capacity:
      pending.rsvp_capacity != null ? pending.rsvp_capacity : null,
    is_recurring: pending.is_recurring,
    recurrence_days: pending.recurrence_days,
    rating_enabled: pending.rating_enabled ?? false,
    rating_average: null,
    rating_count: null,
    effective_rating_average: null,
    effective_rating_count: null,
    viewer_rating: null,
    activities: activitiesMapped,
    activity_count:
      pending.activities.length > 0 ? pending.activities.length : undefined,
  };

  return item;
}
