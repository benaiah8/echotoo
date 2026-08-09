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
  if (p.author_id !== undefined) {
    (updated as any).author_id = p.author_id;
  }
  if (p.author !== undefined) {
    (updated as any).author = p.author;
  }
  if (p.caption !== undefined) {
    (updated as any).caption = p.caption;
  }
  if (p.tags !== undefined) {
    (updated as any).tags = p.tags;
  }
  if (p.visibility !== undefined) {
    (updated as any).visibility = p.visibility;
  }
  if (p.selected_dates !== undefined) {
    (updated as any).selected_dates = p.selected_dates;
  }
  if (p.rsvp_capacity !== undefined) {
    (updated as any).rsvp_capacity = p.rsvp_capacity;
  }
  if (p.is_recurring !== undefined) {
    (updated as any).is_recurring = p.is_recurring;
  }
  if (p.recurrence_days !== undefined) {
    (updated as any).recurrence_days = p.recurrence_days;
  }
  if (p.activities !== undefined) {
    (updated as any).activities = p.activities;
  }
  if (p.first_image_url !== undefined) {
    (updated as any).first_image_url = p.first_image_url;
  }
  if (p.has_images !== undefined) {
    (updated as any).has_images = p.has_images;
  }
  if (p.image_count !== undefined) {
    (updated as any).image_count = p.image_count;
  }

  return updated as T;
}

/**
 * When soft-refresh merges a server row over an existing feed row, keep viewer-local
 * fields if the server snapshot omitted them or is stale vs optimistic UI.
 */
export function preserveViewerLocalFeedFields<
  T extends Record<string, unknown>,
>(fresh: T, prev: T | undefined): T {
  if (!prev) return fresh;

  const out = { ...fresh } as Record<string, unknown>;
  const p = prev as Record<string, unknown>;

  if (out.is_liked === undefined && p.is_liked !== undefined) {
    out.is_liked = p.is_liked;
  }
  if (out.is_saved === undefined && p.is_saved !== undefined) {
    out.is_saved = p.is_saved;
  }
  if (out.viewer_rating === undefined && p.viewer_rating !== undefined) {
    out.viewer_rating = p.viewer_rating;
  }

  const countKeys = [
    "like_count",
    "effective_like_count",
    "save_count",
    "effective_save_count",
    "rating_average",
    "effective_rating_average",
    "rating_count",
    "effective_rating_count",
  ] as const;

  for (const key of countKeys) {
    const freshVal = out[key];
    const prevVal = p[key];

    if (freshVal === undefined && prevVal !== undefined) {
      out[key] = prevVal;
      continue;
    }

    if (
      typeof freshVal === "number" &&
      typeof prevVal === "number" &&
      prevVal > freshVal
    ) {
      if (key.includes("like") && p.is_liked === true) {
        out[key] = prevVal;
      } else if (key.includes("save") && p.is_saved === true) {
        out[key] = prevVal;
      } else if (key.includes("rating") && p.viewer_rating != null) {
        out[key] = prevVal;
      }
    }
  }

  return out as T;
}
