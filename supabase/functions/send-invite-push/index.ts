/**
 * send-invite-push — v1
 * Authenticated: caller must be the inviter (actor_id). Post must exist; post_type must match.
 * Sends one FCM message per Android/iOS device token for the given invitee auth user ids.
 * Tap payload: postId + postType (same contract as send-post-push); optional inviteId when
 * a single invite row is implied (from request body only).
 * Notification: title "{displayName} invited you" (personal / unknown thread_kind) or
 * "{displayName} invited you to a group" when thread_kind is group; DM-style body — note-first when present,
 * optional caption preview line (server-fetched, capped); fallback "Tap to view invite".
 * No `android.notification.image` (avoids large expanded image; sender avatar needs native later).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getFcmAccessToken,
  sendFcmToDevice,
  type PushDevicePlatform,
} from "./fcm.ts";

/** Keep in sync with `INVITE_NOTE_MAX_LENGTH` in `src/api/services/invites.ts`. */
const INVITE_NOTE_MAX_LENGTH = 200;

/** Post caption preview for push when invite note is absent (or second line when note exists). */
const CAPTION_PREVIEW_MAX_LENGTH = 200;

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
  thread_id?: string;
  thread_kind?: string;
  target?: string;
};

type PushDeviceTarget = {
  token: string;
  platform: PushDevicePlatform;
};

function isPushDevicePlatform(value: unknown): value is PushDevicePlatform {
  return value === "android" || value === "ios";
}

function toPublicMediaAvatarUrl(
  supabaseUrl: string,
  avatarPath: string | null | undefined
): string | undefined {
  const raw = (avatarPath ?? "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("preset:")) return undefined;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) return undefined;
  try {
    const normalizedBase = supabaseUrl.replace(/\/+$/, "");
    const encodedPath = raw
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `${normalizedBase}/storage/v1/object/public/media/${encodedPath}`;
  } catch {
    return undefined;
  }
}

function trimAndCapNote(note: string | null | undefined): string {
  const t = (note ?? "").trim();
  if (!t) return "";
  return t.length > INVITE_NOTE_MAX_LENGTH
    ? t.slice(0, INVITE_NOTE_MAX_LENGTH)
    : t;
}

function trimAndCapCaptionPreview(caption: string | null | undefined): string {
  const t = (caption ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length > CAPTION_PREVIEW_MAX_LENGTH
    ? t.slice(0, CAPTION_PREVIEW_MAX_LENGTH)
    : t;
}

/**
 * DM-style notification body:
 * - note first when present
 * - blank line + "Post: {caption}" in expanded text when both note and caption exist
 * - caption only when note is absent
 * - fallback when both missing
 */
function buildInvitePushBody(noteLine: string, captionPreview: string): string {
  const hasNote = noteLine.length > 0;
  const hasCaption = captionPreview.length > 0;
  if (hasNote && hasCaption) {
    return `${noteLine}\n\n────────\nPost: ${captionPreview}`;
  }
  if (hasNote) return noteLine;
  if (hasCaption) return captionPreview;
  return "Tap to view invite";
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
  const threadId = body.thread_id?.trim();
  const threadKind = body.thread_kind?.trim();
  const targetRaw = body.target?.trim();
  const target =
    targetRaw === "invite_thread" || targetRaw === "notifications"
      ? targetRaw
      : threadId
        ? "invite_thread"
        : "notifications";
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
    .select("type, caption")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("[send-invite-push] post read:", postError.message);
    return jsonResponse(
      { ok: true, sent: 0, skipped: "post_read_failed", message: postError.message },
      200
    );
  }

  const pr = postRow as {
    type?: string | null;
    caption?: string | null;
  } | null;
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
    .in("platform", ["android", "ios"]);

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

  const targetByPlatformAndToken = new Map<string, PushDeviceTarget>();
  for (const row of deviceRows ?? []) {
    const token = ((row as { token?: string | null }).token ?? "").trim();
    const platform = (row as { platform?: unknown }).platform;
    if (!token || !isPushDevicePlatform(platform)) continue;
    targetByPlatformAndToken.set(`${platform}:${token}`, { token, platform });
  }
  const pushTargets = [...targetByPlatformAndToken.values()];

  if (pushTargets.length === 0) {
    return jsonResponse(
      {
        ok: true,
        sent: 0,
        skipped: "no_push_tokens",
        message: "No push device tokens for recipients",
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
  let avatarUrlForPush: string | undefined;
  const { data: inviterRow, error: inviterProfileError } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username, avatar_url")
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
      avatar_url?: string | null;
    } | null;
    const dn = ar?.display_name?.trim();
    const un = ar?.username?.trim();
    if (dn) displayName = dn;
    else if (un) displayName = un;
    avatarUrlForPush = toPublicMediaAvatarUrl(supabaseUrl, ar?.avatar_url);
  }

  const noteLine = await fetchInviteNoteForPush(supabaseAdmin, {
    postId,
    actorId,
    inviteId: inviteId || undefined,
    authRecipientIds: authIdList,
  });

  const captionPreview = trimAndCapCaptionPreview(pr?.caption ?? null);
  const bodyText = buildInvitePushBody(noteLine, captionPreview);

  const title =
    threadKind === "group"
      ? `${displayName} invited you to a group`
      : `${displayName} invited you`;

  const fcmDataPayload: {
    type: "invite";
    title: string;
    body: string;
    avatarUrl?: string;
    postId: string;
    postType: string;
    inviteId?: string;
    threadId?: string;
    threadKind?: string;
    actorId: string;
    target: "invite_thread" | "notifications";
  } = {
    type: "invite",
    title,
    body: bodyText,
    postId,
    postType,
    actorId,
    target,
  };
  if (avatarUrlForPush) {
    fcmDataPayload.avatarUrl = avatarUrlForPush;
  }
  if (inviteId) {
    fcmDataPayload.inviteId = inviteId;
  }
  if (threadId) {
    fcmDataPayload.threadId = threadId;
  }
  if (threadKind) {
    fcmDataPayload.threadKind = threadKind;
  }

  let sent = 0;
  const failures: { status: number; detail?: string }[] = [];

  for (const targetDevice of pushTargets) {
    const result = await sendFcmToDevice(
      accessToken,
      projectId,
      targetDevice.token,
      targetDevice.platform,
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
      attempted: pushTargets.length,
      failures: failures.length > 0 ? failures.slice(0, 5) : undefined,
    },
    200
  );
});
