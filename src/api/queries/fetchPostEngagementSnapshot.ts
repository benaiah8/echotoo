/**
 * Authoritative engagement counts + viewer flags for a single post.
 * Used by post engagement Realtime sync to patch UI with server truth (absolute values).
 */

import { supabase } from "../../lib/supabaseClient";
import { isDraftPostId } from "../../lib/drafts";

export type PostEngagementSnapshot = {
  likeCount: number;
  saveCount: number;
  effectiveLikeCount: number;
  effectiveSaveCount: number;
  commentCount: number;
  viewerLiked: boolean;
  viewerSaved: boolean;
  ratingAverage: number | null;
  ratingCount: number | null;
  effectiveRatingAverage: number | null;
  effectiveRatingCount: number | null;
  ratingEnabled: boolean | null;
  viewerRating: number | null;
};

function roundToSingleDecimal(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * Fetches current canonical aggregates from posts row + viewer-specific state in parallel.
 * Minimizes payload: public counts/ratings come from one posts-row read.
 */
export async function fetchPostEngagementSnapshot(
  postId: string,
  viewerUserId: string | null
): Promise<PostEngagementSnapshot | null> {
  if (isDraftPostId(postId)) return null;

  try {
    const [postRes, demoRes, viewerLikeRes, viewerSaveRes, viewerRatingRes] =
      await Promise.all([
      supabase
        .from("posts")
        .select(
          "type, like_count, save_count, comment_count, rating_average, rating_count, rating_enabled"
        )
        .eq("id", postId)
        .maybeSingle(),
      supabase
        .from("post_demo_engagement")
        .select(
          "demo_like_count, demo_save_count, demo_rating_average, demo_rating_count"
        )
        .eq("post_id", postId)
        .maybeSingle(),
      viewerUserId
        ? supabase
            .from("post_likes")
            .select("id")
            .eq("post_id", postId)
            .eq("user_id", viewerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      viewerUserId
        ? supabase
            .from("saved_posts")
            .select("id")
            .eq("post_id", postId)
            .eq("user_id", viewerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      viewerUserId
        ? supabase
            .from("post_ratings")
            .select("stars")
            .eq("post_id", postId)
            .eq("user_id", viewerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (postRes.error) {
      console.warn("[fetchPostEngagementSnapshot] posts:", postRes.error.message);
      return null;
    }
    if (!postRes.data) {
      return null;
    }
    if (demoRes.error) {
      console.warn(
        "[fetchPostEngagementSnapshot] post_demo_engagement:",
        demoRes.error.message
      );
    }

    const row = postRes.data as {
      type: "experience" | "hangout" | string | null;
      like_count: number | null;
      save_count: number | null;
      comment_count: number | null;
      rating_average: number | null;
      rating_count: number | null;
      rating_enabled: boolean | null;
    };
    const demoRow = (demoRes.data ?? null) as
      | {
          demo_like_count: number | null;
          demo_save_count: number | null;
          demo_rating_average: number | null;
          demo_rating_count: number | null;
        }
      | null;

    const likeCount =
      typeof row.like_count === "number" && Number.isFinite(row.like_count)
        ? row.like_count
        : 0;
    const saveCount =
      typeof row.save_count === "number" && Number.isFinite(row.save_count)
        ? row.save_count
        : 0;
    const commentCount =
      typeof row.comment_count === "number" && Number.isFinite(row.comment_count)
        ? row.comment_count
        : 0;

    const stars = viewerRatingRes.data?.stars;
    const viewerRating =
      typeof stars === "number" && Number.isFinite(stars) ? stars : null;
    const isExperience = row.type === "experience";
    const demoLikeCount =
      typeof demoRow?.demo_like_count === "number" &&
      Number.isFinite(demoRow.demo_like_count)
        ? demoRow.demo_like_count
        : 0;
    const demoSaveCount =
      typeof demoRow?.demo_save_count === "number" &&
      Number.isFinite(demoRow.demo_save_count)
        ? demoRow.demo_save_count
        : 0;
    const demoRatingAverage =
      typeof demoRow?.demo_rating_average === "number" &&
      Number.isFinite(demoRow.demo_rating_average)
        ? demoRow.demo_rating_average
        : null;
    const demoRatingCount =
      typeof demoRow?.demo_rating_count === "number" &&
      Number.isFinite(demoRow.demo_rating_count)
        ? demoRow.demo_rating_count
        : null;
    const realRatingAverage =
      typeof row.rating_average === "number" && Number.isFinite(row.rating_average)
        ? row.rating_average
        : null;
    const realRatingCount =
      typeof row.rating_count === "number" && Number.isFinite(row.rating_count)
        ? row.rating_count
        : null;
    const effectiveLikeCount = isExperience
      ? Math.max(0, likeCount + demoLikeCount)
      : Math.max(0, likeCount);
    const effectiveSaveCount = isExperience
      ? Math.max(0, saveCount + demoSaveCount)
      : Math.max(0, saveCount);
    const realCount = typeof realRatingCount === "number" ? realRatingCount : 0;
    const realAvg = typeof realRatingAverage === "number" ? realRatingAverage : 0;
    const seededCount = typeof demoRatingCount === "number" ? demoRatingCount : 0;
    const seededAvg = typeof demoRatingAverage === "number" ? demoRatingAverage : 0;
    const effectiveRatingCount = isExperience ? seededCount + realCount : realCount;
    const effectiveRatingAverage = isExperience
      ? effectiveRatingCount > 0
        ? roundToSingleDecimal(
            (seededAvg * seededCount + realAvg * realCount) / effectiveRatingCount
          )
        : 0
      : realAvg;

    return {
      likeCount: Math.max(0, likeCount),
      saveCount: Math.max(0, saveCount),
      effectiveLikeCount,
      effectiveSaveCount,
      commentCount: Math.max(0, commentCount),
      viewerLiked: !!viewerLikeRes.data,
      viewerSaved: !!viewerSaveRes.data,
      ratingAverage: realRatingAverage,
      ratingCount: realRatingCount,
      effectiveRatingAverage,
      effectiveRatingCount,
      ratingEnabled:
        typeof row.rating_enabled === "boolean" ? row.rating_enabled : null,
      viewerRating,
    };
  } catch (e) {
    console.warn("[fetchPostEngagementSnapshot] unexpected:", e);
    return null;
  }
}
