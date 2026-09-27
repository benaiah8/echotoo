/**
 * send-saved-event-reminders — service/internal cron endpoint.
 * Push-only (no notifications row). Idempotent via saved_event_reminder_sent + claim RPC.
 *
 * MVP schedule: remind on calendar day before next hangout occurrence (UTC date match).
 * Requires: saved_posts + published hangout with selected_dates.
 * pg_cron must stay disabled until manually enabled in Dashboard after QA.
 */
import { getFcmAccessToken } from "../_shared/push/fcm.ts";
import {
  authorizeInternalPushRequest,
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
} from "../_shared/push/edgeAuth.ts";
import { buildEventReminderFcmPayload } from "../_shared/push/payloadBuilders.ts";
import { loadPushDeviceTargets } from "../_shared/push/recipientDevices.ts";
import { sendPushToDeviceTargets, formatPushFailuresSummary } from "../_shared/push/sendPushToUsers.ts";

const LOG_PREFIX = "[send-saved-event-reminders]";
const REMINDER_KIND = "day_before";
const MAX_BATCH = 200;

type SavedCandidate = {
  user_id: string;
  post_id: string;
  post_type: string;
  caption: string | null;
  occurrence_date: string;
};

type ReminderFinishStatus = "sent" | "failed" | "skipped_no_tokens";

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateString(d);
}

function nextOccurrenceOnOrAfter(
  selectedDates: string[] | null | undefined,
  fromDate: string
): string | null {
  if (!selectedDates?.length) return null;
  const sorted = [...selectedDates]
    .map((s) => (typeof s === "string" ? s.slice(0, 10) : ""))
    .filter(Boolean)
    .sort();
  for (const d of sorted) {
    if (d >= fromDate) return d;
  }
  return null;
}

function buildReminderBody(
  caption: string | null | undefined,
  occurrenceDate: string
): string {
  const cap = (caption ?? "").replace(/\s+/g, " ").trim();
  if (cap) {
    return `${cap} — tomorrow (${occurrenceDate})`;
  }
  return `Your saved event is tomorrow (${occurrenceDate})`;
}

async function finishReminderRow(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  id: string,
  status: ReminderFinishStatus,
  devicesSent: number,
  lastError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("finish_saved_event_reminder", {
    p_id: id,
    p_status: status,
    p_devices_sent: devicesSent,
    p_last_error: lastError ?? null,
  });

  if (error) {
    console.error(`${LOG_PREFIX} finish reminder ${id}:`, error.message);
  }
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

  const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

  const today = utcDateString(new Date());
  const targetOccurrence = addUtcDays(today, 1);

  const { data: saves, error: savesError } = await supabaseAdmin
    .from("saved_posts")
    .select("user_id, post_id, posts!inner(id, type, caption, status, selected_dates)")
    .limit(MAX_BATCH);

  if (savesError) {
    console.error(`${LOG_PREFIX} saved_posts:`, savesError.message);
    return jsonResponse({ error: savesError.message }, 500);
  }

  const candidates: SavedCandidate[] = [];

  for (const row of saves ?? []) {
    const post = row.posts as {
      id?: string;
      type?: string;
      caption?: string | null;
      status?: string;
      selected_dates?: string[] | null;
    } | null;
    if (!post?.id || post.status !== "published") continue;
    if (post.type !== "hangout") continue;

    const next = nextOccurrenceOnOrAfter(post.selected_dates, today);
    if (!next || next !== targetOccurrence) continue;

    candidates.push({
      user_id: row.user_id as string,
      post_id: post.id,
      post_type: post.type,
      caption: post.caption ?? null,
      occurrence_date: next,
    });
  }

  if (candidates.length === 0) {
    return jsonResponse(
      {
        ok: true,
        sent: 0,
        candidates: 0,
        message: "No reminders due",
        targetOccurrence,
      },
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
    return jsonResponse({ error: "Failed to authorize FCM" }, 500);
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedNoTokens = 0;
  let failed = 0;

  for (const c of candidates) {
    const { data: claimId, error: claimErr } = await supabaseAdmin.rpc(
      "claim_saved_event_reminder",
      {
        p_user_id: c.user_id,
        p_post_id: c.post_id,
        p_occurrence_date: c.occurrence_date,
        p_reminder_kind: REMINDER_KIND,
      }
    );

    if (claimErr) {
      console.error(`${LOG_PREFIX} claim:`, claimErr.message);
      failed++;
      continue;
    }

    if (!claimId) {
      skippedAlreadySent++;
      continue;
    }

    const reminderId = claimId as string;

    const { data: stillSaved } = await supabaseAdmin
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", c.user_id)
      .eq("post_id", c.post_id)
      .maybeSingle();

    if (!stillSaved?.post_id) {
      await finishReminderRow(
        supabaseAdmin,
        reminderId,
        "skipped_no_tokens",
        0,
        "post no longer saved"
      );
      skippedNoTokens++;
      continue;
    }

    const deviceLoad = await loadPushDeviceTargets(
      supabaseAdmin,
      [c.user_id],
      { logPrefix: LOG_PREFIX, platforms: ["android", "ios"] }
    );

    if (!deviceLoad.ok) {
      await finishReminderRow(
        supabaseAdmin,
        reminderId,
        "failed",
        0,
        deviceLoad.message ?? deviceLoad.skipped ?? "device_load_failed"
      );
      failed++;
      continue;
    }

    if (deviceLoad.targets.length === 0) {
      await finishReminderRow(
        supabaseAdmin,
        reminderId,
        "skipped_no_tokens",
        0,
        "no_push_tokens"
      );
      skippedNoTokens++;
      continue;
    }

    const body = buildReminderBody(c.caption, c.occurrence_date);
    const fcmData = buildEventReminderFcmPayload({
      postId: c.post_id,
      postType: c.post_type,
      body,
      occurrenceDate: c.occurrence_date,
    });

    const batch = await sendPushToDeviceTargets({
      accessToken,
      projectId,
      targets: deviceLoad.targets,
      data: fcmData,
      logPrefix: LOG_PREFIX,
      fcmSendOptions: {
        androidDelivery: "notification_and_data",
        defaultNotification: {
          title: "Event reminder",
          body,
        },
      },
    });

    if (batch.sent > 0) {
      await finishReminderRow(supabaseAdmin, reminderId, "sent", batch.sent);
      sent += batch.sent;
      continue;
    }

    const failureHint =
      formatPushFailuresSummary(batch.failures, 3) ??
      "zero devices accepted push";
    await finishReminderRow(
      supabaseAdmin,
      reminderId,
      "failed",
      0,
      failureHint
    );
    failed++;
  }

  return jsonResponse(
    {
      ok: true,
      targetOccurrence,
      candidates: candidates.length,
      sent,
      skippedAlreadySent,
      skippedNoTokens,
      failed,
    },
    200
  );
});
