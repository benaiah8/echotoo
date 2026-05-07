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
