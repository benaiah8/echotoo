import { supabase } from "./supabaseClient";
import { pageCache } from "./pageCache";

export async function prefetchProfile(usernameOrId: string) {
  const key = `prof:${usernameOrId.toLowerCase()}`;
  if (pageCache.get(key)) return;

  // try username, then id
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, xp, member_no")
    .ilike("username", usernameOrId)
    .maybeSingle();

  if (data) {
    pageCache.set(key, data);
    return;
  }

  const { data: byId } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, xp, member_no")
    .eq("id", usernameOrId)
    .maybeSingle();

  if (byId) pageCache.set(key, byId);
}
