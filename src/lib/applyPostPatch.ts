/**
 * Shared patch helper for post state updates.
 * Used by ProgressiveFeed and PostDetailModal to apply like/save/comment/follow
 * changes immediately without refetch.
 */

import type { PostPatch } from "./postEvents";

/**
 * Apply a PostPatch to a post object. Returns a new object with patches applied.
 * No "in" checks - always applies count deltas (clamped at 0) so Saved/Interacted
 * tabs and items missing like_count/comment_count get updated.
 */
export function applyPostPatch<T extends Record<string, unknown>>(
  post: T,
  patch: PostPatch
): T {
  const updated = { ...post } as T & Record<string, unknown>;
  const p = patch;

  if (typeof p.likeCount === "number") {
    (updated as any).like_count = Math.max(0, p.likeCount);
  } else if (p.likesDelta !== undefined) {
    (updated as any).like_count = Math.max(
      0,
      ((updated as any).like_count ?? 0) + p.likesDelta
    );
  }
  if (p.viewerLiked !== undefined) {
    (updated as any).is_liked = p.viewerLiked;
  }
  if (p.savesDelta !== undefined) {
    (updated as any).save_count = Math.max(
      0,
      ((updated as any).save_count ?? 0) + p.savesDelta
    );
  }
  if (p.viewerSaved !== undefined) {
    (updated as any).is_saved = p.viewerSaved;
  }
  if (typeof p.commentCount === "number") {
    (updated as any).comment_count = Math.max(0, p.commentCount);
  } else if (p.commentsDelta !== undefined) {
    (updated as any).comment_count = Math.max(
      0,
      ((updated as any).comment_count ?? 0) + p.commentsDelta
    );
  }
  if (p.viewerFollowStatus !== undefined) {
    (updated as any).follow_status = p.viewerFollowStatus;
  }

  return updated as T;
}
