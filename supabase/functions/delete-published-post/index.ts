/**
 * delete-published-post — server-owned published post deletion with Bunny cleanup.
 *
 * Order: auth → load post/media → Bunny delete (404 OK) → DB delete.
 * Never delete the post if Bunny hard-fails (avoids orphaned Stream storage).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  assertReportReviewer,
  createServiceRoleClient,
} from "../_shared/push/edgeAuth.ts";
import { deleteBunnyVideo } from "./bunnyApi.ts";
import { deleteEchoTooMediaPosterBestEffort } from "../_shared/echoTooMediaPosterCleanup.ts";
import {
  deletePublishedPostCorsHeaders,
  deletePublishedPostJsonResponse,
} from "./cors.ts";
import {
  DELETE_PUBLISHED_POST_USER_ERROR,
  LOG_PREFIX,
  bunnyDeletesAllowDbDelete,
  canDeletePublishedPost,
  collectAttachedBunnyVideoIds,
  validateDeletePublishedPostRequest,
  type AttachedVideoMediaRow,
  type PostDeleteRow,
} from "./helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: deletePublishedPostCorsHeaders });
  }

  if (req.method !== "POST") {
    return deletePublishedPostJsonResponse({ error: "Method not allowed" }, 405);
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
    return deletePublishedPostJsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return deletePublishedPostJsonResponse({ error: "Missing Authorization" }, 401);
  }

  const userToken = authHeader.slice("Bearer ".length).trim();
  if (!userToken) {
    return deletePublishedPostJsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(userToken);

  if (userError || !user?.id) {
    return deletePublishedPostJsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;
  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return deletePublishedPostJsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validated = validateDeletePublishedPostRequest(body);
  if (!validated.ok) {
    return deletePublishedPostJsonResponse(
      { error: validated.error },
      validated.status,
    );
  }

  const { postId } = validated.data;

  const { data: postData, error: postLookupError } = await supabaseAdmin
    .from("posts")
    .select("id, author_id, type, status, caption")
    .eq("id", postId)
    .maybeSingle();

  if (postLookupError) {
    console.error(`${LOG_PREFIX} post lookup:`, postLookupError.message);
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      500,
    );
  }

  // Authenticated + post already gone → idempotent success (no existence leak nuance:
  // only returns after auth; does not reveal foreign posts' history beyond generic ok).
  if (!postData?.id) {
    console.info(`${LOG_PREFIX} alreadyGone postId=${postId}`);
    return deletePublishedPostJsonResponse(
      {
        ok: true,
        deleted: true,
        alreadyGone: true,
        postId,
        authorId: null,
      },
      200,
    );
  }

  const post = postData as PostDeleteRow;

  const isReviewer = await assertReportReviewer(supabaseAdmin, userId);
  const authz = canDeletePublishedPost(post, userId, isReviewer);
  if (!authz.ok) {
    return deletePublishedPostJsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: mediaRows, error: mediaError } = await supabaseAdmin
    .from("post_media")
    .select("id, bunny_video_id, kind, poster_url")
    .eq("post_id", postId);

  if (mediaError) {
    console.error(`${LOG_PREFIX} post_media lookup:`, mediaError.message);
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      500,
    );
  }

  // Best-effort Supabase poster cleanup — never blocks Bunny-first delete safety.
  for (const row of mediaRows ?? []) {
    const posterUrl =
      row && typeof row === "object"
        ? (row as { poster_url?: string | null }).poster_url
        : null;
    await deleteEchoTooMediaPosterBestEffort({
      supabaseUrl,
      serviceRoleKey,
      posterUrl,
      logPrefix: LOG_PREFIX,
    });
  }

  const videoIds = collectAttachedBunnyVideoIds(
    (mediaRows ?? []) as AttachedVideoMediaRow[],
  );

  console.info(
    `${LOG_PREFIX} stage=bunny postId=${postId} mode=${authz.mode} videoCount=${videoIds.length}`,
  );

  const bunnyResults: Array<{ ok: boolean; notFound?: boolean }> = [];
  for (const videoId of videoIds) {
    const result = await deleteBunnyVideo(bunnyLibraryId, bunnyApiKey, videoId);
    if (!result.ok) {
      console.error(
        `${LOG_PREFIX} stage=bunny_failed postId=${postId} category=hard_failure`,
      );
      return deletePublishedPostJsonResponse(
        { error: DELETE_PUBLISHED_POST_USER_ERROR },
        502,
      );
    }
    bunnyResults.push(result);
  }

  if (!bunnyDeletesAllowDbDelete(bunnyResults)) {
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      502,
    );
  }

  console.info(`${LOG_PREFIX} stage=db_delete postId=${postId} mode=${authz.mode}`);

  if (authz.mode === "admin") {
    const { data: rpcData, error: rpcError } = await supabaseUser.rpc(
      "admin_delete_post",
      { p_post_id: postId },
    );

    if (rpcError) {
      const msg = (rpcError.message || "").toLowerCase();
      // Retry after Bunny success + prior DB success.
      if (msg.includes("post not found")) {
        console.info(`${LOG_PREFIX} stage=db_already_gone postId=${postId}`);
        return deletePublishedPostJsonResponse(
          {
            ok: true,
            deleted: true,
            alreadyGone: true,
            postId,
            authorId: post.author_id,
          },
          200,
        );
      }
      console.error(`${LOG_PREFIX} admin_delete_post:`, rpcError.message);
      return deletePublishedPostJsonResponse(
        { error: DELETE_PUBLISHED_POST_USER_ERROR },
        500,
      );
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const authorId =
      row && typeof row === "object" && typeof (row as { author_id?: string }).author_id === "string"
        ? (row as { author_id: string }).author_id
        : post.author_id;

    console.info(`${LOG_PREFIX} stage=done postId=${postId} mode=admin`);
    return deletePublishedPostJsonResponse(
      {
        ok: true,
        deleted: true,
        postId,
        authorId,
      },
      200,
    );
  }

  // Owner path — RLS-backed delete as the authenticated user.
  const { error: deleteError } = await supabaseUser
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", userId);

  if (deleteError) {
    console.error(`${LOG_PREFIX} owner delete:`, deleteError.message);
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      500,
    );
  }

  // Confirm gone (retry-safe if a prior attempt removed the row after Bunny).
  const { data: stillThere, error: recheckError } = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (recheckError) {
    console.error(`${LOG_PREFIX} post recheck:`, recheckError.message);
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      500,
    );
  }

  if (stillThere?.id) {
    console.error(`${LOG_PREFIX} owner delete left post intact postId=${postId}`);
    return deletePublishedPostJsonResponse(
      { error: DELETE_PUBLISHED_POST_USER_ERROR },
      500,
    );
  }

  console.info(`${LOG_PREFIX} stage=done postId=${postId} mode=owner`);
  return deletePublishedPostJsonResponse(
    {
      ok: true,
      deleted: true,
      postId,
      authorId: post.author_id,
    },
    200,
  );
});
