import { supabase } from "../../lib/supabaseClient";

async function requireSessionUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

/** True if the signed-in user has blocked `blockedUserId` (auth user id). */
export async function isBlockingUser(blockedUserId: string): Promise<boolean> {
  if (!blockedUserId?.trim()) return false;
  const uid = await requireSessionUserId();
  if (uid === blockedUserId) return false;
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_user_id", uid)
    .eq("blocked_user_id", blockedUserId)
    .maybeSingle();
  if (error) {
    console.error("[blocks] isBlockingUser", error);
    return false;
  }
  return !!data?.id;
}

export async function blockUser(blockedUserId: string): Promise<void> {
  const uid = await requireSessionUserId();
  if (uid === blockedUserId) throw new Error("Cannot block yourself");
  const { error } = await supabase.from("user_blocks").insert({
    blocker_user_id: uid,
    blocked_user_id: blockedUserId,
  });
  if (error) throw error;
}

export async function unblockUser(blockedUserId: string): Promise<void> {
  const uid = await requireSessionUserId();
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", uid)
    .eq("blocked_user_id", blockedUserId);
  if (error) throw error;
}
