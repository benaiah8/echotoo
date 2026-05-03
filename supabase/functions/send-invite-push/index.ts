/**
 * send-invite-push — v1
 * Authenticated: caller must be the inviter (actor_id). Post must exist; post_type must match.
 * Sends one FCM message per Android device token for the given invitee auth user ids.
 * Tap payload: postId + postType (same contract as send-post-push); optional inviteId when
 * a single invite row is implied (from request body only).
 * Notification body: title "New invite"; first line is the hangout/experience sentence; optional
 * second block (after newline) is invite `note` from DB, trimmed and capped at 200 chars.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getFcmAccessToken,
  sendFcmToDevice,
} from "./fcm.ts";

/** Keep in sync with `INVITE_NOTE_MAX_LENGTH` in `src/api/services/invites.ts`. */
const INVITE_NOTE_MAX_LENGTH = 200;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type InvitePushBody = {
  post_id?: string;
  post_type?: string;
  actor_id?: string;
  recipient_user_ids?: string[];
  invite_id?: string;
};

function trimAndCapNote(note: string | null | undefined): string {
  const t = (note ?? "").trim();
  if (!t) return "";
  return t.length > INVITE_NOTE_MAX_LENGTH
    ? t.slice(0, INVITE_NOTE_MAX_LENGTH)
    : t;
}

/**
 * Load optional invite note for push copy from `invites` (server truth; not request body).
 * Single recipient + invite_id: one row. Multi-recipient: any matching row (batch uses same note).
 */
