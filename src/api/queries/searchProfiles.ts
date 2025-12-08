import { supabase } from "../../lib/supabaseClient";

export type ProfileSearchRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  member_no: number | null;
  follows_you: boolean; // they follow viewer
  you_follow: boolean; // viewer follows them
};

export async function searchProfiles(
  q: string,
  viewerId?: string
): Promise<ProfileSearchRow[]> {
  if (!q) return [];

  // basic name/username match
  let q1 = supabase
    .from("profiles")
    .select(
      `
      id, username, display_name, avatar_url, member_no
    `
    )
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("display_name", { ascending: true })
    .limit(25);

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
