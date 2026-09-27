/**
 * send-open-plan-request-push — service/internal push for new Open Plan requests.
 * Does not insert notifications rows. Drain-only (outbox claimed via RPC).
 *
 * Mode: POST { drain_outbox: true, limit?: number }
 */
import { getFcmAccessToken } from "../_shared/push/fcm.ts";
import {
  authorizeInternalPushRequest,
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
} from "../_shared/push/edgeAuth.ts";
import { buildOpenPlanRequestFcmPayload } from "../_shared/push/payloadBuilders.ts";
import { loadPushDeviceTargets } from "../_shared/push/recipientDevices.ts";
import {
  sendPushToDeviceTargets,
  formatPushFailuresSummary,
} from "../_shared/push/sendPushToUsers.ts";

const LOG_PREFIX = "[send-open-plan-request-push]";
const DEFAULT_OUTBOX_LIMIT = 25;

type DrainBody = {
  drain_outbox?: boolean;
  limit?: number;
};

type OutboxFinishStatus = "sent" | "failed" | "skipped_no_tokens" | "pending";

type ClaimedOutboxRow = {
  id: string;
  recipient_user_id: string;
  request_id: string;
  opportunity_id: string;
  source_post_id: string;
  body: string;
};

async function finishOutboxRow(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  id: string,
  status: OutboxFinishStatus,
  devicesSent: number,
  lastError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    "finish_open_plan_request_push_outbox_row",
    {
      p_id: id,
      p_status: status,
      p_devices_sent: devicesSent,
      p_last_error: lastError ?? null,
    }
  );

  if (error) {
    console.error(`${LOG_PREFIX} finish outbox ${id}:`, error.message);
  }
}

async function sendOpenPlanRequestPush(options: {
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>;
  accessToken: string;
  projectId: string;
  recipientUserId: string;
  requestId: string;
  opportunityId: string;
  sourcePostId?: string;
  body: string;
}): Promise<{ sent: number; skipped?: string; error?: string }> {
  const deviceLoad = await loadPushDeviceTargets(
    options.supabaseAdmin,
    [options.recipientUserId],
    { logPrefix: LOG_PREFIX, platforms: ["android", "ios"] }
  );

  if (!deviceLoad.ok) {
    return {
      sent: 0,
      error: deviceLoad.message ?? deviceLoad.skipped ?? "device_load_failed",
    };
  }
  if (deviceLoad.targets.length === 0) {
    return { sent: 0, skipped: "no_push_tokens" };
  }

  const data = buildOpenPlanRequestFcmPayload({
    requestId: options.requestId,
    opportunityId: options.opportunityId,
    sourcePostId: options.sourcePostId,
    body: options.body,
  });

  const batch = await sendPushToDeviceTargets({
    accessToken: options.accessToken,
    projectId: options.projectId,
    targets: deviceLoad.targets,
    data,
    logPrefix: LOG_PREFIX,
    fcmSendOptions: {
      androidDelivery: "notification_and_data",
      defaultNotification: {
        title: data.title ?? "Open Plan",
        body: data.body ?? "Someone is interested in your open plan.",
      },
    },
  });

  if (batch.sent > 0) {
    return { sent: batch.sent };
  }

  return {
    sent: 0,
    error:
      formatPushFailuresSummary(batch.failures) ?? "push delivery failed",
  };
}

async function drainOutbox(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  accessToken: string,
  projectId: string,
  limit: number
): Promise<Response> {
  const { data: rows, error } = await supabaseAdmin.rpc(
    "claim_open_plan_request_push_outbox_batch",
    { p_limit: limit }
  );

  if (error) {
    console.error(`${LOG_PREFIX} claim outbox:`, error.message);
    return jsonResponse({ error: error.message }, 500);
  }

  const claimed = (rows ?? []) as ClaimedOutboxRow[];
  let processed = 0;
  let sentTotal = 0;
  let skippedNoTokens = 0;
  let failed = 0;

  for (const row of claimed) {
    const id = row.id;
    const result = await sendOpenPlanRequestPush({
      supabaseAdmin,
      accessToken,
      projectId,
      recipientUserId: row.recipient_user_id,
      requestId: row.request_id,
      opportunityId: row.opportunity_id,
      sourcePostId: row.source_post_id,
      body: row.body,
    });

    processed++;

    if (result.skipped === "no_push_tokens") {
      await finishOutboxRow(supabaseAdmin, id, "skipped_no_tokens", 0);
      skippedNoTokens++;
      continue;
    }

    if (result.sent > 0) {
      await finishOutboxRow(supabaseAdmin, id, "sent", result.sent);
      sentTotal += result.sent;
      continue;
    }

    await finishOutboxRow(
      supabaseAdmin,
      id,
      "failed",
      0,
      result.error ?? "push delivery failed"
    );
    failed++;
  }

  return jsonResponse(
    {
      ok: true,
      claimed: claimed.length,
      processed,
      sentTotal,
      skippedNoTokens,
      failed,
    },
    200
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
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  if (!serviceAccountJson?.trim()) {
    return jsonResponse({ error: "Push not configured on server" }, 503);
  }
  if (!authorizeInternalPushRequest(req, serviceRoleKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: DrainBody;
  try {
    body = (await req.json()) as DrainBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (body.drain_outbox !== true) {
    return jsonResponse(
      { error: "drain_outbox required" },
      400
    );
  }

  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  let accessToken: string;
  let projectId: string;
  try {
    const t = await getFcmAccessToken(serviceAccountJson);
    accessToken = t.accessToken;
    projectId = t.projectId;
  } catch (e) {
    console.error(`${LOG_PREFIX} FCM auth:`, e);
    return jsonResponse({ error: "Failed to authorize FCM" }, 500);
  }

  const limit = Math.min(
    Math.max(Number(body.limit) || DEFAULT_OUTBOX_LIMIT, 1),
    100
  );
  return drainOutbox(supabaseAdmin, accessToken, projectId, limit);
});
