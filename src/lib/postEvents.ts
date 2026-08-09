/**
 * Central post-change event helper.
 * Emit events on mutations (like, save, comment) so feed/profile cards
 * can patch their local state immediately without refetch.
 */

export type PostPatch = {
  likesDelta?: number;
  /** Absolute like count from server; used when delta would be wrong (e.g. upsert conflict) */
  likeCount?: number;
  /** Absolute effective like count (real + demo, where applicable). */
  effectiveLikeCount?: number;
  viewerLiked?: boolean;
  savesDelta?: number;
  /** Absolute save count from server (Realtime / authoritative sync) */
  saveCount?: number;
  /** Absolute effective save count (real + demo, where applicable). */
  effectiveSaveCount?: number;
  viewerSaved?: boolean;
  commentsDelta?: number;
  /** Absolute comment count from server */
  commentCount?: number;
  /** Viewer's follow status toward post author (none | pending | following | friends) */
  viewerFollowStatus?: "none" | "pending" | "following" | "friends";
  /** Rating aggregates and viewer value (displayed in feed + detail). */
  ratingAverage?: number | null;
  ratingCount?: number | null;
  effectiveRatingAverage?: number | null;
  effectiveRatingCount?: number | null;
  viewerRating?: number | null;
  ratingEnabled?: boolean;
  /** Admin ownership transfer — updates feed/detail author display without refetch. */
  author_id?: string;
  author?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  /** Admin / republish content sync — patches visible feed/detail cards without refetch. */
  caption?: string | null;
  tags?: string[] | null;
  visibility?: "public" | "friends" | "private";
  selected_dates?: string[] | null;
  rsvp_capacity?: number | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  activities?: Array<{
    id?: string;
    title: string | null;
    images: string[] | null;
    order_idx: number | null;
    location_name?: string | null;
    location_desc?: string | null;
    location_url?: string | null;
    location_notes?: string | null;
    additional_info?: { title: string; value: string }[] | null;
    tags?: string[] | null;
  }>;
  first_image_url?: string | null;
  has_images?: boolean;
  image_count?: number;
};

export function emitPostChanged(postId: string, patch: PostPatch): void {
  window.dispatchEvent(
    new CustomEvent("post:changed", { detail: { postId, patch } })
  );
}

export function onPostChanged(
  handler: (event: CustomEvent<{ postId: string; patch: PostPatch }>) => void
): () => void {
  const wrapped = (e: Event) =>
    handler(e as CustomEvent<{ postId: string; patch: PostPatch }>);
  window.addEventListener("post:changed", wrapped);
  return () => window.removeEventListener("post:changed", wrapped);
}

/** Fired after a published post is successfully deleted (DB row removed). */
export const POST_DELETED_EVENT = "post:deleted" as const;

export function emitPostDeleted(postId: string): void {
  window.dispatchEvent(
    new CustomEvent(POST_DELETED_EVENT, { detail: { postId } })
  );
}

export function onPostDeleted(handler: (postId: string) => void): () => void {
  const wrapped = (e: Event) => {
    const id = (e as CustomEvent<{ postId: string }>).detail?.postId;
    if (typeof id === "string") handler(id);
  };
  window.addEventListener(POST_DELETED_EVENT, wrapped);
  return () => window.removeEventListener(POST_DELETED_EVENT, wrapped);
}

/** Fired after admin ownership transfer — list membership changes, not deletion. */
export const POST_OWNERSHIP_CHANGED_EVENT = "post:ownershipChanged" as const;

export type PostOwnershipChangedDetail = {
  postId: string;
  oldAuthorId: string;
  newAuthorId: string;
};

export function emitPostOwnershipChanged(
  postId: string,
  oldAuthorId: string,
  newAuthorId: string
): void {
  window.dispatchEvent(
    new CustomEvent(POST_OWNERSHIP_CHANGED_EVENT, {
      detail: { postId, oldAuthorId, newAuthorId },
    })
  );
}

export function onPostOwnershipChanged(
  handler: (detail: PostOwnershipChangedDetail) => void
): () => void {
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<PostOwnershipChangedDetail>).detail;
    if (
      detail &&
      typeof detail.postId === "string" &&
      typeof detail.oldAuthorId === "string" &&
      typeof detail.newAuthorId === "string"
    ) {
      handler(detail);
    }
  };
  window.addEventListener(POST_OWNERSHIP_CHANGED_EVENT, wrapped);
  return () => window.removeEventListener(POST_OWNERSHIP_CHANGED_EVENT, wrapped);
}
