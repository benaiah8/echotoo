/**
 * P2 invite thread messaging — RPC wrappers (`get_invite_thread_for_viewer`, etc.).
 * Supports personal, group, and announcement invite chat threads; UI consumes selectively.
 */

import { supabase } from "../../lib/supabaseClient";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";

/** Values returned on `invite_threads.thread_kind` via RPC. */
export type InviteThreadKind = "personal" | "group" | "announcement";

/** Compact profile peek nested on messages (`sender_profile`) and in `participants[]`. */
export type InviteThreadProfilePeek = {
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type InviteThreadParticipant = InviteThreadProfilePeek;

/** Mirrors invite_threads columns returned by get_invite_thread_for_viewer. */
export type InviteThreadSummary = {
  id: string;
  post_id: string;
  thread_kind: InviteThreadKind | string;
  expires_at: string | null;
  closed_at: string | null;
  inviter_message_quota: number;
  invitee_message_quota: number;
  max_body_length: number;
  created_at: string;
};

export type InviteThreadPostPeek = {
  post_id: string;
  post_type: string | null;
  post_caption: string | null;
};

export type InviteThreadInviteInfo = {
  invite_id: string;
  invite_note: string | null;
  invite_status: string;
};

export type InviteThreadMessage = {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  thumb_up_count: number;
  viewer_has_thumb_up: boolean;
  /** Present when RPC joins sender profile for group/multi-recipient threads. */
  sender_profile?: InviteThreadProfilePeek | null;
};

/** Full payload from get_invite_thread_for_viewer (jsonb). */
export type InviteThreadBundle = {
  thread: InviteThreadSummary;
  post_peek: InviteThreadPostPeek;
  invite: InviteThreadInviteInfo;
  viewer_role: "inviter" | "invitee" | string;
  /** Personal counterpart user id; may be omitted for group-centric payloads. */
  other_user_id?: string | null;
  /** Members allowed in this thread (personal typically 2; group up to cap). */
  participants?: InviteThreadParticipant[];
  participant_count?: number;
  messages: InviteThreadMessage[];
  my_messages_used: number;
  my_messages_remaining: number;
  can_compose: boolean;
  is_expired: boolean;
  blocked_pair: boolean;
};

export type InviteThreadMessageRow = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

export type PostInviteThreadMessageResult = {
  message: InviteThreadMessageRow;
  my_messages_used: number;
  my_messages_remaining: number;
};

export type ToggleInviteMessageReactionResult = {
  message_id: string;
  reaction_type: string;
  reacted: boolean;
  thumb_up_count: number;
  viewer_has_thumb_up: boolean;
};

/** Payload from `toggle_invite_interest` RPC. */
export type ToggleInviteInterestResult = {
  thread_id: string;
  viewer_interested: boolean;
  interest_count: number;
};

function normalizeThreadMessage(msg: InviteThreadMessage): InviteThreadMessage {
  const n = Number(msg.thumb_up_count);
  const thumb_up_count = Number.isFinite(n)
    ? Math.max(0, Math.floor(n))
    : 0;
  return {
    ...msg,
    thumb_up_count,
    viewer_has_thumb_up: msg.viewer_has_thumb_up === true,
  };
}

function asBundle(raw: unknown): InviteThreadBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const thread = o.thread;
  const post_peek = o.post_peek;
  const invite = o.invite;
  const messages = o.messages;
  if (
    !thread ||
    typeof thread !== "object" ||
    !post_peek ||
    typeof post_peek !== "object" ||
    !invite ||
    typeof invite !== "object" ||
    !Array.isArray(messages)
  ) {
    return null;
  }
  const bundle = raw as InviteThreadBundle;
  return {
    ...bundle,
    messages: bundle.messages.map((m) => normalizeThreadMessage(m)),
  };
}

function asPostResult(raw: unknown): PostInviteThreadMessageResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.message || typeof o.message !== "object") return null;
  return raw as PostInviteThreadMessageResult;
}

function asToggleResult(raw: unknown): ToggleInviteMessageReactionResult | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ToggleInviteMessageReactionResult;
}

function asToggleInterestResult(raw: unknown): ToggleInviteInterestResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const thread_id =
    typeof o.thread_id === "string"
      ? o.thread_id
      : typeof o.p_thread_id === "string"
        ? o.p_thread_id
        : null;
  if (!thread_id) return null;
  const viewer_interested = o.viewer_interested === true;
  const n = Number(o.interest_count);
  const interest_count = Number.isFinite(n)
    ? Math.max(0, Math.floor(n))
    : 0;
  return { thread_id, viewer_interested, interest_count };
}

/** In-memory invite thread bundle cache (reduces RPC egress on repeat opens). */
const INVITE_THREAD_BUNDLE_CACHE_TTL_MS = 2 * 60 * 1000;
const inviteThreadBundleCache = new Map<
  string,
  { bundle: InviteThreadBundle; ts: number }
>();

function cloneInviteThreadBundle(bundle: InviteThreadBundle): InviteThreadBundle {
  if (typeof structuredClone === "function") {
    return structuredClone(bundle);
  }
  return JSON.parse(JSON.stringify(bundle)) as InviteThreadBundle;
}

/**
 * Returns a fresh clone of the cached bundle if valid, else null.
 */
