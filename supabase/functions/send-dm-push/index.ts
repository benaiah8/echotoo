/**
 * send-dm-push — service/internal push for DM and group messages.
 * Does not insert notifications rows. Recipient unread is already updated in send_message RPC.
 *
 * Modes:
 * - Direct: POST { recipient_user_id, conversation_id, sender_user_id, body, ... }
 * - Drain outbox: POST { drain_outbox: true, limit?: number } (service role / internal secret)
 */
import { getFcmAccessToken } from "../_shared/push/fcm.ts";
import {
  authorizeInternalPushRequest,
  corsHeaders,
  createServiceRoleClient,
  jsonResponse,
  toPublicMediaAvatarUrl,
} from "../_shared/push/edgeAuth.ts";
import { buildDmFcmPayload } from "../_shared/push/payloadBuilders.ts";
import { loadPushDeviceTargets } from "../_shared/push/recipientDevices.ts";
import { sendPushToDeviceTargets, formatPushFailuresSummary } from "../_shared/push/sendPushToUsers.ts";

const LOG_PREFIX = "[send-dm-push]";
const DEFAULT_OUTBOX_LIMIT = 25;

type DirectBody = {
  recipient_user_id?: string;
  conversation_id?: string;
  sender_user_id?: string;
  body?: string;
  sender_name?: string;
  avatar_url?: string;
  conversation_kind?: string;
  group_name?: string;
  message_id?: string;
};

type DrainBody = {
  drain_outbox?: boolean;
  limit?: number;
};

type OutboxFinishStatus =
  | "sent"
  | "failed"
  | "skipped_no_tokens"
  | "skipped_muted"
  | "skipped_read";

type DmPushResult = {
  sent: number;
  skipped?: string;
  error?: string;
};

type ClaimedOutboxRow = {
  id: string;
  recipient_user_id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  sender_name: string | null;
  conversation_kind: string | null;
  group_name: string | null;
  message_id: string | null;
};

function mutePairKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`;
}

type MembershipPushSignals = {
  muted: Set<string>;
  alreadyRead: Set<string>;
};

/**
 * One bounded membership read for the claimed batch.
 * Lookup failure returns empty sets (fail open: do not skip mute or stale).
 */
async function loadMembershipPushSignals(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  rows: ClaimedOutboxRow[]
): Promise<MembershipPushSignals> {
  const muted = new Set<string>();
  const alreadyRead = new Set<string>();
  if (rows.length === 0) return { muted, alreadyRead };

  const conversationIds = [
    ...new Set(rows.map((r) => r.conversation_id).filter(Boolean)),
  ];
  const recipientIds = [
    ...new Set(rows.map((r) => r.recipient_user_id).filter(Boolean)),
  ];
  if (conversationIds.length === 0 || recipientIds.length === 0) {
    return { muted, alreadyRead };
  }

  const wanted = new Set(
    rows.map((r) => mutePairKey(r.conversation_id, r.recipient_user_id))
  );

  const { data, error } = await supabaseAdmin
    .from("conversation_members")
    .select("conversation_id,user_id,notifications_muted,unread_count")
    .in("conversation_id", conversationIds)
    .in("user_id", recipientIds);

  if (error) {
    console.error(`${LOG_PREFIX} membership batch lookup:`, error.message);
    return { muted, alreadyRead };
  }

  for (const row of data ?? []) {
    const conversationId = String(
      (row as { conversation_id?: string }).conversation_id ?? ""
    );
    const userId = String((row as { user_id?: string }).user_id ?? "");
    const key = mutePairKey(conversationId, userId);
    if (!wanted.has(key)) continue;

    if ((row as { notifications_muted?: boolean }).notifications_muted === true) {
      muted.add(key);
    }

    const unreadRaw = (row as { unread_count?: unknown }).unread_count;
    const unread =
      typeof unreadRaw === "number" && Number.isFinite(unreadRaw)
        ? unreadRaw
        : null;
    if (unread === 0) alreadyRead.add(key);
  }

  return { muted, alreadyRead };
}

async function isRecipientMuted(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  conversationId: string,
  recipientUserId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("conversation_members")
    .select("notifications_muted")
    .eq("conversation_id", conversationId)
    .eq("user_id", recipientUserId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} mute single lookup:`, error.message);
    return false;
  }
  return data?.notifications_muted === true;
}

