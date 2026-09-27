/**
 * bunny-stream-webhook — V4A
 * Bunny Stream signed webhook → post_media.video_status (+ ready metadata).
 */
import { createServiceRoleClient } from "../_shared/push/edgeAuth.ts";
import { deleteEchoTooMediaPosterBestEffort } from "../_shared/echoTooMediaPosterCleanup.ts";
import { fetchBunnyVideoMetadata } from "./bunnyApi.ts";
import {
  LOG_PREFIX,
  mapBunnyStatusToPostMediaStatus,
  parseBunnyWebhookPayload,
  shouldApplyStatusUpdate,
  verifyBunnyWebhookSignature,
} from "./helpers.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bunnystream-signature, x-bunnystream-signature-algorithm, x-bunnystream-signature-version",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function okResponse(extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: true, ...extra }, 200);
}

type PostMediaRow = {
  id: string;
  video_status: string;
  poster_url?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bunnyApiKey = Deno.env.get("BUNNY_STREAM_API_KEY");
  const bunnyLibraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID");
  const bunnyReadOnlyApiKey = Deno.env.get("BUNNY_STREAM_READ_ONLY_API_KEY");

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !bunnyApiKey ||
    !bunnyLibraryId ||
    !bunnyReadOnlyApiKey
  ) {
    console.error(`${LOG_PREFIX} Missing server env`);
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const rawBody = await req.text();
  const versionHeader = req.headers.get("X-BunnyStream-Signature-Version");
  const algorithmHeader = req.headers.get("X-BunnyStream-Signature-Algorithm");
  const signatureHeader = req.headers.get("X-BunnyStream-Signature");

  const signatureValid = await verifyBunnyWebhookSignature({
    rawBody,
    versionHeader,
    algorithmHeader,
    signatureHeader,
    secret: bunnyReadOnlyApiKey,
  });

  if (!signatureValid) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  let parsedJson: unknown;
  try {
    parsedJson = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsedPayload = parseBunnyWebhookPayload(parsedJson);
  if (!parsedPayload.ok) {
    return jsonResponse({ error: parsedPayload.error }, 400);
  }

  const { videoGuid, status: bunnyStatus } = parsedPayload.payload;
  const mappedStatus = mapBunnyStatusToPostMediaStatus(bunnyStatus);

  if (!mappedStatus) {
    console.info(
      `${LOG_PREFIX} ignored status videoGuid=${videoGuid} bunnyStatus=${bunnyStatus}`,
    );
    return okResponse({ ignored: true });
  }

  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  const { data: row, error: lookupError } = await supabaseAdmin
    .from("post_media")
    .select("id, video_status, poster_url")
    .eq("bunny_video_id", videoGuid)
    .maybeSingle();

  if (lookupError) {
    console.error(`${LOG_PREFIX} post_media lookup:`, lookupError.message);
    return jsonResponse({ error: "Lookup failed" }, 500);
  }

  if (!row?.id) {
    console.info(`${LOG_PREFIX} unknown video videoGuid=${videoGuid}`);
    return okResponse({ unknownVideo: true });
  }

  const media = row as PostMediaRow;
  const previousPosterUrl =
    typeof media.poster_url === "string" ? media.poster_url : null;

  if (!shouldApplyStatusUpdate(media.video_status, mappedStatus)) {
    console.info(
      `${LOG_PREFIX} skipped regression videoGuid=${videoGuid} current=${media.video_status} next=${mappedStatus}`,
    );
    return okResponse({ skipped: true });
  }

  const patch: Record<string, unknown> = {
    video_status: mappedStatus,
  };

  if (mappedStatus === "failed") {
    const metadataResult = await fetchBunnyVideoMetadata(
      bunnyLibraryId,
      bunnyApiKey,
      videoGuid,
    );
    patch.failure_reason = metadataResult.ok &&
        metadataResult.metadata.failure_reason
      ? metadataResult.metadata.failure_reason
      : "Bunny encoding failed";
  } else {
    patch.failure_reason = null;
  }

  // Processing must never clear an immediate local poster.
  if (mappedStatus === "ready") {
    const metadataResult = await fetchBunnyVideoMetadata(
      bunnyLibraryId,
      bunnyApiKey,
      videoGuid,
    );

    if (metadataResult.ok) {
      const metadata = metadataResult.metadata;
      if (metadata.poster_url) patch.poster_url = metadata.poster_url;
      if (metadata.duration_sec != null) {
        patch.duration_sec = metadata.duration_sec;
      }
      if (metadata.width != null) patch.width = metadata.width;
      if (metadata.height != null) patch.height = metadata.height;
    } else {
      console.error(
        `${LOG_PREFIX} metadata fetch failed videoGuid=${videoGuid} mediaId=${media.id}`,
      );
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("post_media")
    .update(patch)
    .eq("id", media.id);

  if (updateError) {
    console.error(`${LOG_PREFIX} post_media update:`, updateError.message);
    return jsonResponse({ error: "Update failed" }, 500);
  }

  if (
    mappedStatus === "ready" &&
    typeof patch.poster_url === "string" &&
    patch.poster_url &&
    previousPosterUrl &&
    previousPosterUrl !== patch.poster_url
  ) {
    // Best-effort: webhook success must not fail on poster cleanup.
    await deleteEchoTooMediaPosterBestEffort({
      supabaseUrl,
      serviceRoleKey,
      posterUrl: previousPosterUrl,
      logPrefix: LOG_PREFIX,
    });
  }

  console.info(
    `${LOG_PREFIX} updated mediaId=${media.id} videoGuid=${videoGuid} bunnyStatus=${bunnyStatus} mapped=${mappedStatus}`,
  );

  return okResponse({ updated: true });
});
