import { supabase } from "../../lib/supabaseClient";
import { getViewerAuthUserId } from "./follows";

export type PushDevicePlatform = "ios" | "android";

/**
 * Upsert the current user's push token for one platform (one row per user per OS).
 */
export async function upsertPushDevice(
  token: string,
  platform: PushDevicePlatform
): Promise<{ error: Error | null }> {
  const userId = await getViewerAuthUserId();
  if (!userId) {
    return { error: new Error("Not authenticated") };
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return { error: new Error("Empty push token") };
  }

  const { error } = await supabase.from("push_devices").upsert(
    {
      user_id: userId,
      token: trimmed,
      platform,
    },
    { onConflict: "user_id,platform" }
  );

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Remove all push device rows for the signed-in user (e.g. on logout).
 */
export async function deleteMyPushDevices(): Promise<{ error: Error | null }> {
  const userId = await getViewerAuthUserId();
  if (!userId) {
    return { error: null };
  }

  const { error } = await supabase
    .from("push_devices")
    .delete()
    .eq("user_id", userId);

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
