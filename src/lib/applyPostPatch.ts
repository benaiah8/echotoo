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
    if (
      (updated as any).effective_like_count !== undefined &&
      typeof (updated as any).effective_like_count === "number"
    ) {
      (updated as any).effective_like_count = Math.max(
        0,
        ((updated as any).effective_like_count ?? 0) + p.likesDelta
      );
    }
  }
  if (typeof p.effectiveLikeCount === "number") {
    (updated as any).effective_like_count = Math.max(0, p.effectiveLikeCount);
  }
  if (p.viewerLiked !== undefined) {
    (updated as any).is_liked = p.viewerLiked;
  }
  if (typeof p.saveCount === "number") {
    (updated as any).save_count = Math.max(0, p.saveCount);
  } else if (p.savesDelta !== undefined) {
    (updated as any).save_count = Math.max(
      0,
      ((updated as any).save_count ?? 0) + p.savesDelta
    );
    if (
      (updated as any).effective_save_count !== undefined &&
      typeof (updated as any).effective_save_count === "number"
    ) {
      (updated as any).effective_save_count = Math.max(
        0,
        ((updated as any).effective_save_count ?? 0) + p.savesDelta
      );
    }
  }
  if (typeof p.effectiveSaveCount === "number") {
    (updated as any).effective_save_count = Math.max(0, p.effectiveSaveCount);
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
  if (p.ratingAverage !== undefined) {
    if (p.ratingAverage === null) {
      (updated as any).rating_average = null;
    } else if (typeof p.ratingAverage === "number") {
      (updated as any).rating_average = p.ratingAverage;
    }
  }
  if (p.ratingCount !== undefined) {
    if (p.ratingCount === null) {
      (updated as any).rating_count = null;
    } else if (typeof p.ratingCount === "number") {
      (updated as any).rating_count = Math.max(0, p.ratingCount);
    }
  }
  if (p.effectiveRatingAverage !== undefined) {
    if (p.effectiveRatingAverage === null) {
      (updated as any).effective_rating_average = null;
    } else if (typeof p.effectiveRatingAverage === "number") {
      (updated as any).effective_rating_average = p.effectiveRatingAverage;
    }
  }
  if (p.effectiveRatingCount !== undefined) {
    if (p.effectiveRatingCount === null) {
      (updated as any).effective_rating_count = null;
    } else if (typeof p.effectiveRatingCount === "number") {
      (updated as any).effective_rating_count = Math.max(
        0,
        p.effectiveRatingCount
      );
    }
  }
  if (p.viewerRating !== undefined) {
    (updated as any).viewer_rating = p.viewerRating;
  }
  if (typeof p.ratingEnabled === "boolean") {
    (updated as any).rating_enabled = p.ratingEnabled;
  }

  return updated as T;
}
