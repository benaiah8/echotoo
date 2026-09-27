/**
 * send-admin-campaign-push — reviewer-gated broadcast (push-only MVP).
 * Does not insert notifications rows.
 * Actual send requires reviewer gate + successful audit row insert before push.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getFcmAccessToken } from "../_shared/push/fcm.ts";
import {
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
} from "../_shared/push/edgeAuth.ts";
import { buildAdminCampaignFcmPayload } from "../_shared/push/payloadBuilders.ts";
import { loadPushDeviceTargets } from "../_shared/push/recipientDevices.ts";
import {
  formatPushFailuresSummary,
  sendPushToDeviceTargets,
} from "../_shared/push/sendPushToUsers.ts";

const LOG_PREFIX = "[send-admin-campaign-push]";
const MAX_RECIPIENTS = 500;
const MAX_BODY_LEN = 200;
const MAX_TITLE_LEN = 120;
const DEFAULT_CAMPAIGN_BODY = "Check this out on EchoToo";
const DUPLICATE_COOLDOWN_MS = 10 * 60 * 1000;
const DEVICE_PAGE_SIZE = 1000;

type CampaignBody = {
  title?: string;
  body?: string;
  post_id?: string;
  post_type?: string;
  target_path?: string;
  recipient_user_ids?: string[];
  dry_run?: boolean;
};

type PostType = "hangout" | "experience";

type CampaignDestination =
  | { kind: "post"; postId: string; postType: PostType; captionExcerpt?: string }
  | { kind: "path"; targetPath: string };

function excerptPushText(raw: unknown, max: number): string | undefined {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!t) return undefined;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function sanitizeInternalTargetPath(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  if (!t.startsWith("/")) return null;
  if (t.startsWith("//")) return null;
  if (/^https?:\/\//i.test(t)) return null;
  return t;
}

function parsePostType(raw: unknown): PostType | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "hangout" || t === "experience") return t;
  return null;
}

function uniqueNonEmptyIds(values: unknown[] | null | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    ),
  ];
}

async function resolveDestination(
  supabaseAdmin: SupabaseClient,
  body: CampaignBody
): Promise<
  { ok: true; destination: CampaignDestination } | { ok: false; error: string; status: number }
> {
  const postId = (body.post_id ?? "").trim();
  if (postId) {
    const { data: post, error: postErr } = await supabaseAdmin
      .from("posts")
      .select("id, type, status, caption")
      .eq("id", postId)
      .maybeSingle();

    if (postErr) {
      console.error(`${LOG_PREFIX} posts lookup:`, postErr.message);
      return { ok: false, error: "Failed to load post", status: 500 };
    }
    if (!post?.id) {
      return { ok: false, error: "post_not_found", status: 404 };
    }
    if ((post.status ?? "").trim() !== "published") {
      return { ok: false, error: "post_not_published", status: 400 };
    }
    const postType = parsePostType(post.type);
    if (!postType) {
      return { ok: false, error: "invalid_post_type", status: 400 };
    }
    return {
      ok: true,
      destination: {
        kind: "post",
        postId: post.id as string,
        postType,
        captionExcerpt: excerptPushText(post.caption, MAX_BODY_LEN),
      },
    };
  }

  const targetPath = sanitizeInternalTargetPath(body.target_path);
  if (!targetPath) {
    return {
      ok: false,
      error: "missing_routable_destination",
      status: 400,
    };
  }
  return { ok: true, destination: { kind: "path", targetPath } };
}

async function loadDefaultAudience(
  supabaseAdmin: SupabaseClient
): Promise<
  | { ok: true; recipientIds: string[]; deviceCount: number; capped: boolean }
  | { ok: false; error: string }
> {
  const rows: { user_id: string | null }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("push_devices")
      .select("user_id")
      .in("platform", ["android", "ios"])
      .range(from, from + DEVICE_PAGE_SIZE - 1);

    if (error) {
      return { ok: false, error: error.message };
    }

    const batch = (data ?? []) as { user_id: string | null }[];
    rows.push(...batch);
    if (batch.length < DEVICE_PAGE_SIZE) break;
    from += DEVICE_PAGE_SIZE;
  }

  const recipientIds = uniqueNonEmptyIds(rows.map((row) => row.user_id));
  return {
    ok: true,
    recipientIds,
    deviceCount: rows.filter((row) => typeof row.user_id === "string" && row.user_id.length > 0)
      .length,
    capped: recipientIds.length > MAX_RECIPIENTS,
  };
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
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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
    return jsonResponse({ error: "Invalid session" }, 401);
  }

  const reviewerUserId = user.id;
  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);
  const { data: reviewerRow, error: reviewerErr } = await supabaseAdmin
    .from("report_reviewers")
    .select("user_id")
    .eq("user_id", reviewerUserId)
    .maybeSingle();

  if (reviewerErr) {
    console.error(`${LOG_PREFIX} report_reviewers:`, reviewerErr.message);
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  if (!reviewerRow?.user_id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  let body: CampaignBody;
  try {
    body = (await req.json()) as CampaignBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const resolved = await resolveDestination(supabaseAdmin, body);
  if (!resolved.ok) {
    return jsonResponse({ error: resolved.error }, resolved.status);
  }

  const destination = resolved.destination;
  const postId = destination.kind === "post" ? destination.postId : undefined;
  const postType = destination.kind === "post" ? destination.postType : undefined;
  const targetPath = destination.kind === "path" ? destination.targetPath : undefined;
  const captionExcerpt =
    destination.kind === "post" ? destination.captionExcerpt : undefined;
  const title =
    excerptPushText(body.title, MAX_TITLE_LEN) ?? "EchoToo";
  const messageBody =
    excerptPushText(body.body, MAX_BODY_LEN) ??
    captionExcerpt ??
    DEFAULT_CAMPAIGN_BODY;

  let recipientIds: string[] = [];
  let deviceCount = 0;
  let capped = false;

  if (body.recipient_user_ids?.length) {
    recipientIds = uniqueNonEmptyIds(body.recipient_user_ids);
    capped = recipientIds.length > MAX_RECIPIENTS;
    if (!capped && recipientIds.length > 0) {
      const deviceLoad = await loadPushDeviceTargets(supabaseAdmin, recipientIds, {
        logPrefix: LOG_PREFIX,
        platforms: ["android", "ios"],
      });
      if (!deviceLoad.ok) {
        return jsonResponse(
          { error: deviceLoad.message ?? deviceLoad.skipped ?? "device_load_failed" },
          500
        );
      }
      deviceCount = deviceLoad.targets.length;
    }
  } else {
    const audience = await loadDefaultAudience(supabaseAdmin);
    if (!audience.ok) {
      return jsonResponse({ error: audience.error }, 500);
    }
    recipientIds = audience.recipientIds;
    deviceCount = audience.deviceCount;
    capped = audience.capped;
  }

  if (!capped && recipientIds.length > 0 && body.dry_run === true && !body.recipient_user_ids?.length) {
    const deviceLoad = await loadPushDeviceTargets(supabaseAdmin, recipientIds, {
      logPrefix: LOG_PREFIX,
      platforms: ["android", "ios"],
    });
    if (!deviceLoad.ok) {
      return jsonResponse(
        { error: deviceLoad.message ?? deviceLoad.skipped ?? "device_load_failed" },
        500
      );
    }
    deviceCount = deviceLoad.targets.length;
  }

  const preview = {
    ok: true,
    dry_run: true,
    recipientCount: recipientIds.length,
    deviceCount,
    capped,
    postId: postId ?? null,
    postType: postType ?? null,
    title,
    bodyPreview: messageBody.slice(0, 120),
    maxRecipients: MAX_RECIPIENTS,
  };

  if (body.dry_run === true) {
    return jsonResponse(preview, 200);
  }

  if (capped) {
    return jsonResponse(
      {
        error: "too_many_recipients",
        skipped: "too_many_recipients",
        capped: true,
        recipientCount: recipientIds.length,
        deviceCount,
        maxRecipients: MAX_RECIPIENTS,
      },
      409
    );
  }

  if (recipientIds.length === 0) {
    return jsonResponse(
      { ok: true, sent: 0, skipped: "no_recipients", recipientCount: 0, deviceCount: 0 },
      200
    );
  }

  if (postId) {
    const sinceIso = new Date(Date.now() - DUPLICATE_COOLDOWN_MS).toISOString();
    const { data: recentRows, error: cooldownErr } = await supabaseAdmin
      .from("admin_campaign_sent")
      .select("id")
      .eq("sent_by_user_id", reviewerUserId)
      .eq("post_id", postId)
      .gte("created_at", sinceIso)
      .limit(1);

    if (cooldownErr) {
      console.error(`${LOG_PREFIX} cooldown lookup:`, cooldownErr.message);
      return jsonResponse({ error: "Campaign cooldown check failed" }, 500);
    }
    if (recentRows && recentRows.length > 0) {
      return jsonResponse(
        {
          error: "campaign_cooldown",
          skipped: "cooldown",
          postId,
          cooldownMinutes: DUPLICATE_COOLDOWN_MS / 60000,
        },
        429
      );
    }
  }

  if (!serviceAccountJson?.trim()) {
    return jsonResponse({ error: "Push not configured on server" }, 503);
  }

  const { data: auditRow, error: auditInsertErr } = await supabaseAdmin
    .from("admin_campaign_sent")
    .insert({
      sent_by_user_id: reviewerUserId,
      title,
      body: messageBody,
      recipient_count: recipientIds.length,
      devices_sent: 0,
      post_id: postId ?? null,
      post_type: postType ?? null,
      target_path: targetPath ?? null,
    })
    .select("id")
    .single();

  if (auditInsertErr || !auditRow?.id) {
    console.error(`${LOG_PREFIX} audit insert:`, auditInsertErr?.message);
    return jsonResponse(
      {
        error: "Campaign audit log unavailable; push not sent",
        detail: auditInsertErr?.message,
      },
      503
    );
  }

  const deviceLoad = await loadPushDeviceTargets(supabaseAdmin, recipientIds, {
    logPrefix: LOG_PREFIX,
    platforms: ["android", "ios"],
  });

  if (!deviceLoad.ok) {
    await supabaseAdmin
      .from("admin_campaign_sent")
      .update({
        last_error: deviceLoad.message ?? deviceLoad.skipped ?? "device_load_failed",
      })
      .eq("id", auditRow.id);

    return jsonResponse(
      { ok: true, sent: 0, skipped: deviceLoad.skipped, message: deviceLoad.message },
      200
    );
  }

  if (deviceLoad.targets.length === 0) {
    await supabaseAdmin
      .from("admin_campaign_sent")
      .update({ last_error: "no_push_tokens" })
      .eq("id", auditRow.id);

    return jsonResponse(
      { ok: true, sent: 0, skipped: "no_push_tokens" },
      200
    );
  }

  let accessToken: string;
  let projectId: string;
  try {
    const t = await getFcmAccessToken(serviceAccountJson);
    accessToken = t.accessToken;
    projectId = t.projectId;
  } catch (e) {
    console.error(`${LOG_PREFIX} FCM auth:`, e);
    await supabaseAdmin
      .from("admin_campaign_sent")
      .update({ last_error: "fcm_auth_failed" })
      .eq("id", auditRow.id);
    return jsonResponse({ error: "Failed to authorize FCM" }, 500);
  }

  const fcmData = buildAdminCampaignFcmPayload({
    title,
    body: messageBody,
    postId,
    postType,
    targetPath,
  });

  const batch = await sendPushToDeviceTargets({
    accessToken,
    projectId,
    targets: deviceLoad.targets,
    data: fcmData,
    logPrefix: LOG_PREFIX,
    fcmSendOptions: {
      androidDelivery: "notification_and_data",
      defaultNotification: { title, body: messageBody },
    },
  });

  const lastError =
    formatPushFailuresSummary(batch.failures, 3) ??
    (batch.sent <= 0 ? "zero devices accepted push" : null);

  await supabaseAdmin
    .from("admin_campaign_sent")
    .update({
      devices_sent: batch.sent,
      last_error: lastError,
    })
    .eq("id", auditRow.id);

  return jsonResponse(
    {
      ok: true,
      sent: batch.sent,
      attempted: deviceLoad.targets.length,
      recipientCount: recipientIds.length,
      deviceCount: deviceLoad.targets.length,
      capped: false,
      postId: postId ?? null,
      postType: postType ?? null,
      auditId: auditRow.id,
      failures: batch.failures.length > 0 ? batch.failures : undefined,
    },
    200
  );
});
