import { supabase } from "../../lib/supabaseClient";

export type ProfileSearchRow = {
  id: string;
  /** Auth user id — use for `posts.author_id`, not `id`. */
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  member_no: number | null;
  follows_you: boolean; // they follow viewer
  you_follow: boolean; // viewer follows them
};

export type SearchProfilesOptions = {
  /** Page size (default 25 for profile overlay). Capped at 50. */
  limit?: number;
  /** Row offset for pagination (default 0). */
  offset?: number;
};

export async function searchProfiles(
  q: string,
  viewerId?: string,
  options?: SearchProfilesOptions
): Promise<ProfileSearchRow[]> {
  if (!q) return [];

  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const offset = Math.max(options?.offset ?? 0, 0);

  // basic name/username match (exclude soft-deleted profiles)
  let q1 = supabase
    .from("profiles")
    .select(
      `
      id, user_id, username, display_name, avatar_url, member_no
    `
    )
    .is("deleted_at", null)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("display_name", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error } = await q1;
  if (error || !data) return [];

  // If we know the viewer, fetch follow edges to label buttons
  if (!viewerId) {
    return data.map((p) => ({
      ...p,
      follows_you: false,
      you_follow: false,
    })) as ProfileSearchRow[];
  }

  // who YOU follow
  const { data: youFollow } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in(
      "following_id",
      data.map((p) => p.id)
    );

  // who follows YOU
  const { data: followsYou } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("following_id", viewerId)
    .in(
      "follower_id",
      data.map((p) => p.id)
    );

  const youFollowSet = new Set((youFollow || []).map((r) => r.following_id));
  const followsYouSet = new Set((followsYou || []).map((r) => r.follower_id));

  return data.map((p) => ({
    ...p,
    follows_you: followsYouSet.has(p.id),
    you_follow: youFollowSet.has(p.id),
  })) as ProfileSearchRow[];
}
