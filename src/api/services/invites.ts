import { supabase } from "../../lib/supabaseClient";
import { getViewerAuthUserId } from "./follows";

/** Max length for optional invite note (plain text, in-app). */
export const INVITE_NOTE_MAX_LENGTH = 200;

/** Max invitees in a single send (large events; enforced client + server). */
export const INVITE_MAX_PER_SEND = 2000;

function normalizeInviteNote(
  note: string | undefined | null
): string | null {
  const t = (note ?? "").trim();
  if (!t) return null;
  return t.slice(0, INVITE_NOTE_MAX_LENGTH);
}

/**
 * Best-effort remote push for new invites (Edge Function). Must not throw — invite flow must
 * succeed even if push fails. Mirrors send-post-push invoke pattern; uses postId+postType for native tap.
 */
async function invokeSendInvitePushBestEffort(params: {
  postId: string;
  postType: "hangout" | "experience";
  actorId: string;
  recipientUserIds: string[];
  inviteId?: string;
  threadId?: string;
  threadKind?: string;
  target?: "invite_thread" | "notifications";
}): Promise<void> {
  if (params.recipientUserIds.length === 0) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const { error } = await supabase.functions.invoke("send-invite-push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        post_id: params.postId,
        post_type: params.postType,
        actor_id: params.actorId,
        recipient_user_ids: params.recipientUserIds,
        ...(params.inviteId ? { invite_id: params.inviteId } : {}),
        ...(params.threadId ? { thread_id: params.threadId } : {}),
        ...(params.threadKind ? { thread_kind: params.threadKind } : {}),
        ...(params.target ? { target: params.target } : {}),
      },
    });
    if (error) {
      console.warn("[send-invite-push]", error.message);
    }
  } catch (e) {
    console.warn(
      "[send-invite-push]",
      e instanceof Error ? e.message : e
    );
  }
}

export type InviteStatus = "pending" | "accepted" | "declined" | "expired";

export type Invite = {
  id: string;
  post_id: string;
  inviter_id: string;
  invitee_id: string;
  status: InviteStatus;
  /** Optional inviter message; in-app only; null or omitted for legacy rows */
  note?: string | null;
  /** Set when invite belongs to invite_threads (RPC-created sends) */
  thread_id?: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type InviteWithDetails = Invite & {
  post: {
    id: string;
    caption: string | null;
    type: "experience" | "hangout";
    created_at: string;
  };
  inviter: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  invitee: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

function coerceUuidArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && Boolean(x));
}

/** Loose UUID v4-shaped check (matches Postgres uuid text form). */
function isUuidShaped(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id.trim(),
  );
}

const PROFILE_USER_ID_LOOKUP_CHUNK = 100;

/** Chunk size for `.in("invitee_id", …)` pre-send already-invited checks. */
const INVITE_ALREADY_CHECK_CHUNK = 100;

/**
 * Returns auth `user_id`s (invitees) who already have an `invites` row for this post from the
 * current viewer as inviter. Batched `.in` queries only — no per-user round trips.
 */
export async function getInviteeIdsAlreadyInvitedForPost(
  postId: string,
  inviteeAuthUserIds: string[]
): Promise<Set<string>> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("Not authenticated");

  const trimmedUnique = [
    ...new Set(inviteeAuthUserIds.map((x) => (x ?? "").trim())),
  ].filter(Boolean);
  const uuidCandidates = trimmedUnique.filter(isUuidShaped);
  if (uuidCandidates.length === 0) {
    return new Set();
  }

  const found = new Set<string>();
  for (
    let i = 0;
    i < uuidCandidates.length;
    i += INVITE_ALREADY_CHECK_CHUNK
  ) {
    const chunk = uuidCandidates.slice(i, i + INVITE_ALREADY_CHECK_CHUNK);
    const { data: rows, error } = await supabase
      .from("invites")
      .select("invitee_id")
      .eq("post_id", postId)
      .eq("inviter_id", userId)
      .in("invitee_id", chunk);

    if (error) throw error;
    for (const r of rows ?? []) {
      if (typeof r.invitee_id === "string" && r.invitee_id.trim()) {
        found.add(r.invitee_id.trim());
      }
    }
  }
  return found;
}

/**
 * Returns auth user ids that exist on `profiles.user_id` (batched `.in` queries).
 */
