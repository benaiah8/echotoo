/**
 * Account-level actions (e.g. soft delete).
 * Does NOT modify auth.users; only app-level profile data.
 */

import { supabase } from "../../lib/supabaseClient";

export type SoftDeleteResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Soft-deletes the current user's profile by setting profiles.deleted_at = now().
 * Filters by current auth user id. Does NOT delete auth.users or any other records.
 */
export async function softDeleteAccount(): Promise<SoftDeleteResult> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      return {
        success: false,
        error: sessionError.message || "Failed to get session",
      };
    }

    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) {
      return {
        success: false,
        error: error.message || "Failed to delete account",
      };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Unexpected error" };
  }
}
