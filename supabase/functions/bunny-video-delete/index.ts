/**
 * bunny-video-delete — Create-phase cleanup for unattached post_media videos.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createServiceRoleClient } from "../_shared/push/edgeAuth.ts";
import {
  bunnyVideoDeleteCorsHeaders,
  bunnyVideoDeleteJsonResponse,
} from "./cors.ts";
import { deleteBunnyVideo } from "./bunnyApi.ts";
import {
  canDeleteUnattachedCreateMedia,
  LOG_PREFIX,
  validateVideoDeleteRequest,
  type PostMediaDeleteRow,
} from "./helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: bunnyVideoDeleteCorsHeaders });
  }

  if (req.method !== "POST") {
    return bunnyVideoDeleteJsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bunnyApiKey = Deno.env.get("BUNNY_STREAM_API_KEY");
  const bunnyLibraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID");

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !bunnyApiKey ||
    !bunnyLibraryId
  ) {
    console.error(`${LOG_PREFIX} Missing server env`);
    return bunnyVideoDeleteJsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return bunnyVideoDeleteJsonResponse({ error: "Missing Authorization" }, 401);
  }

  const userToken = authHeader.slice("Bearer ".length).trim();
  if (!userToken) {
    return bunnyVideoDeleteJsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(userToken);

  if (userError || !user?.id) {
    return bunnyVideoDeleteJsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;
  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bunnyVideoDeleteJsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validated = validateVideoDeleteRequest(body);
  if (!validated.ok) {
    return bunnyVideoDeleteJsonResponse({ error: validated.error }, validated.status);
  }

  const { publishPostId, mediaId } = validated.data;

  const { data: rowData, error: lookupError } = await supabaseAdmin
    .from("post_media")
    .select("id, publish_post_id, owner_user_id, post_id, bunny_video_id")
    .eq("id", mediaId)
    .maybeSingle();

  if (lookupError) {
    console.error(`${LOG_PREFIX} post_media lookup:`, lookupError.message);
    return bunnyVideoDeleteJsonResponse({ error: "Failed to look up media" }, 500);
  }

  if (!rowData?.id) {
    console.info(
      `${LOG_PREFIX} idempotent success mediaId=${mediaId} publishPostId=${publishPostId}`,
    );
    return bunnyVideoDeleteJsonResponse(
      { ok: true, deleted: true, alreadyGone: true },
      200,
    );
  }

  const row = rowData as PostMediaDeleteRow;
  const allowed = canDeleteUnattachedCreateMedia(
    row,
    userId,
    publishPostId,
    mediaId,
  );
  if (!allowed.ok) {
    return bunnyVideoDeleteJsonResponse({ error: allowed.error }, allowed.status);
  }

  const bunnyDelete = await deleteBunnyVideo(
    bunnyLibraryId,
    bunnyApiKey,
    row.bunny_video_id,
  );

  if (!bunnyDelete.ok) {
    console.error(
      `${LOG_PREFIX} bunny delete failed mediaId=${mediaId} videoId=${row.bunny_video_id} status=${bunnyDelete.status}`,
    );
    return bunnyVideoDeleteJsonResponse({ error: "Failed to delete video from storage" }, 502);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("post_media")
    .delete()
    .eq("id", mediaId)
    .eq("publish_post_id", publishPostId)
    .eq("owner_user_id", userId)
    .is("post_id", null);

  if (deleteError) {
    console.error(`${LOG_PREFIX} post_media delete:`, deleteError.message);
    return bunnyVideoDeleteJsonResponse({ error: "Failed to delete media record" }, 500);
  }

  console.info(
    `${LOG_PREFIX} deleted mediaId=${mediaId} publishPostId=${publishPostId} bunnyNotFound=${bunnyDelete.notFound}`,
  );

  return bunnyVideoDeleteJsonResponse(
    {
      ok: true,
      deleted: true,
      bunnyNotFound: bunnyDelete.notFound,
    },
    200,
  );
});