async function filterInviteeIdsAgainstProfiles(
  rawIds: string[],
): Promise<{ validIds: string[]; skippedIds: string[] }> {
  const trimmedOrdered = [...new Set(rawIds.map((x) => (x ?? "").trim()))].filter(
    Boolean,
  );
  const skippedMalformed = trimmedOrdered.filter((id) => !isUuidShaped(id));
  const uuidCandidates = trimmedOrdered.filter(isUuidShaped);

  if (uuidCandidates.length === 0) {
    return { validIds: [], skippedIds: trimmedOrdered };
  }

  const existing = new Set<string>();
  for (let i = 0; i < uuidCandidates.length; i += PROFILE_USER_ID_LOOKUP_CHUNK) {
    const chunk = uuidCandidates.slice(i, i + PROFILE_USER_ID_LOOKUP_CHUNK);
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("user_id")
      .in("user_id", chunk);

    if (error) {
      throw error;
    }
    for (const r of rows ?? []) {
      if (typeof r.user_id === "string" && r.user_id.trim()) {
        existing.add(r.user_id.trim());
      }
    }
  }

  const validIds = uuidCandidates.filter((id) => existing.has(id.trim()));
  const skippedMissingProfile = uuidCandidates.filter(
    (id) => !existing.has(id.trim()),
  );
  const skippedIds = [...skippedMalformed, ...skippedMissingProfile];

  return { validIds, skippedIds };
}

/** jsonb payload from create_invite_thread_with_invites */
type InviteThreadRpcResult = {
  thread_id: string | null;
  thread_kind: string | null;
  inserted_invite_ids: string[];
  inserted_invitee_ids: string[];
  already_invited_invitee_ids: string[];
  skipped_self_invitee_ids: string[];
  skipped_blocked_invitee_ids: string[];
  effective_recipient_count: number;
  note_was_included: boolean;
};

function parseInviteThreadRpcResult(raw: unknown): InviteThreadRpcResult {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") {
    return {
      thread_id: null,
      thread_kind: null,
      inserted_invite_ids: [],
      inserted_invitee_ids: [],
      already_invited_invitee_ids: [],
      skipped_self_invitee_ids: [],
      skipped_blocked_invitee_ids: [],
      effective_recipient_count: 0,
      note_was_included: false,
    };
  }

  const threadId: string | null =
    o.thread_id === null
      ? null
      : typeof o.thread_id === "string"
        ? o.thread_id
        : null;

  const threadKind: string | null =
    typeof o.thread_kind === "string" ? o.thread_kind : null;

  return {
    thread_id: threadId,
    thread_kind: threadKind,
    inserted_invite_ids: coerceUuidArray(o.inserted_invite_ids),
    inserted_invitee_ids: coerceUuidArray(o.inserted_invitee_ids),
    already_invited_invitee_ids: coerceUuidArray(o.already_invited_invitee_ids),
    skipped_self_invitee_ids: coerceUuidArray(o.skipped_self_invitee_ids),
    skipped_blocked_invitee_ids: coerceUuidArray(
      o.skipped_blocked_invitee_ids
    ),
    effective_recipient_count:
      typeof o.effective_recipient_count === "number"
        ? o.effective_recipient_count
        : 0,
    note_was_included: Boolean(o.note_was_included),
  };
}

export type SendInvitesResult = {
  data: Invite[] | null;
  error: any;
  alreadyInvited?: string[];
  /** Original invitee ids removed before RPC (bad shape or no matching `profiles.user_id`). */
  skippedInvalidInviteeIds?: string[];
};

/**
 * Send invites to multiple users for a post
 */
