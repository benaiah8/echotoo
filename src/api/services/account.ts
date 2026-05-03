/**
 * Account-level actions (delete via Edge Function + Admin API).
 */

import { supabase } from "../../lib/supabaseClient";

export type DeleteAccountResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Deletes the current user's profile (DB cascade) and auth user via the
 * `delete-account` Edge Function. Requires an active session.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
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

    if (!session?.access_token) {
      return { success: false, error: "Not authenticated" };
    }

    const { data, error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      return {
        success: false,
        error: error.message || "Failed to delete account",
      };
    }

    if (
      data &&
      typeof data === "object" &&
      "ok" in data &&
      (data as { ok?: boolean }).ok === true
    ) {
      return { success: true };
    }

    const errMsg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to delete account";

    return { success: false, error: errMsg };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: msg };
  }
}
