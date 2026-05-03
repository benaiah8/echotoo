import { supabase } from "../../lib/supabaseClient";
import { getViewerAuthUserId } from "./follows";
import { emitPostChanged } from "../../lib/postEvents";
import { invalidatePostDetailCache } from "../queries/getPostById";

export type UpsertPostRatingResult = {
  ratingAverage: number | null;
  ratingCount: number | null;
  effectiveRatingAverage: number | null;
  effectiveRatingCount: number | null;
  viewerRating: number | null;
};

function roundToSingleDecimal(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * Upsert viewer's post rating (1..5 stars), then fetch fresh aggregates.
 * DB unique constraint on (post_id, user_id) ensures one rating per user per post.
 */
export async function upsertPostRating(
  postId: string,
  stars: number
): Promise<{ data: UpsertPostRatingResult | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const safeStars = Math.max(1, Math.min(5, Math.round(stars)));

    const { error: upsertError } = await supabase.from("post_ratings").upsert(
      {
        post_id: postId,
        user_id: userId,
        stars: safeStars,
      },
      { onConflict: "post_id,user_id" }
    );

    if (upsertError) {
      return { data: null, error: upsertError };
    }

    const [
      { data: postRow, error: postError },
      { data: demoRow, error: demoError },
      { data: viewerRow, error: vrError },
    ] =
      await Promise.all([
        supabase
          .from("posts")
          .select("type, rating_average, rating_count, rating_enabled")
          .eq("id", postId)
          .single(),
        supabase
          .from("post_demo_engagement")
          .select("demo_rating_average, demo_rating_count")
          .eq("post_id", postId)
          .maybeSingle(),
        supabase
          .from("post_ratings")
          .select("stars")
          .eq("post_id", postId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    if (postError || vrError || demoError) {
      return { data: null, error: postError || vrError || demoError };
    }

    const realCount =
      typeof postRow?.rating_count === "number" && Number.isFinite(postRow.rating_count)
        ? postRow.rating_count
        : 0;
    const realAverage =
      typeof postRow?.rating_average === "number" &&
      Number.isFinite(postRow.rating_average)
        ? postRow.rating_average
        : 0;
    const demoCount =
      typeof demoRow?.demo_rating_count === "number" &&
      Number.isFinite(demoRow.demo_rating_count)
        ? demoRow.demo_rating_count
        : 0;
    const demoAverage =
      typeof demoRow?.demo_rating_average === "number" &&
      Number.isFinite(demoRow.demo_rating_average)
        ? demoRow.demo_rating_average
        : 0;
    const isExperience = postRow?.type === "experience";
    const effectiveRatingCount = isExperience ? demoCount + realCount : realCount;
    const effectiveRatingAverage = isExperience
      ? effectiveRatingCount > 0
        ? roundToSingleDecimal(
            (demoAverage * demoCount + realAverage * realCount) /
              effectiveRatingCount
          )
        : 0
      : realAverage;

    const payload: UpsertPostRatingResult = {
      ratingAverage:
        typeof postRow?.rating_average === "number" && Number.isFinite(postRow.rating_average)
          ? postRow.rating_average
          : null,
      ratingCount:
        typeof postRow?.rating_count === "number" && Number.isFinite(postRow.rating_count)
          ? postRow.rating_count
          : null,
      effectiveRatingAverage,
      effectiveRatingCount,
      viewerRating:
        typeof viewerRow?.stars === "number" && Number.isFinite(viewerRow.stars)
          ? viewerRow.stars
          : safeStars,
    };

    emitPostChanged(postId, {
      ratingAverage: payload.ratingAverage ?? undefined,
      ratingCount: payload.ratingCount ?? undefined,
      effectiveRatingAverage: payload.effectiveRatingAverage ?? undefined,
      effectiveRatingCount: payload.effectiveRatingCount ?? undefined,
      viewerRating: payload.viewerRating ?? undefined,
      ratingEnabled:
        typeof postRow?.rating_enabled === "boolean"
          ? postRow.rating_enabled
          : undefined,
    });
    invalidatePostDetailCache(postId);

    return { data: payload, error: null };
  } catch (error) {
    console.error("Upsert post rating error:", error);
    return { data: null, error };
  }
}

/**
 * Remove the current viewer's rating row for this post, then fetch fresh aggregates.
 * Used when the user taps the same star again to clear their rating.
 */
export async function deletePostRating(
  postId: string
): Promise<{ data: UpsertPostRatingResult | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { error: deleteError } = await supabase
      .from("post_ratings")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (deleteError) {
      return { data: null, error: deleteError };
    }

    const [
      { data: postRow, error: postError },
      { data: demoRow, error: demoError },
      { data: viewerRow, error: vrError },
    ] =
      await Promise.all([
        supabase
          .from("posts")
          .select("type, rating_average, rating_count, rating_enabled")
          .eq("id", postId)
          .single(),
        supabase
          .from("post_demo_engagement")
          .select("demo_rating_average, demo_rating_count")
          .eq("post_id", postId)
          .maybeSingle(),
        supabase
          .from("post_ratings")
          .select("stars")
          .eq("post_id", postId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    if (postError || vrError || demoError) {
      return { data: null, error: postError || vrError || demoError };
    }

    const realCount =
      typeof postRow?.rating_count === "number" && Number.isFinite(postRow.rating_count)
        ? postRow.rating_count
        : 0;
    const realAverage =
      typeof postRow?.rating_average === "number" &&
      Number.isFinite(postRow.rating_average)
        ? postRow.rating_average
        : 0;
    const demoCount =
      typeof demoRow?.demo_rating_count === "number" &&
      Number.isFinite(demoRow.demo_rating_count)
        ? demoRow.demo_rating_count
        : 0;
    const demoAverage =
      typeof demoRow?.demo_rating_average === "number" &&
      Number.isFinite(demoRow.demo_rating_average)
        ? demoRow.demo_rating_average
        : 0;
    const isExperience = postRow?.type === "experience";
    const effectiveRatingCount = isExperience ? demoCount + realCount : realCount;
    const effectiveRatingAverage = isExperience
      ? effectiveRatingCount > 0
        ? roundToSingleDecimal(
            (demoAverage * demoCount + realAverage * realCount) /
              effectiveRatingCount
          )
        : 0
      : realAverage;

    const payload: UpsertPostRatingResult = {
      ratingAverage:
        typeof postRow?.rating_average === "number" && Number.isFinite(postRow.rating_average)
          ? postRow.rating_average
          : null,
      ratingCount:
        typeof postRow?.rating_count === "number" && Number.isFinite(postRow.rating_count)
          ? postRow.rating_count
          : null,
      effectiveRatingAverage,
      effectiveRatingCount,
      viewerRating:
        typeof viewerRow?.stars === "number" && Number.isFinite(viewerRow.stars)
          ? viewerRow.stars
          : null,
    };

    emitPostChanged(postId, {
      ratingAverage: payload.ratingAverage ?? undefined,
      ratingCount: payload.ratingCount ?? undefined,
      effectiveRatingAverage: payload.effectiveRatingAverage ?? undefined,
      effectiveRatingCount: payload.effectiveRatingCount ?? undefined,
      viewerRating: null,
      ratingEnabled:
        typeof postRow?.rating_enabled === "boolean"
          ? postRow.rating_enabled
          : undefined,
    });
    invalidatePostDetailCache(postId);

    return { data: payload, error: null };
  } catch (error) {
    console.error("Delete post rating error:", error);
    return { data: null, error };
  }
}