export async function sendInvites(
  postId: string,
  inviteeIds: string[],
  note?: string | null
): Promise<SendInvitesResult> {
  try {
    const noteForDb = normalizeInviteNote(note);
    console.log("Sending invites for post:", postId, "to users:", inviteeIds);

    if (inviteeIds.length > INVITE_MAX_PER_SEND) {
      return {
        data: null,
        error: new Error(
          `You can invite up to ${INVITE_MAX_PER_SEND} people at a time.`
        ),
      };
    }

    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    console.log("Current user:", userId);

    // Fast client check — RPC validates again (authoritative).
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .maybeSingle();

    if (postError || !post) {
      console.error("Post error:", postError);
      throw new Error("Post not found");
    }

    let skippedPreflight: string[] = [];
    let idsForRpc: string[] = inviteeIds;
    try {
      const { validIds, skippedIds } =
        await filterInviteeIdsAgainstProfiles(inviteeIds);
      skippedPreflight = skippedIds;
      idsForRpc = validIds;
    } catch (preflightErr) {
      console.error("Invite preflight (profiles) failed:", preflightErr);
      return {
        data: null,
        error: preflightErr,
        skippedInvalidInviteeIds: skippedPreflight,
      };
    }

    if (idsForRpc.length === 0) {
      return {
        data: null,
        error: null,
        skippedInvalidInviteeIds: skippedPreflight,
      };
    }

    const { data: rpcRaw, error: rpcError } = await supabase.rpc(
      "create_invite_thread_with_invites",
      {
        p_post_id: postId,
        p_invitee_ids: idsForRpc,
        p_note: noteForDb,
      }
    );

    if (rpcError) {
      console.error("create_invite_thread_with_invites RPC error:", rpcError);
      return {
        data: null,
        error: rpcError,
        skippedInvalidInviteeIds:
          skippedPreflight.length > 0 ? skippedPreflight : undefined,
      };
    }

    const rpc = parseInviteThreadRpcResult(rpcRaw);
    const alreadyInvitedIds = rpc.already_invited_invitee_ids;

    const insertedInviteIds = rpc.inserted_invite_ids;
    if (insertedInviteIds.length === 0) {
      console.log(
        "RPC invite send: zero new inserts. already_invited:",
        alreadyInvitedIds.length
      );
      return {
        data: [],
        error: null,
        alreadyInvited: alreadyInvitedIds,
        skippedInvalidInviteeIds:
          skippedPreflight.length > 0 ? skippedPreflight : undefined,
      };
    }

    const { data: fetchedInvites, error: fetchError } = await supabase
      .from("invites")
      .select("*")
      .in("id", insertedInviteIds);

    if (fetchError) {
      console.error("Failed to fetch invites after RPC:", fetchError);
      return {
        data: null,
        error: fetchError,
        alreadyInvited: alreadyInvitedIds,
        skippedInvalidInviteeIds:
          skippedPreflight.length > 0 ? skippedPreflight : undefined,
      };
    }

    const data = (fetchedInvites || []) as Invite[];
    console.log("Successfully fetched invites after RPC:", data.length);

    // Preserve row order aligned with RPC inserted_invitee_ids when possible
    const byInviteeOrder = rpc.inserted_invitee_ids;
    if (byInviteeOrder.length > 0 && data.length > 1) {
      data.sort((a, b) => {
        const ia = byInviteeOrder.indexOf(a.invitee_id);
        const ib = byInviteeOrder.indexOf(b.invitee_id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return 0;
      });
    }

    // Create notifications for sent invites (for the inviter)
    // This happens even if notification creation fails (don't fail invite creation)
    if (data.length > 0) {
      let postTypeForPush: "hangout" | "experience" | null = null;
      try {
        // Get post details for notifications
        const { data: postData, error: postDataError } = await supabase
          .from("posts")
          .select("caption, type")
          .eq("id", postId)
          .single();

        if (postDataError) {
          console.error(
            "Error fetching post data for notifications:",
            postDataError
          );
        } else if (
          postData?.type === "hangout" ||
          postData?.type === "experience"
        ) {
          postTypeForPush = postData.type;
        }

        const threadExtras: Record<string, unknown> = {};
        if (rpc.thread_id) threadExtras.thread_id = rpc.thread_id;
        if (rpc.thread_kind) threadExtras.thread_kind = rpc.thread_kind;

        const isGroupLikeThread =
          rpc.thread_kind === "group" || rpc.thread_kind === "announcement";
        const canCollapseSenderRows = isGroupLikeThread && !!rpc.thread_id;

        // Sender-side sent notifications:
        // - personal: keep one per invite row
        // - group/announcement: collapse to one row per thread when thread_id exists
        // Defensive fallback: if group-like thread has no thread_id, keep per-invite rows.
        const sentInviteNotifications = canCollapseSenderRows
          ? [
              {
                user_id: userId,
                actor_id: data[0]?.invitee_id ?? null,
                type: "invite" as const,
                entity_type: (postData?.type || "hangout") as
                  | "hangout"
                  | "experience",
                entity_id: postId,
                additional_data: {
                  post_id: postId,
                  post_type: postData?.type || "hangout",
                  post_caption: postData?.caption || null,
                  invite_direction: "sent",
                  ...(noteForDb ? { invite_note: noteForDb } : {}),
                  ...threadExtras,
                },
                is_read: false,
              },
            ]
          : data.map((invite) => ({
              user_id: userId,
              actor_id: invite.invitee_id,
              type: "invite" as const,
              entity_type: (postData?.type || "hangout") as
                | "hangout"
                | "experience",
              entity_id: postId,
              additional_data: {
                post_id: postId,
                invite_id: invite.id,
                post_type: postData?.type || "hangout",
                post_caption: postData?.caption || null,
                invite_direction: "sent",
                ...(noteForDb ? { invite_note: noteForDb } : {}),
                ...threadExtras,
              },
              is_read: false,
            }));

        console.log(
          "Creating sent invite notifications:",
          sentInviteNotifications.length,
          "notifications"
        );

        // Insert sent invite notifications
        const { data: insertedNotifications, error: notificationError } =
          await supabase
            .from("notifications")
            .insert(sentInviteNotifications)
            .select();

        if (notificationError) {
          console.error(
            "Error creating sent invite notifications:",
            notificationError
          );
          console.error(
            "Notification error details:",
            JSON.stringify(notificationError, null, 2)
          );
        } else {
          console.log(
            "Successfully created sent invite notifications:",
            insertedNotifications?.length || 0
          );
          if (insertedNotifications && insertedNotifications.length > 0) {
            console.log(
              "Sample notification:",
              JSON.stringify(insertedNotifications[0], null, 2)
            );
          }
        }
      } catch (notificationCreationError) {
        // Don't fail invite creation if notification creation fails
        console.error(
          "Exception during notification creation:",
          notificationCreationError
        );
      }

      // Native invite push: personal and group only. Announcement/banner batches stay in-app
      // only (no FCM) to avoid noisy bulk pushes; Edge Function unchanged.
      if (
        postTypeForPush &&
        (rpc.thread_kind === "personal" || rpc.thread_kind === "group")
      ) {
        const newInviteeIdsForPush = rpc.inserted_invitee_ids;
        void invokeSendInvitePushBestEffort({
          postId,
          postType: postTypeForPush,
          actorId: userId,
          recipientUserIds: newInviteeIdsForPush,
          inviteId:
            insertedInviteIds.length === 1 ? insertedInviteIds[0] : undefined,
          threadId: rpc.thread_id ?? undefined,
          threadKind: rpc.thread_kind ?? undefined,
          target: rpc.thread_id ? "invite_thread" : "notifications",
        });
      }
    }

    return {
      data,
      error: null,
      alreadyInvited: alreadyInvitedIds,
      skippedInvalidInviteeIds:
        skippedPreflight.length > 0 ? skippedPreflight : undefined,
    };
  } catch (error) {
    console.error("Send invites error:", error);
    return { data: null, error };
  }
}

/**
 * Get invites sent by the current user
 */
export async function getSentInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at)
      `
      )
      .eq("inviter_id", userId)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get invites received by the current user
 */
export async function getReceivedInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at)
      `
      )
      .eq("invitee_id", userId)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Update invite status (accept/decline/pending)
 */
