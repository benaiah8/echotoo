import { supabase } from "./supabaseClient";
import type { PostMediaVideoStatus } from "./bunnyUpload/types";

export type PostMediaRow = {
  id: string;
  publish_post_id: string;
  owner_user_id: string;
  post_id: string | null;
  bunny_video_id: string;
  video_status: PostMediaVideoStatus;
  poster_url: string | null;
};

const POST_MEDIA_SELECT =
  "id, publish_post_id, owner_user_id, post_id, bunny_video_id, video_status, poster_url";

export async function fetchPostMediaById(
  mediaId: string,
): Promise<PostMediaRow | null> {
  const { data, error } = await supabase
    .from("post_media")
    .select(POST_MEDIA_SELECT)
    .eq("id", mediaId)
    .maybeSingle();

  if (error) {
    console.error("[postMediaRow] fetch by id failed", { mediaId, error });
    return null;
  }

  return (data as PostMediaRow | null) ?? null;
}

/** Owner's unattached pre-publish video for a draft publishPostId (max 1 for MVP). */
export async function fetchUnattachedPostMediaForPublishPost(
  publishPostId: string,
): Promise<PostMediaRow | null> {
  const { data, error } = await supabase
    .from("post_media")
    .select(POST_MEDIA_SELECT)
    .eq("publish_post_id", publishPostId)
    .is("post_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[postMediaRow] fetch unattached failed", {
      publishPostId,
      error,
    });
    return null;
  }

  return (data as PostMediaRow | null) ?? null;
}
