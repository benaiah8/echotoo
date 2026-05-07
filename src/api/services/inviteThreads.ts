/**
 * P2 invite thread messaging — RPC wrappers (`get_invite_thread_for_viewer`, etc.).
 * Supports personal, group, and announcement invite chat threads; UI consumes selectively.
 */

import { supabase } from "../../lib/supabaseClient";

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
  return raw as InviteThreadBundle;
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

/**
 * Load invite thread bundle for the signed-in viewer (personal, group, or announcement RPC).
 */
export async function getInviteThreadForViewer(
  threadId: string
): Promise<{ data: InviteThreadBundle | null; error: any }> {
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