export async function updateInviteStatus(
  inviteId: string,
  status: "accepted" | "declined" | "pending"
): Promise<{ data: Invite | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status })
      .eq("id", inviteId)
      .eq("invitee_id", userId) // Security: only invitee can update
      .select("*")
      .single();

    // [OPTIMIZATION] Update cache with new data if update was successful
    if (data && !error) {
      const { setCachedInviteData } = await import("../../lib/inviteDataCache");
      setCachedInviteData(inviteId, data);
    }

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Revert invite status back to pending (undo accept/decline)
 */
export async function revertInviteToPending(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  return updateInviteStatus(inviteId, "pending");
}

/**
 * Delete an invite (only inviter can delete)
 */
export async function deleteInvite(
  inviteId: string
): Promise<{ data: any; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId)
      .eq("inviter_id", userId); // Security: only inviter can delete

    // [OPTIMIZATION] Clear cache if delete was successful
    if (!error) {
      const { clearCachedInviteData } = await import(
        "../../lib/inviteDataCache"
      );
      clearCachedInviteData(inviteId);
    }

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get invites for a specific post
 */
export async function getPostInvites(
  postId: string
): Promise<{ data: InviteWithDetails[] | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    // Check if user owns the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", postId)
      .single();

    if (postError || !post) throw new Error("Post not found");
    if (post.author_id !== userId) throw new Error("Not authorized");

    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Head-count only: pending invites received by the current user (same filters as {@link getPendingInvites}).
 */
export async function countPendingInvitesForViewer(): Promise<{
  count: number;
  error: any | null;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) {
      return { count: 0, error: new Error("Not authenticated") };
    }

    const { count, error } = await supabase
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("invitee_id", userId)
      .eq("status", "pending");

    if (error) return { count: 0, error };

    return { count: count ?? 0, error: null };
  } catch (error) {
    return { count: 0, error };
  }
}