export function readInviteThreadBundleCache(
  threadId: string
): InviteThreadBundle | null {
  const entry = inviteThreadBundleCache.get(threadId);
  if (!entry) return null;
  if (Date.now() - entry.ts > INVITE_THREAD_BUNDLE_CACHE_TTL_MS) {
    inviteThreadBundleCache.delete(threadId);
    return null;
  }
  return cloneInviteThreadBundle(entry.bundle);
}

export function writeInviteThreadBundleCache(
  threadId: string,
  bundle: InviteThreadBundle
): void {
  inviteThreadBundleCache.set(threadId, {
    bundle: cloneInviteThreadBundle(bundle),
    ts: Date.now(),
  });
}

/** Omit `threadId` to clear the entire thread bundle cache map. */
export function clearInviteThreadBundleCache(threadId?: string): void {
  if (threadId) {
    inviteThreadBundleCache.delete(threadId);
  } else {
    inviteThreadBundleCache.clear();
  }
}

export type GetInviteThreadForViewerOptions = {
  /** When true, skip reading cache and always call RPC (still writes cache on success). */
  forceRefresh?: boolean;
  /** When true, return a valid cached bundle without RPC when possible (unless forceRefresh). */
  allowCache?: boolean;
};

/**
 * Load invite thread bundle for the signed-in viewer (personal, group, or announcement RPC).
 * Defaults preserve prior behavior: no cache read, always RPC, cache written on success.
 */
export async function getInviteThreadForViewer(
  threadId: string,
  options?: GetInviteThreadForViewerOptions
): Promise<{ data: InviteThreadBundle | null; error: any }> {
  const allowCache = options?.allowCache === true;
  const forceRefresh = options?.forceRefresh === true;

  if (allowCache && !forceRefresh) {
    const cached = readInviteThreadBundleCache(threadId);
    if (cached) {
      return { data: cached, error: null };
    }
  }

  try {
    const { data, error } = await supabase.rpc("get_invite_thread_for_viewer", {
      p_thread_id: threadId,
    });

    if (error) {
      console.error("[getInviteThreadForViewer] RPC error:", error);
      return { data: null, error };
    }

    if (data == null) {
      return { data: null, error: { message: "No data returned" } };
    }

    const bundle = asBundle(data);
    if (!bundle) {
      console.warn("[getInviteThreadForViewer] Unexpected RPC shape");
      return { data: null, error: { message: "Unexpected RPC response shape" } };
    }

    writeInviteThreadBundleCache(threadId, bundle);
    return { data: bundle, error: null };
  } catch (err) {
    console.error("[getInviteThreadForViewer] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Post a message on a personal invite thread (RPC enforces quota, expiry, blocks).
 */
export async function postInviteThreadMessage(
  threadId: string,
  body: string
): Promise<{ data: PostInviteThreadMessageResult | null; error: any }> {
  try {
    assertPlainTextAllowedForUgc(body, "default");

    const { data, error } = await supabase.rpc("post_invite_thread_message", {
      p_thread_id: threadId,
      p_body: body,
    });

    if (error) {
      console.error("[postInviteThreadMessage] RPC error:", error);
      return { data: null, error };
    }

    if (data == null) {
      return { data: null, error: { message: "No data returned" } };
    }

    const parsed = asPostResult(data);
    if (!parsed) {
      console.warn("[postInviteThreadMessage] Unexpected RPC shape");
      return { data: null, error: { message: "Unexpected RPC response shape" } };
    }

    return { data: parsed, error: null };
  } catch (err) {
    console.error("[postInviteThreadMessage] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Toggle thumb_up on a thread message (RPC).
 */

/** Toggle or set invite-thread interest (announcement flows). RPC updates notification rows. */
export async function toggleInviteInterest(
  threadId: string,
  interested?: boolean
): Promise<{ data: ToggleInviteInterestResult | null; error: any }> {
  try {
    const args: Record<string, unknown> = { p_thread_id: threadId };
    if (interested !== undefined) {
      args.p_interested = interested;
    }

    const { data, error } = await supabase.rpc("toggle_invite_interest", args);

    if (error) {
      console.error("[toggleInviteInterest] RPC error:", error);
      return { data: null, error };
    }

    if (data == null) {
      return { data: null, error: { message: "No data returned" } };
    }

    const parsed = asToggleInterestResult(data);
    if (!parsed) {
      console.warn("[toggleInviteInterest] Unexpected RPC shape");
      return { data: null, error: { message: "Unexpected RPC response shape" } };
    }

    return { data: parsed, error: null };
  } catch (err) {
    console.error("[toggleInviteInterest] Unexpected error:", err);
    return { data: null, error: err };
  }
}

export async function toggleInviteMessageReaction(
  messageId: string,
  reactionType: "thumb_up" = "thumb_up"
): Promise<{ data: ToggleInviteMessageReactionResult | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc(
      "toggle_invite_message_reaction",
      {
        p_message_id: messageId,
        p_reaction_type: reactionType,
      }
    );

    if (error) {
      console.error("[toggleInviteMessageReaction] RPC error:", error);
      return { data: null, error };
    }

    if (data == null) {
      return { data: null, error: { message: "No data returned" } };
    }

    const parsed = asToggleResult(data);
    if (!parsed) {
      console.warn("[toggleInviteMessageReaction] Unexpected RPC shape");
      return { data: null, error: { message: "Unexpected RPC response shape" } };
    }

    return { data: parsed, error: null };
  } catch (err) {
    console.error("[toggleInviteMessageReaction] Unexpected error:", err);
    return { data: null, error: err };
  }
}
