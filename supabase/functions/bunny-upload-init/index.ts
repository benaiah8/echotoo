/**
 * bunny-upload-init — V2A (+ Edit staging)
 * Authenticated EchoToo user requests a Bunny Stream upload slot.
 * Create: publishPostId must not exist as posts.id → unattached post_media.
 * Edit staging: publishPostId is an existing post and the caller is either
 * the post AUTHOR or a report reviewer → creates/reuses UNATTACHED post_media
 * only (attached published rows untouched). owner_user_id = actor.
 * Returns short-lived TUS credentials. Does not modify attached media.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
} from "../_shared/push/edgeAuth.ts";
import {
  createBunnyVideo,
  deleteBunnyVideoBestEffort,
} from "./bunnyApi.ts";
import {
  ACTIVE_UNATTACHED_STATUSES,
  buildBunnyVideoTitle,
  buildMediaBucketPublicUrl,
  buildSuccessResponse,
  computeAuthorizationExpire,
  computeTusAuthorizationSignature,
  isActiveUnattachedCapExceeded,
  isPostMediaVideoStatus,
  isUniqueViolation,
  LOG_PREFIX,
  resolveExistingSlotAction,
  validatePosterStoragePath,
  validateUploadInitRequest,
  resolveOwnedPostUploadInitGate,
  VIDEO_SLOT_SORT_ORDER,
  type UploadInitSuccessBody,
  type PostMediaVideoStatus,
} from "./helpers.ts";

type PostMediaRow = {
  id: string;
  owner_user_id: string;
  bunny_video_id: string;
  video_status: string;
  poster_url?: string | null;
};

type PostRow = {
  id: string;
  author_id: string;
};

async function buildTusCredentials(
  libraryId: string,
  apiKey: string,
  bunnyVideoId: string,
): Promise<Pick<
  UploadInitSuccessBody,
  "authorizationExpire" | "authorizationSignature"
>> {
  const authorizationExpire = computeAuthorizationExpire();
  const authorizationSignature = await computeTusAuthorizationSignature(
    libraryId,
    apiKey,
    authorizationExpire,
    bunnyVideoId,
  );
  return { authorizationExpire, authorizationSignature };
}

async function respondWithExistingSlot(
  row: PostMediaRow,
  libraryId: string,
  apiKey: string,
  reused: boolean,
): Promise<Response> {
  if (!isPostMediaVideoStatus(row.video_status)) {
    console.error(
      `${LOG_PREFIX} invalid video_status mediaId=${row.id} status=${row.video_status}`,
    );
    return jsonResponse({ error: "Invalid media slot state" }, 500);
  }

  const action = resolveExistingSlotAction(row.video_status);
  if (action?.kind === "reuse_no_upload") {
    return respondWithExistingMediaNoUpload(row, libraryId, reused);
  }
  if (action?.kind === "reuse_upload") {
    return respondWithExistingMedia(row, libraryId, apiKey, reused);
  }

  return jsonResponse({ error: "video_slot_failed" }, 409);
}

async function respondWithExistingMedia(
  row: PostMediaRow,
  libraryId: string,
  apiKey: string,
  reused: boolean,
): Promise<Response> {
  const tus = await buildTusCredentials(libraryId, apiKey, row.bunny_video_id);
  return jsonResponse(
    buildSuccessResponse({
      mediaId: row.id,
      videoId: row.bunny_video_id,
      libraryId,
      videoStatus: row.video_status as PostMediaVideoStatus,
      reused,
      authorizationExpire: tus.authorizationExpire,
      authorizationSignature: tus.authorizationSignature,
    }),
    200,
  );
}

function respondWithExistingMediaNoUpload(
  row: PostMediaRow,
  libraryId: string,
  reused: boolean,
): Response {
  if (!isPostMediaVideoStatus(row.video_status)) {
    console.error(
      `${LOG_PREFIX} invalid video_status mediaId=${row.id} status=${row.video_status}`,
    );
    return jsonResponse({ error: "Invalid media slot state" }, 500);
  }

  return jsonResponse(
    buildSuccessResponse({
      mediaId: row.id,
      videoId: row.bunny_video_id,
      libraryId,
      videoStatus: row.video_status,
      reused,
    }),
    200,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization" }, 401);
  }

  const userToken = authHeader.slice("Bearer ".length).trim();
  if (!userToken) {
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(userToken);

  if (userError || !user?.id) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;
  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validated = validateUploadInitRequest(body);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, validated.status);
  }

  const { publishPostId, posterStoragePath: posterPathRaw } = validated.data;

  const posterValidated = validatePosterStoragePath(posterPathRaw, userId);
  if (!posterValidated.ok) {
    return jsonResponse(
      { error: posterValidated.error },
      posterValidated.status,
    );
  }
  const posterStoragePath = posterValidated.path;
  const posterPublicUrl = posterStoragePath
    ? buildMediaBucketPublicUrl(supabaseUrl, posterStoragePath)
    : null;

  const { data: postRow, error: postLookupError } = await supabaseAdmin
    .from("posts")
    .select("id, author_id")
    .eq("id", publishPostId)
    .maybeSingle();

  if (postLookupError) {
    console.error(`${LOG_PREFIX} posts lookup:`, postLookupError.message);
    return jsonResponse({ error: "Failed to validate publish post" }, 500);
  }

  const authorId = (postRow as PostRow | null)?.author_id ?? null;
  let actorIsReportReviewer = false;
  if (postRow?.id && authorId && authorId !== userId) {
    // Service-role lookup only — never trust client "admin" flags.
    const { data: reviewerRow, error: reviewerErr } = await supabaseAdmin
      .from("report_reviewers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (reviewerErr) {
      console.error(
        `${LOG_PREFIX} report_reviewers lookup:`,
        reviewerErr.message,
      );
      return jsonResponse({ error: "Failed to validate publish post" }, 500);
    }
    actorIsReportReviewer = Boolean(
      reviewerRow &&
        typeof (reviewerRow as { user_id?: string }).user_id === "string",
    );
  }

  const postGate = resolveOwnedPostUploadInitGate({
    postExists: Boolean(postRow?.id),
    authorId,
    actorUserId: userId,
    actorIsReportReviewer,
  });
  if (!postGate.ok) {
    return jsonResponse({ error: postGate.error }, postGate.status);
  }

  // Create: post must not exist. Edit staging: author or report reviewer →
  // unattached post_media only (attached published rows ignored by post_id IS NULL).
  if (postGate.mode === "edit_staging") {
    console.info(
      `${LOG_PREFIX} edit staging publishPostId=${publishPostId} userId=${userId}` +
        (actorIsReportReviewer ? " reviewer=1" : ""),
    );
  }

  const { data: slotRows, error: slotLookupError } = await supabaseAdmin
    .from("post_media")
    .select("id, owner_user_id, bunny_video_id, video_status, poster_url")
    .eq("publish_post_id", publishPostId)
    .is("post_id", null)
    .eq("sort_order", VIDEO_SLOT_SORT_ORDER);

  if (slotLookupError) {
    console.error(`${LOG_PREFIX} post_media slot lookup:`, slotLookupError.message);
    return jsonResponse({ error: "Failed to validate media slot" }, 500);
  }

  const slots = (slotRows ?? []) as PostMediaRow[];
  const foreignSlot = slots.find((row) => row.owner_user_id !== userId);
  if (foreignSlot) {
    return jsonResponse({ error: "Media slot conflict" }, 409);
  }

  const ownSlot = slots.find((row) => row.owner_user_id === userId);
  if (ownSlot) {
    const action = resolveExistingSlotAction(ownSlot.video_status);
    if (action?.kind === "reject_failed") {
      return jsonResponse({ error: "video_slot_failed" }, 409);
    }
    if (action?.kind === "reuse_upload" || action?.kind === "reuse_no_upload") {
      // Idempotent poster seed: only fill when currently null.
      if (
        posterPublicUrl &&
        (ownSlot.poster_url == null ||
          (typeof ownSlot.poster_url === "string" &&
            !ownSlot.poster_url.trim()))
      ) {
        const { error: posterSeedError } = await supabaseAdmin
          .from("post_media")
          .update({ poster_url: posterPublicUrl })
          .eq("id", ownSlot.id)
          .eq("owner_user_id", userId);
        if (posterSeedError) {
          console.warn(
            `${LOG_PREFIX} poster seed on reuse failed mediaId=${ownSlot.id}:`,
            posterSeedError.message,
          );
        }
      }
      console.info(
        `${LOG_PREFIX} reuse mediaId=${ownSlot.id} publishPostId=${publishPostId} videoId=${ownSlot.bunny_video_id} status=${ownSlot.video_status}`,
      );
      return respondWithExistingSlot(ownSlot, bunnyLibraryId, bunnyApiKey, true);
    }
  }

  const { count: activeCount, error: activeCountError } = await supabaseAdmin
    .from("post_media")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .is("post_id", null)
    .in("video_status", [...ACTIVE_UNATTACHED_STATUSES]);

  if (activeCountError) {
    console.error(`${LOG_PREFIX} active unattached count:`, activeCountError.message);
    return jsonResponse({ error: "Failed to validate upload quota" }, 500);
  }

  if (isActiveUnattachedCapExceeded(activeCount ?? 0)) {
    return jsonResponse({ error: "too_many_active_uploads" }, 429);
  }

  const bunnyTitle = buildBunnyVideoTitle(publishPostId);
  const bunnyCreate = await createBunnyVideo(
    bunnyLibraryId,
    bunnyApiKey,
    bunnyTitle,
  );

  if (!bunnyCreate.ok) {
    return jsonResponse({ error: "Failed to create video upload slot" }, 502);
  }

  const bunnyVideoId = bunnyCreate.guid;

  const { data: insertedRow, error: insertError } = await supabaseAdmin
    .from("post_media")
    .insert({
      publish_post_id: publishPostId,
      owner_user_id: userId,
      post_id: null,
      sort_order: VIDEO_SLOT_SORT_ORDER,
      kind: "video",
      bunny_video_id: bunnyVideoId,
      video_status: "pending",
      ...(posterPublicUrl ? { poster_url: posterPublicUrl } : {}),
    })
    .select("id, owner_user_id, bunny_video_id, video_status, poster_url")
    .single();

  if (insertError || !insertedRow?.id) {
    console.error(`${LOG_PREFIX} post_media insert:`, insertError?.message);

    const { data: canonicalRows, error: canonicalLookupError } =
      await supabaseAdmin
        .from("post_media")
        .select("id, owner_user_id, bunny_video_id, video_status")
        .eq("publish_post_id", publishPostId)
        .eq("owner_user_id", userId)
        .is("post_id", null)
        .eq("sort_order", VIDEO_SLOT_SORT_ORDER)
        .maybeSingle();

    if (!canonicalLookupError && canonicalRows?.id) {
      await deleteBunnyVideoBestEffort(
        bunnyLibraryId,
        bunnyApiKey,
        bunnyVideoId,
      );
      console.info(
        `${LOG_PREFIX} race resolved mediaId=${canonicalRows.id} publishPostId=${publishPostId}`,
      );
      return respondWithExistingSlot(
        canonicalRows as PostMediaRow,
        bunnyLibraryId,
        bunnyApiKey,
        true,
      );
    }

    if (isUniqueViolation(insertError)) {
      await deleteBunnyVideoBestEffort(
        bunnyLibraryId,
        bunnyApiKey,
        bunnyVideoId,
      );
      return jsonResponse({ error: "Media slot conflict" }, 409);
    }

    await deleteBunnyVideoBestEffort(bunnyLibraryId, bunnyApiKey, bunnyVideoId);
    return jsonResponse({ error: "Failed to reserve media slot" }, 500);
  }

  const media = insertedRow as PostMediaRow;
  console.info(
    `${LOG_PREFIX} created mediaId=${media.id} publishPostId=${publishPostId} videoId=${bunnyVideoId}`,
  );

  const tus = await buildTusCredentials(
    bunnyLibraryId,
    bunnyApiKey,
    bunnyVideoId,
  );

  return jsonResponse(
    buildSuccessResponse({
      mediaId: media.id,
      videoId: bunnyVideoId,
      libraryId: bunnyLibraryId,
      videoStatus: "pending",
      reused: false,
      authorizationExpire: tus.authorizationExpire,
      authorizationSignature: tus.authorizationSignature,
    }),
    200,
  );
});
