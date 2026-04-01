/**
 * Central post-change event helper.
 * Emit events on mutations (like, save, comment) so feed/profile cards
 * can patch their local state immediately without refetch.
 */

export type PostPatch = {
  likesDelta?: number;
  /** Absolute like count from server; used when delta would be wrong (e.g. upsert conflict) */
  likeCount?: number;
  viewerLiked?: boolean;
  savesDelta?: number;
  viewerSaved?: boolean;
  commentsDelta?: number;
  /** Absolute comment count from server */
  commentCount?: number;
  /** Viewer's follow status toward post author (none | pending | following | friends) */
  viewerFollowStatus?: "none" | "pending" | "following" | "friends";
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