async function sendDmPushForPayload(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  supabaseUrl: string,
  accessToken: string,
  projectId: string,
  input: {
    recipientUserId: string;
    conversationId: string;
    senderUserId: string;
    body: string;
    senderName?: string;
    avatarUrl?: string;
    conversationKind?: string;
    groupName?: string;
    messageId?: string;
  }
): Promise<DmPushResult> {
  const kind =
    input.conversationKind === "group" ? "group_message" : "dm_message";

  const deviceLoad = await loadPushDeviceTargets(
    supabaseAdmin,
    [input.recipientUserId],
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

  let senderName = input.senderName?.trim();
  let avatarUrl = input.avatarUrl;
  if (!senderName) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("user_id", input.senderUserId)
      .maybeSingle();
    senderName =
      (profile?.display_name as string | null)?.trim() ||
      (profile?.username as string | null)?.trim() ||
      "New message";
    if (!avatarUrl && profile?.avatar_url) {
      avatarUrl =
        toPublicMediaAvatarUrl(supabaseUrl, profile.avatar_url as string) ??
        undefined;
    }
  }

  const fcmData = buildDmFcmPayload({
    type: kind,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderUserId: input.senderUserId,
    body: input.body,
    senderName,
    avatarUrl,
    groupName: input.groupName,
  });

  const trayTitle =
    kind === "group_message" && input.groupName
      ? input.groupName
      : senderName ?? "New message";
  const trayBody = input.body.trim().slice(0, 200) || "New message";

  const batch = await sendPushToDeviceTargets({
    accessToken,
    projectId,
    targets: deviceLoad.targets,
    data: fcmData,
    logPrefix: LOG_PREFIX,
    fcmSendOptions: {
      androidDelivery: "notification_and_data",
      defaultNotification: { title: trayTitle, body: trayBody },
    },
  });

  if (batch.sent <= 0) {
    const failureHint =
      formatPushFailuresSummary(batch.failures, 3) ??
      "zero devices accepted push";
    return { sent: 0, error: failureHint };
  }

  return { sent: batch.sent };
}

async function finishOutboxRow(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  id: string,
  status: OutboxFinishStatus,
  devicesSent: number,
  lastError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("finish_dm_push_outbox_row", {
    p_id: id,
    p_status: status,
    p_devices_sent: devicesSent,
    p_last_error: lastError ?? null,
  });

  if (error) {
    console.error(`${LOG_PREFIX} finish outbox ${id}:`, error.message);
  }
}

async function drainOutbox(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  supabaseUrl: string,
  accessToken: string,
  projectId: string,
  limit: number
): Promise<Response> {
  const { data: rows, error } = await supabaseAdmin.rpc(
    "claim_dm_push_outbox_batch",
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
  let skippedMuted = 0;
  let skippedRead = 0;
  let failed = 0;

  const membership = await loadMembershipPushSignals(supabaseAdmin, claimed);

  for (const row of claimed) {
    const id = row.id as string;
    const pair = mutePairKey(
      row.conversation_id as string,
      row.recipient_user_id as string
    );

    if (membership.muted.has(pair)) {
      await finishOutboxRow(supabaseAdmin, id, "skipped_muted", 0);
      skippedMuted++;
      processed++;
      continue;
    }

    if (membership.alreadyRead.has(pair)) {
      await finishOutboxRow(supabaseAdmin, id, "skipped_read", 0);
      skippedRead++;
      processed++;
      continue;
    }

    const result = await sendDmPushForPayload(
      supabaseAdmin,
      supabaseUrl,
      accessToken,
      projectId,
      {
        recipientUserId: row.recipient_user_id as string,
        conversationId: row.conversation_id as string,
        senderUserId: row.sender_user_id as string,
        body: row.body as string,
        senderName: (row.sender_name as string | null) ?? undefined,
        conversationKind: (row.conversation_kind as string | null) ?? undefined,
        groupName: (row.group_name as string | null) ?? undefined,
        messageId: (row.message_id as string | null) ?? undefined,
      }
    );

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
      skippedMuted,
      skippedRead,
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

  let body: DirectBody & DrainBody;
  try {
    body = (await req.json()) as DirectBody & DrainBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
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

  if (body.drain_outbox === true) {
    const limit = Math.min(
      Math.max(Number(body.limit) || DEFAULT_OUTBOX_LIMIT, 1),
      100
    );
    return drainOutbox(
      supabaseAdmin,
      supabaseUrl,
      accessToken,
      projectId,
      limit
    );
  }

  const recipientUserId = (body.recipient_user_id ?? "").trim();
  const conversationId = (body.conversation_id ?? "").trim();
  const senderUserId = (body.sender_user_id ?? "").trim();
  const messageBody = (body.body ?? "").trim();

  if (!recipientUserId || !conversationId || !senderUserId || !messageBody) {
    return jsonResponse(
      {
        error:
          "Missing recipient_user_id, conversation_id, sender_user_id, or body",
      },
      400
    );
  }

  if (await isRecipientMuted(supabaseAdmin, conversationId, recipientUserId)) {
    return jsonResponse(
      { ok: true, sent: 0, skipped: "muted" },
      200
    );
  }

  const result = await sendDmPushForPayload(
    supabaseAdmin,
    supabaseUrl,
    accessToken,
    projectId,
    {
      recipientUserId,
      conversationId,
      senderUserId,
      body: messageBody,
      senderName: body.sender_name,
      avatarUrl: body.avatar_url
        ? toPublicMediaAvatarUrl(supabaseUrl, body.avatar_url)
        : undefined,
      conversationKind: body.conversation_kind,
      groupName: body.group_name,
      messageId: (body.message_id ?? "").trim() || undefined,
    }
  );

  return jsonResponse({ ok: true, sent: result.sent, skipped: result.skipped, error: result.error }, 200);
});
