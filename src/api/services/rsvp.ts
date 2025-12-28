// src/api/services/rsvp.ts
// RSVP-related API functions

import { supabase } from "../../lib/supabaseClient";

export interface RSVPUser {
  id: string; // Profile ID
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

export interface RSVPListResult {
  users: RSVPUser[];
  currentUserStatus: string | null;
}

/**
 * [OPTIMIZATION: Phase 3.5] Optimized version using PostgreSQL function
 * Returns RSVP list with all user profiles and current user status in a single query
 * Replaces 3 separate queries (RSVP responses → profiles → current user status)
 */
export async function getRSVPListOptimized(
  postId: string,
  viewerUserId: string | null = null
): Promise<{ data: RSVPListResult | null; error: any }> {
  try {
    console.log("[getRSVPListOptimized] Starting query with params:", {
      postId,
      viewerUserId: viewerUserId ? "[REDACTED]" : null,
    });

    const { data, error } = await supabase.rpc("get_rsvp_list_with_profiles", {
      p_post_id: postId,
      p_viewer_user_id: viewerUserId || null,
    });

    if (error) {
      console.error("[getRSVPListOptimized] RPC error:", error);
      return { data: null, error };
    }

    if (!data) {
      console.warn("[getRSVPListOptimized] No data returned");
      return { data: null, error: { message: "No data returned" } };
    }

    // The PostgreSQL function returns the data in the correct format
    const result: RSVPListResult = {
      users: data.users || [],
      currentUserStatus: data.currentUserStatus || null,
    };

    console.log("[getRSVPListOptimized] Query result:", {
      postId,
      userCount: result.users.length,
      hasCurrentUserStatus: result.currentUserStatus !== null,
      error: null,
    });

    return { data: result, error: null };
  } catch (error: any) {
    console.error("[getRSVPListOptimized] Unexpected error:", error);
    return { data: null, error };
  }
}