/**
 * Get pending invites for the current user
 */
export async function getPendingInvites(): Promise<{
  data: InviteWithDetails[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        *,
        post:posts(id, caption, type, created_at),
        inviter:profiles!inviter_id(id, username, display_name, avatar_url)
      `
      )
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Accept an invite
 */
export async function acceptInvite(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", inviteId)
      .eq("invitee_id", userId) // Security: only invitee can accept
      .select("*")
      .single();

    // [OPTIMIZATION] Update cache with new data if update was successful
    if (data && !error) {
      const { setCachedInviteData } = await import("../../lib/inviteDataCache");
      setCachedInviteData(inviteId, data);
    }

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Decline an invite
 */
export async function declineInvite(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("invites")
      .update({ status: "declined" })
      .eq("id", inviteId)
      .eq("invitee_id", userId) // Security: only invitee can decline
      .select("*")
      .single();

    // [OPTIMIZATION] Update cache with new data if update was successful
    if (data && !error) {
      const { setCachedInviteData } = await import("../../lib/inviteDataCache");
      setCachedInviteData(inviteId, data);
    }

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get invite by ID (to check status)
 * [OPTIMIZATION: Phase 2] Uses RequestManager for deduplication + short cache for sequential requests
 */
export async function getInviteById(
  inviteId: string
): Promise<{ data: Invite | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) return { data: null, error: new Error("Not authenticated") };

    // [OPTIMIZATION] Check cache first (fast, synchronous path)
    // This prevents duplicate sequential requests (e.g., determineInviteDirection + useEffect)
    const { getCachedInviteData, setCachedInviteData } = await import(
      "../../lib/inviteDataCache"
    );
    const cachedInvite = getCachedInviteData(inviteId);
    if (cachedInvite) {
      return { data: cachedInvite, error: null };
    }

    // [OPTIMIZATION] Use RequestManager for deduplication
    // Multiple components calling this simultaneously will share the same request
    const { requestManager } = await import("../../lib/requestManager");
    const dedupeKey = `invite_by_id_${inviteId}`;

    const result = await requestManager.execute(
      dedupeKey,
      async (signal) => {
        // [RACE CONDITION FIX] Check cache again inside RequestManager
        // Another call might have populated it
        const cachedInviteAgain = getCachedInviteData(inviteId);
        if (cachedInviteAgain) {
          return { data: cachedInviteAgain, error: null };
        }

        // [ABORT CHECK] Check if aborted before making request
        if (signal.aborted) {
          return { data: null, error: new Error("Request aborted") };
        }

        const { data, error } = await supabase
          .from("invites")
          .select("*")
          .eq("id", inviteId)
          .single();

        // [ABORT CHECK] Check if aborted after async operation
        if (signal.aborted) {
          return { data: null, error: new Error("Request aborted") };
        }

        // [CACHE UPDATE] Cache the result for 30 seconds
        // This prevents duplicate sequential requests
        if (data && !error) {
          setCachedInviteData(inviteId, data);
        }

        return { data, error };
      },
      "medium" // Medium priority
    );

    return result.data ?? { data: null, error: new Error("Request failed") };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Batch fetch invites by IDs (for notification list optimization).
 * Single query instead of N per-row getInviteById calls.
 * Returns minimal fields needed for invite_direction and status.
 */
export async function getBatchInvitesByIds(
  inviteIds: string[]
): Promise<
  Array<{
    id: string;
    inviter_id: string;
    invitee_id: string;
    status: InviteStatus;
  }>
> {
  if (!inviteIds || inviteIds.length === 0) return [];

  const uniqueIds = Array.from(new Set(inviteIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("invites")
    .select("id, inviter_id, invitee_id, status")
    .in("id", uniqueIds);

  if (error) {
    console.warn("[getBatchInvitesByIds] Error:", error);
    return [];
  }

  return (data || []) as Array<{
    id: string;
    inviter_id: string;
    invitee_id: string;
    status: InviteStatus;
  }>;
}