async function fetchInviteNoteForPush(
  supabaseAdmin: ReturnType<typeof createClient>,
  args: {
    postId: string;
    actorId: string;
    inviteId: string | undefined;
    authRecipientIds: string[];
  }
): Promise<string> {
  if (args.inviteId) {
    const { data, error } = await supabaseAdmin
      .from("invites")
      .select("note")
      .eq("id", args.inviteId)
      .eq("inviter_id", args.actorId)
      .eq("post_id", args.postId)
      .maybeSingle();
    if (error) {
      console.error(
        "[send-invite-push] invite note (by id):",
        error.message
      );
      return "";
    }
    return trimAndCapNote((data as { note?: string | null } | null)?.note);
  }

  if (args.authRecipientIds.length === 0) return "";

  const { data, error } = await supabaseAdmin
    .from("invites")
    .select("note")
    .eq("post_id", args.postId)
    .eq("inviter_id", args.actorId)
    .in("invitee_id", args.authRecipientIds);
  if (error) {
    console.error(
      "[send-invite-push] invite note (batch):",
      error.message
    );
    return "";
  }
  for (const row of data ?? []) {
    const t = trimAndCapNote(
      (row as { note?: string | null }).note
    );
    if (t) return t;
  }
  return "";
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
    console.error("[send-invite-push] Missing Supabase env");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  if (!serviceAccountJson?.trim()) {
    console.error("[send-invite-push] FIREBASE_SERVICE_ACCOUNT_JSON not set");
    return jsonResponse({ error: "Push not configured on server" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Missing or invalid Authorization header" },
      401
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(token);

  if (userError || !user?.id) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: InvitePushBody;
  try {
    body = (await req.json()) as InvitePushBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const postId = body.post_id?.trim();
  const postType = body.post_type?.trim();
  const actorId = body.actor_id?.trim();
  const inviteId = body.invite_id?.trim();
  const recipientUserIds = Array.isArray(body.recipient_user_ids)
    ? body.recipient_user_ids.filter(
        (id) => typeof id === "string" && id.length > 0
      )
    : [];

  if (!postId || !postType || !actorId) {
    return jsonResponse(
      { error: "post_id, post_type, and actor_id are required" },
      400
    );
  }

  if (postType !== "hangout" && postType !== "experience") {
    return jsonResponse(
      { error: "post_type must be hangout or experience" },
      400
    );
  }

  if (actorId !== user.id) {
    return jsonResponse(
      { error: "Forbidden: actor_id must match caller" },
      403
    );
  }

  if (recipientUserIds.length === 0) {
    return jsonResponse(
      { error: "recipient_user_ids is required and must be non-empty" },
      400
    );
  }

  if (recipientUserIds.length > 1 && inviteId) {
    return jsonResponse(
      {
        error:
          "invite_id may only be set when there is a single recipient_user_ids entry",
      },
      400
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: postRow, error: postError } = await supabaseAdmin
    .from("posts")
    .select("type")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("[send-invite-push] post read:", postError.message);
    return jsonResponse(
      { ok: true, sent: 0, skipped: "post_read_failed", message: postError.message },
      200
    );
  }

  const pr = postRow as { type?: string | null } | null;
  if (!postRow || pr?.type == null) {
    return jsonResponse({ error: "Post not found" }, 404);
  }

  if (pr.type !== postType) {
    return jsonResponse(
      { error: "post_type does not match post" },
      400
    );
  }

  // notifications.user_id is auth; body may use profile ids — expand to auth for push_devices.
  const resolvedRecipientIds = [...new Set(recipientUserIds)];

  const authIdsForPush = new Set<string>(resolvedRecipientIds);
  const { data: profileRows, error: profileMapError } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .in("id", resolvedRecipientIds);

  if (profileMapError) {
    console.error("[send-invite-push] profiles map:", profileMapError.message);
    return jsonResponse(
      {
        ok: true,
        sent: 0,
        skipped: "profiles_map_failed",
        message: profileMapError.message,
      },
      200
    );
  }

  for (const row of profileRows ?? []) {
    const uid = row.user_id as string | null;
    if (uid) authIdsForPush.add(uid);
  }

  const authIdList = [...authIdsForPush];

  const { data: deviceRows, error: devicesError } = await supabaseAdmin
    .from("push_devices")
    .select("token, user_id, platform")
    .in("user_id", authIdList)
    .eq("platform", "android");

  if (devicesError) {
    console.error("[send-invite-push] push_devices:", devicesError.message);
    return jsonResponse(
      {
        ok: true,
        sent: 0,
        skipped: "push_devices_read_failed",
        message: devicesError.message,
      },
      200
    );
  }

  const tokens = [
    ...new Set(
      (deviceRows ?? [])
        .map((r) => (r.token ?? "").trim())
        .filter((t) => t.length > 0)
    ),
  ];

  if (tokens.length === 0) {
    return jsonResponse(
      {
        ok: true,
        sent: 0,
        skipped: "no_android_tokens",
        message: "No Android device tokens for recipients",
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
    console.error("[send-invite-push] FCM auth:", e);
    return jsonResponse({ error: "Failed to authorize FCM" }, 500);
  }

  let displayName = "Someone";
  const { data: inviterRow, error: inviterProfileError } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", actorId)
    .maybeSingle();
  if (inviterProfileError) {
    console.error(
      "[send-invite-push] inviter profile:",
      inviterProfileError.message
    );
  } else {
    const ar = inviterRow as {
      display_name?: string | null;
      username?: string | null;
    } | null;
    const dn = ar?.display_name?.trim();
    const un = ar?.username?.trim();
    if (dn) displayName = dn;
    else if (un) displayName = un;
  }

  const noteLine = await fetchInviteNoteForPush(supabaseAdmin, {
    postId,
    actorId,
    inviteId: inviteId || undefined,
    authRecipientIds: authIdList,
  });

  const baseBody =
    postType === "hangout"
      ? `${displayName} invited you to a hangout.`
      : `${displayName} invited you to an experience.`;
  const bodyText =
    noteLine.length > 0 ? `${baseBody}\n${noteLine}` : baseBody;

  const title = "New invite";

  const fcmDataPayload: {
    postId: string;
    postType: string;
    inviteId?: string;
  } = { postId, postType };
  if (inviteId) {
    fcmDataPayload.inviteId = inviteId;
  }

  let sent = 0;
  const failures: { status: number; detail?: string }[] = [];

  for (const deviceToken of tokens) {
    const result = await sendFcmToDevice(
      accessToken,
      projectId,
      deviceToken,
      { title, body: bodyText },
      fcmDataPayload
    );
    if (result.ok) {
      sent++;
    } else {
      failures.push({ status: result.status, detail: result.errorText });
    }
  }

  return jsonResponse(
    {
      ok: true,
      sent,
      attempted: tokens.length,
      failures: failures.length > 0 ? failures.slice(0, 5) : undefined,
    },
    200
  );
});
