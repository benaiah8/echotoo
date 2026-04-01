import { supabase } from "../../lib/supabaseClient";
import { dataCache } from "../../lib/dataCache";
import { getViewerAuthUserId } from "./follows";

export interface PostShare {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

/**
 * Share a post for the current user
 * Note: Shares are one-way actions (no unshare needed)
 */
export async function sharePost(
  postId: string
): Promise<{ data: PostShare | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    // Use upsert to handle duplicate shares gracefully (prevents 409 errors)
    const { data, error } = await supabase
      .from("post_shares")
      .upsert(
        {
          user_id: userId,
          post_id: postId,
        },
        {
          onConflict: "user_id,post_id", // Handle duplicate constraint
          ignoreDuplicates: false, // Return the existing row if duplicate
        }
      )
      .select("*")
      .single();

    // Invalidate cache when sharing
    if (!error) {
      // [PHASE D.1] Clear profile posts cache for interacted tab using dataCache
      dataCache.delete(`profile_interacted_${userId}`);
    }

    return { data, error };
  } catch (error) {
    console.error("Share post error:", error);
    return { data: null, error };
  }
}

/**
 * Check if a post was shared by the current user
 */
export async function isPostShared(
  postId: string
): Promise<{ data: boolean; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    // Skip checking for draft posts (they have invalid UUIDs)
    if (postId.startsWith("draft-")) {
      return { data: false, error: null };
    }

    const { data, error } = await supabase
      .from("post_shares")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle();

    if (error) {
      console.error("Check shared post error:", error);
      return { data: false, error };
    }

    return { data: !!data, error: null };
  } catch (error) {
    console.error("Check shared post error:", error);
    return { data: false, error };
  }
}
