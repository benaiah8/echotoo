/**
 * send-post-push — v1
 * Authenticated: caller must be the post author (actor_id).
 * Loads Android FCM tokens from public.push_devices and sends FCM HTTP v1 (one request per token).
 *
 * Recipients: either `recipient_user_ids` (auth and/or profile ids, legacy) or, when that array
 * is empty/omitted, service-role read of public.notifications (entity_id=post, type=post, actor_id).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getFcmAccessToken,
  sendFcmToDevice,
} from "./fcm.ts";

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

type PostPushBody = {
  post_id?: string;
  entity_type?: string;
  actor_id?: string;
  recipient_user_ids?: string[];
};

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
    console.error("[send-post-push] Missing Supabase env");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  if (!serviceAccountJson?.trim()) {
    console.error("[send-post-push] FIREBASE_SERVICE_ACCOUNT_JSON not set");
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

  let body: PostPushBody;
  try {
    body = (await req.json()) as PostPushBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const postId = body.post_id?.trim();
  const entityType = body.entity_type?.trim();
  const actorId = body.actor_id?.trim();
  const recipientUserIds = Array.isArray(body.recipient_user_ids)
    ? body.recipient_user_ids.filter((id) => typeof id === "string" && id.length > 0)
    : [];

  if (!postId || !entityType || !actorId) {
    return jsonResponse(
      { error: "post_id, entity_type, and actor_id are required" },
      400
    );
  }

  if (entityType !== "hangout" && entityType !== "experience") {
    return jsonResponse({ error: "entity_type must be hangout or experience" }, 400);
  }

  if (actorId !== user.id) {
    return jsonResponse({ error: "Forbidden: actor_id must match caller" }, 403);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let resolvedRecipientIds: string[];
  if (recipientUserIds.length > 0) {
    resolvedRecipientIds = recipientUserIds;
  } else {
    const { data: notifRows, error: notifErr } = await supabaseAdmin
      .from("notifications")
      .select("user_id")
      .eq("entity_id", postId)
      .eq("type", "post")
      .eq("actor_id", actorId);

    if (notifErr) {
      console.error("[send-post-push] notifications:", notifErr.message);
      return jsonResponse(
        {
          ok: true,
          sent: 0,
          skipped: "notifications_read_failed",
          message: notifErr.message,
        },
        200
      );
    }

    resolvedRecipientIds = [
      ...new Set(
        (notifRows ?? [])
          .map((r) => (r as { user_id: string | null }).user_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];

    if (resolvedRecipientIds.length === 0) {
      return jsonResponse(
        {
          ok: true,
          sent: 0,
          skipped: "no_notification_rows",
          message: "No matching notifications; fan-out may be empty or not committed yet",
        },
        200
      );
    }
  }

  // notifications.user_id is auth; legacy body may use profile ids — expand to auth for push_devices.
  const authIdsForPush = new Set<string>(resolvedRecipientIds);
  const { data: profileRows, error: profileMapError } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .in("id", resolvedRecipientIds);

  if (profileMapError) {
    console.error("[send-post-push] profiles map:", profileMapError.message);
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
    console.error("[send-post-push] push_devices:", devicesError.message);
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
    return jsonResponse({
      ok: true,
      sent: 0,
      skipped: "no_android_tokens",
      message: "No Android device tokens for recipients",
    }, 200);
  }

  let accessToken: string;
  let projectId: string;
  try {
    const t = await getFcmAccessToken(serviceAccountJson);
    accessToken = t.accessToken;
    projectId = t.projectId;
  } catch (e) {
    console.error("[send-post-push] FCM auth:", e);
    return jsonResponse(
      { error: "Failed to authorize FCM" },
      500
    );
  }

  let displayName = "Someone";
  const { data: authorRow, error: authorProfileError } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", actorId)
    .maybeSingle();
  if (authorProfileError) {
    console.error("[send-post-push] author profile:", authorProfileError.message);
  } else {
    const ar = authorRow as {
      display_name?: string | null;
      username?: string | null;
    } | null;
    const dn = ar?.display_name?.trim();
    const un = ar?.username?.trim();
    if (dn) displayName = dn;
    else if (un) displayName = un;
  }

  const title = entityType === "hangout" ? "New hangout" : "New experience";
  const bodyText =
    entityType === "hangout"
      ? `${displayName} posted a new hangout.`
      : `${displayName} posted a new experience.`;

  let sent = 0;
  const failures: { status: number; detail?: string }[] = [];

  for (const deviceToken of tokens) {
    const result = await sendFcmToDevice(
      accessToken,
      projectId,
      deviceToken,
      { title, body: bodyText },
      { postId, postType: entityType }
    );
    if (result.ok) {
      sent++;
    } else {
      failures.push({ status: result.status, detail: result.errorText });
    }
  }

  return jsonResponse({
    ok: true,
    sent,
    attempted: tokens.length,
    failures: failures.length > 0 ? failures.slice(0, 5) : undefined,
  }, 200);
});
