/**
 * edit-staging-gc — internal/service cron for abandoned Edit staging media.
 *
 * DRY-RUN by default (EDIT_STAGING_GC_DRY_RUN missing/ambiguous → no deletes).
 * Live mode requires explicit EDIT_STAGING_GC_DRY_RUN=false|0|off|no.
 *
 * Do NOT schedule or deploy to production without explicit approval.
 * Does NOT call user-facing bunny-video-delete.
 */
import {
  authorizeInternalPushRequest,
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
} from "../_shared/push/edgeAuth.ts";
import { deleteBunnyVideo } from "./bunnyApi.ts";
import {
  LOG_PREFIX,
  MAX_BATCH,
  isEditStagingGcDryRun,
  mapBunnyDeleteToOutcome,
  remainingClaimLimit,
  sanitizeGcError,
  shouldRetryOutboxRow,
  type OutboxRow,
} from "./helpers.ts";

type FinishOutcome =
  | "deleted"
  | "already_missing"
  | "retryable_failed"
  | "dead";

type Aggregate = {
  dryRun: boolean;
  scanned: number;
  claimed: number;
  bunny_deleted: number;
  already_missing: number;
  retryable_failed: number;
  finalized: number;
  dead: number;
};

async function finishItem(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  postMediaId: string,
  outcome: FinishOutcome,
  error?: string | null,
): Promise<void> {
  const { error: rpcError } = await supabaseAdmin.rpc(
    "finish_edit_staging_gc_item",
    {
      p_post_media_id: postMediaId,
      p_outcome: outcome,
      p_error: sanitizeGcError(error) ?? null,
    },
  );
  if (rpcError) {
    console.error(
      `${LOG_PREFIX} finish failed outcome=${outcome}:`,
      rpcError.message,
    );
  }
}

async function processBunnyDelete(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  libraryId: string,
  apiKey: string,
  row: Pick<OutboxRow, "post_media_id" | "bunny_video_id">,
  aggregate: Aggregate,
): Promise<void> {
  const bunny = await deleteBunnyVideo(
    libraryId,
    apiKey,
    row.bunny_video_id,
  );
  const outcome = mapBunnyDeleteToOutcome(bunny);

  if (outcome === "deleted") {
    aggregate.bunny_deleted += 1;
    await finishItem(supabaseAdmin, row.post_media_id, "deleted");
    aggregate.finalized += 1;
    return;
  }
  if (outcome === "already_missing") {
    aggregate.already_missing += 1;
    await finishItem(supabaseAdmin, row.post_media_id, "already_missing");
    aggregate.finalized += 1;
    return;
  }

  aggregate.retryable_failed += 1;
  await finishItem(
    supabaseAdmin,
    row.post_media_id,
    "retryable_failed",
    bunny.ok ? null : bunny.error,
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bunnyApiKey = Deno.env.get("BUNNY_STREAM_API_KEY");
  const bunnyLibraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID");
  const dryRun = isEditStagingGcDryRun(
    Deno.env.get("EDIT_STAGING_GC_DRY_RUN"),
  );

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG_PREFIX} Missing Supabase env`);
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  if (!authorizeInternalPushRequest(req, serviceRoleKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  const aggregate: Aggregate = {
    dryRun,
    scanned: 0,
    claimed: 0,
    bunny_deleted: 0,
    already_missing: 0,
    retryable_failed: 0,
    finalized: 0,
    dead: 0,
  };

  if (dryRun) {
    const { data, error } = await supabaseAdmin.rpc(
      "count_edit_staging_gc_candidates",
    );
    if (error) {
      console.error(`${LOG_PREFIX} dry-run count failed:`, error.message);
      return jsonResponse({ error: "Dry-run count failed" }, 500);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const count =
      row && typeof row === "object" && "candidate_count" in row
        ? Number((row as { candidate_count: unknown }).candidate_count)
        : Number(row);
    aggregate.scanned = Number.isFinite(count) ? count : 0;
    console.info(
      `${LOG_PREFIX} dry-run scanned=${aggregate.scanned} claimed=0 bunny_deleted=0`,
    );
    return jsonResponse({ ok: true, ...aggregate }, 200);
  }

  if (!bunnyApiKey?.trim() || !bunnyLibraryId?.trim()) {
    console.error(`${LOG_PREFIX} Missing Bunny env for live mode`);
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // 1) Retry pending outbox (previous claim, Bunny not yet done).
  const { data: pendingRows, error: pendingError } = await supabaseAdmin
    .from("edit_staging_gc_outbox")
    .select("post_media_id, bunny_video_id, attempt_count, status")
    .eq("status", "pending")
    .order("claimed_at", { ascending: true })
    .limit(MAX_BATCH);

  if (pendingError) {
    console.error(`${LOG_PREFIX} pending outbox load:`, pendingError.message);
    return jsonResponse({ error: "Failed to load outbox" }, 500);
  }

  const pending = ((pendingRows ?? []) as OutboxRow[]).filter((r) =>
    shouldRetryOutboxRow(r),
  );
  aggregate.scanned += pending.length;

  for (const row of pending) {
    await processBunnyDelete(
      supabaseAdmin,
      bunnyLibraryId,
      bunnyApiKey,
      row,
      aggregate,
    );
  }

  // 2) Claim new candidates within remaining batch budget.
  const claimLimit = remainingClaimLimit(MAX_BATCH, pending.length);
  if (claimLimit > 0) {
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
      "claim_edit_staging_gc_batch",
      { p_limit: claimLimit },
    );
    if (claimError) {
      console.error(`${LOG_PREFIX} claim failed:`, claimError.message);
      return jsonResponse({ error: "Claim failed", ...aggregate }, 500);
    }

    const claimedRows = (claimed ?? []) as Array<{
      post_media_id: string;
      bunny_video_id: string;
    }>;
    aggregate.claimed = claimedRows.length;
    aggregate.scanned += claimedRows.length;

    for (const row of claimedRows) {
      await processBunnyDelete(
        supabaseAdmin,
        bunnyLibraryId,
        bunnyApiKey,
        row,
        aggregate,
      );
    }
  }

  console.info(
    `${LOG_PREFIX} live scanned=${aggregate.scanned} claimed=${aggregate.claimed} ` +
      `bunny_deleted=${aggregate.bunny_deleted} already_missing=${aggregate.already_missing} ` +
      `retryable_failed=${aggregate.retryable_failed} finalized=${aggregate.finalized}`,
  );

  return jsonResponse({ ok: true, ...aggregate }, 200);
});
