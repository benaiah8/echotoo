import { supabase } from "../../lib/supabaseClient";

export async function getPostById(id: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
  id,
  type,
  caption,
  created_at,
  author_id,
  visibility,
  is_anonymous,
  anonymous_name,
  anonymous_avatar,
  rsvp_capacity,
  selected_dates,
  is_recurring,
  recurrence_days,
  tags,
  author:profiles!posts_author_id_fkey(
    id,
    display_name,
    username,
    avatar_url
  ),
  activities:activities(
    title,
    images,
    order_idx,
    location_name,
    location_desc,
    location_url,
    location_notes,
    additional_info,
    tags
  )
`
    )
    .eq("id", id)
    .order("order_idx", { foreignTable: "activities", ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}
