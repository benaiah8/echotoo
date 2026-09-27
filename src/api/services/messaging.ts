/**
 * Phase 1A/2 persistent 1:1 DM — RPC wrappers (no UI).
 * Tables: conversations / conversation_members / messages (Phase 0).
 */

import { supabase } from "../../lib/supabaseClient";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";

export type ConversationKind = "direct" | "group";

export type DirectConversation = {
  conversation_id: string;
  kind: ConversationKind | string;
  other_user_id: string;
  created: boolean;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
};

export type MessageKind = "text" | "shared_post" | "match_context";

export type SharedPostSnapshot = {
  v: 1;
  post_type: "hangout" | "experience";
};

export type MatchContextSubtype = "open_plan_match" | "pair_up_match";

export type MatchContextSnapshot = {
  v: 1;
  subtype: MatchContextSubtype;
  source_post_id?: string;
  caption: string;
  occurs_at: string | null;
};

export type MessageReferenceType =
  | "post"
  | "open_plan_request"
  | "pair_up_match";

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  client_message_id: string;
  created_at: string;
  message_kind: MessageKind;
  reference_type: MessageReferenceType | null;
  reference_id: string | null;
  reference_snapshot: SharedPostSnapshot | MatchContextSnapshot | null;
};

export type SendMessageResult = {
  message: MessageRow;
  /** false when an idempotent retry returned an existing row */
  created: boolean;
};

const SHARED_POST_NOTE_MAX = 200;

/** Keyset cursor for loading older messages (strictly before this key). */
export type MessageListCursor = {
  created_at: string;
  id: string;
};

export type ListMessagesResult = {
  conversation_id: string;
  /** Newest-first from the RPC */
  messages: MessageRow[];
  has_more: boolean;
  /** Oldest row of this page when has_more; use as before-cursor for next older page */
  next_cursor: MessageListCursor | null;
};

/** Inbox row from list_my_conversations (no message bodies). */
export type InboxMemberPreview = {
  user_id: string;
  avatar_url: string | null;
  display_name: string | null;
  username: string | null;
  joined_at: string;
};

export type InboxConversationRow = {
  conversation_id: string;
  kind: ConversationKind | string;
  other_user_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
  is_last_from_me: boolean;
  created_at: string;
  /** Present for kind=group; null/omitted for direct. */
  member_count: number | null;
  /**
   * Group only (Phase 2): up to 3 most recently joined active members.
   * null for direct, or for groups when the backend omitted the field (pre-migration).
   * [] when the backend returned an empty preview.
   */
  member_preview: InboxMemberPreview[] | null;
  /**
   * Group only: viewer's active membership role from list_my_conversations.
   * null for direct, omitted/unknown role, or pre-migration RPCs.
   * Do not infer admin from created_by.
   */
  viewer_role: ConversationMemberRole | null;
  /** R1A: viewer-relative message request (incoming stranger DM). */
  is_request: boolean;
  /** M2B: viewer muted push notifications for this conversation. */
  notifications_muted: boolean;
};

export type SetConversationNotificationsMutedResult = {
  conversation_id: string;
  notifications_muted: boolean;
};

/** Viewer-local Delete chat (hide + history cutoff; no leave). */
export type HideDirectConversationForMeResult = {
  conversation_id: string;
  hidden: boolean;
};

/** Same shape as direct hide — group Delete chat. */
export type HideGroupConversationForMeResult = HideDirectConversationForMeResult;

/** Soft Delete group — ends group for all active members. */
export type DissolveGroupConversationResult = {
  conversation_id: string;
  dissolved: boolean;
};

export type DirectMessagingRestriction =
  | "waiting_for_reply"
  | "blocked"
  | "private";

/** R1B: read-only access snapshot for an open direct conversation. */
export type DirectMessagingAccess = {
  conversation_id: string;
  kind: ConversationKind | string;
  unlocked: boolean;
  can_send: boolean;
  qualifying_sent_count: number;
  messages_remaining: number | null;
  restriction: DirectMessagingRestriction | null;
  is_request: boolean;
};

const DM_STRANGER_LIMIT_CODE = "DM_STRANGER_LIMIT_REACHED";
const DM_DIRECT_ACCESS_DENIED_CODE = "DM_DIRECT_ACCESS_DENIED";

/** User-facing copy for blocked / private / access-denied (never reveals cause). */
export const DM_MESSAGING_UNAVAILABLE_COPY = "Messaging is unavailable.";

function rpcErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof (error as { message?: unknown })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/** True when a messaging RPC failed due to the stranger two-message cap. */
export function isDmStrangerLimitError(error: unknown): boolean {
  return rpcErrorMessage(error).includes(DM_STRANGER_LIMIT_CODE);
}

/** True when create/send was denied by DM access grants (private/no grant). */
export function isDmDirectAccessDeniedError(error: unknown): boolean {
  const message = rpcErrorMessage(error);
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    message.includes(DM_DIRECT_ACCESS_DENIED_CODE) ||
    lower.includes("cannot message")
  );
}

export type ListMyConversationsResult = {
  conversations: InboxConversationRow[];
};

export type MarkConversationReadResult = {
  conversation_id: string;
  unread_count: number;
  updated: boolean;
};

export type ConversationMemberRole = "admin" | "member";

export type ConversationMemberRow = {
  user_id: string;
  role: ConversationMemberRole | string;
  joined_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type CreateGroupConversationResult = {
  conversation_id: string;
  kind: string;
  title: string;
  member_count: number;
  created: boolean;
};

export type AddConversationMembersResult = {
  conversation_id: string;
  added_user_ids: string[];
  member_count: number;
};

export type RemoveConversationMemberResult = {
  conversation_id: string;
  removed_user_id: string;
  member_count: number;
};

export type LeaveConversationResult = {
  conversation_id: string;
  left: boolean;
  member_count: number;
};

export type RenameGroupConversationResult = {
  conversation_id: string;
  title: string;
};

export type UpdateGroupDetailsResult = {
  conversation_id: string;
  title: string;
  description: string | null;
};

export type ListConversationMembersResult = {
  members: ConversationMemberRow[];
};

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_INBOX_LIMIT = 40;

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : null;
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

function asNonNegInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.floor(v));
  }
  return null;
}

function asUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = asString(item);
    if (id) out.push(id);
  }
  return out;
}

function parseSharedPostSnapshot(raw: unknown): SharedPostSnapshot | null {
  const o = asRecord(raw);
  if (!o) return null;
  const v = o.v;
  const postType = asString(o.post_type);
  if (v !== 1) return null;
  if (postType !== "hangout" && postType !== "experience") return null;
  return { v: 1, post_type: postType };
}

export function parseMatchContextSnapshot(
  raw: unknown
): MatchContextSnapshot | null {
  const o = asRecord(raw);
  if (!o) return null;
  if (o.v !== 1) return null;
  const subtypeRaw = asString(o.subtype);
  if (
    subtypeRaw !== "open_plan_match" &&
    subtypeRaw !== "pair_up_match"
  ) {
    return null;
  }
  const caption =
    typeof o.caption === "string" ? o.caption : "";
  let occurs_at: string | null = null;
  if (typeof o.occurs_at === "string" && o.occurs_at.trim()) {
    occurs_at = o.occurs_at.trim();
  } else if (o.occurs_at == null) {
    occurs_at = null;
  }
  const source_post_id = asString(o.source_post_id) ?? undefined;
  return {
    v: 1,
    subtype: subtypeRaw,
    caption,
    occurs_at,
    ...(source_post_id ? { source_post_id } : {}),
  };
}

function parseMessageKind(kindRaw: string | null): MessageKind | null {
  if (kindRaw === "shared_post") return "shared_post";
  if (kindRaw === "match_context") return "match_context";
  if (kindRaw === "text" || !kindRaw) return "text";
  // Unknown kinds must not be coerced into text (would mis-render match_context).
  return null;
}

function parseMessageRow(raw: unknown): MessageRow | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = asString(o.id);
  const conversation_id = asString(o.conversation_id);
  const sender_user_id = asString(o.sender_user_id);
  const body = typeof o.body === "string" ? o.body : null;
  const client_message_id = asString(o.client_message_id);
  const created_at = asString(o.created_at);
  if (
    !id ||
    !conversation_id ||
    !sender_user_id ||
    body == null ||
    !client_message_id ||
    !created_at
  ) {
    return null;
  }

  const kindRaw = asString(o.message_kind);
  const message_kind = parseMessageKind(kindRaw);
  if (!message_kind) return null;

  let reference_type: MessageReferenceType | null = null;
  let reference_id: string | null = null;
  let reference_snapshot: SharedPostSnapshot | MatchContextSnapshot | null =
    null;

  if (message_kind === "shared_post") {
    const refType = asString(o.reference_type);
    const refId = asString(o.reference_id);
    const snap = parseSharedPostSnapshot(o.reference_snapshot);
    if (refType !== "post" || !refId || !snap) {
      // Incomplete typed row — still surface as shared_post with nulls only if
      // core ids exist; require snapshot for a valid shared_post parse.
      return null;
    }
    reference_type = "post";
    reference_id = refId;
    reference_snapshot = snap;
  } else if (message_kind === "match_context") {
    const refType = asString(o.reference_type);
    const refId = asString(o.reference_id);
    const snap = parseMatchContextSnapshot(o.reference_snapshot);
    if (
      (refType !== "open_plan_request" && refType !== "pair_up_match") ||
      !refId ||
      !snap
    ) {
      return null;
    }
    reference_type = refType;
    reference_id = refId;
    reference_snapshot = snap;
  }

  return {
    id,
    conversation_id,
    sender_user_id,
    body,
    client_message_id,
    created_at,
    message_kind,
    reference_type,
    reference_id,
    reference_snapshot,
  };
}

function parseMessageListCursor(raw: unknown): MessageListCursor | null {
  const o = asRecord(raw);
  if (!o) return null;
  const created_at = asString(o.created_at);
  const id = asString(o.id);
  if (!created_at || !id) return null;
  return { created_at, id };
}

function parseDirectConversation(raw: unknown): DirectConversation | null {
  const o = asRecord(raw);
  if (!o) return null;
  const conversation_id = asString(o.conversation_id);
  const kind = asString(o.kind);
  const other_user_id = asString(o.other_user_id);
  const created_at = asString(o.created_at);
  if (!conversation_id || !kind || !other_user_id || !created_at) return null;
  return {
    conversation_id,
    kind,
    other_user_id,
    created: asBoolean(o.created),
    created_at,
    last_message_at: asNullableString(o.last_message_at),
    last_message_preview: asNullableString(o.last_message_preview),
    last_message_sender_id: asNullableString(o.last_message_sender_id),
  };
}

/** Browser-safe UUID for send idempotency (`client_message_id`). */
export function createClientMessageId(): string {
  return crypto.randomUUID();
}

/**
 * Get or create the unique direct conversation with another auth user.
 */
export async function getOrCreateDirectConversation(
  otherUserId: string
): Promise<{ data: DirectConversation | null; error: unknown }> {
  try {
    const trimmed = (otherUserId ?? "").trim();
    if (!trimmed) {
      return { data: null, error: new Error("Missing other user id") };
    }

    const { data, error } = await supabase.rpc(
      "get_or_create_direct_conversation",
      { p_other_user_id: trimmed }
    );

    if (error) {
      console.error("[getOrCreateDirectConversation] RPC error:", error);
      return { data: null, error };
    }

    const parsed = parseDirectConversation(data);
    if (!parsed) {
      console.warn("[getOrCreateDirectConversation] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return { data: parsed, error: null };
  } catch (err) {
    console.error("[getOrCreateDirectConversation] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Send a text message. Pass a stable `clientMessageId` (or omit to generate one)
 * so retries/double-taps do not create duplicates.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  clientMessageId?: string
): Promise<{ data: SendMessageResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    assertPlainTextAllowedForUgc(body, "default");

    const id =
      (clientMessageId ?? "").trim() || createClientMessageId();

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: trimmedConversationId,
      p_body: body,
      p_client_message_id: id,
    });

    if (error) {
      console.error("[sendMessage] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const message = parseMessageRow(o?.message);
    if (!o || !message) {
      console.warn("[sendMessage] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        message,
        created: asBoolean(o.created),
      },
      error: null,
    };
  } catch (err) {
    console.error("[sendMessage] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Send a shared_post message (Share S0). Server builds snapshot and enforces
 * all-active-member post visibility. Pass a stable `clientMessageId` for idempotency.
 */
export async function sendSharedPostMessage(
  conversationId: string,
  postId: string,
  note: string | null | undefined,
  clientMessageId?: string
): Promise<{ data: SendMessageResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    const trimmedPostId = (postId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }
    if (!trimmedPostId) {
      return { data: null, error: new Error("Missing post id") };
    }

    const noteTrimmed = (note ?? "").trim();
    if (noteTrimmed.length > SHARED_POST_NOTE_MAX) {
      return { data: null, error: new Error("Note is too long") };
    }
    if (noteTrimmed.length > 0) {
      assertPlainTextAllowedForUgc(noteTrimmed, "default");
    }

    const id =
      (clientMessageId ?? "").trim() || createClientMessageId();

    const { data, error } = await supabase.rpc("send_shared_post_message", {
      p_conversation_id: trimmedConversationId,
      p_post_id: trimmedPostId,
      p_note: noteTrimmed.length > 0 ? noteTrimmed : null,
      p_client_message_id: id,
    });

    if (error) {
      console.error("[sendSharedPostMessage] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const message = parseMessageRow(o?.message);
    if (!o || !message) {
      console.warn("[sendSharedPostMessage] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        message,
        created: asBoolean(o.created),
      },
      error: null,
    };
  } catch (err) {
    console.error("[sendSharedPostMessage] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * List messages (newest-first). Pass `before` to load the next older page.
 * Requires Phase 2 `list_messages` keyset RPC when using cursor / has_more.
 */
export async function listMessages(
  conversationId: string,
  limit: number = DEFAULT_LIST_LIMIT,
  before?: MessageListCursor | null
): Promise<{ data: ListMessagesResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 50)
        : DEFAULT_LIST_LIMIT;

    const beforeCreatedAt = before?.created_at?.trim() || null;
    const beforeId = before?.id?.trim() || null;
    if ((beforeCreatedAt == null) !== (beforeId == null)) {
      return {
        data: null,
        error: new Error("Invalid cursor: created_at and id are both required"),
      };
    }

    const rpcParams: Record<string, unknown> = {
      p_conversation_id: trimmedConversationId,
      p_limit: safeLimit,
    };
    if (beforeCreatedAt && beforeId) {
      rpcParams.p_before_created_at = beforeCreatedAt;
      rpcParams.p_before_id = beforeId;
    }

    const { data, error } = await supabase.rpc("list_messages", rpcParams);

    if (error) {
      console.error("[listMessages] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const rawMessages = o?.messages;
    if (!o || !conversation_id || !Array.isArray(rawMessages)) {
      console.warn("[listMessages] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    const messages: MessageRow[] = [];
    for (const row of rawMessages) {
      const parsed = parseMessageRow(row);
      if (parsed) messages.push(parsed);
    }

    // Phase 1 RPC (no has_more): treat a full page as possibly having more.
    const hasMoreField = o.has_more;
    const has_more =
      typeof hasMoreField === "boolean"
        ? hasMoreField
        : messages.length >= safeLimit;

    let next_cursor: MessageListCursor | null = null;
    if (has_more) {
      next_cursor = parseMessageListCursor(o.next_cursor);
      if (!next_cursor && messages.length > 0) {
        const oldest = messages[messages.length - 1];
        next_cursor = { created_at: oldest.created_at, id: oldest.id };
      }
    }

    return {
      data: { conversation_id, messages, has_more, next_cursor },
      error: null,
    };
  } catch (err) {
    console.error("[listMessages] Unexpected error:", err);
    return { data: null, error: err };
  }
}

function parseInboxMemberPreview(raw: unknown): InboxMemberPreview | null {
  const o = asRecord(raw);
  if (!o) return null;
  const user_id = asString(o.user_id);
  if (!user_id) return null;
  return {
    user_id,
    avatar_url: asNullableString(o.avatar_url),
    display_name: asNullableString(o.display_name),
    username: asNullableString(o.username),
    joined_at: asString(o.joined_at) ?? "",
  };
}

function parseInboxMemberPreviewList(raw: unknown): InboxMemberPreview[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: InboxMemberPreview[] = [];
  for (const item of raw) {
    const parsed = parseInboxMemberPreview(item);
    if (parsed) out.push(parsed);
    if (out.length >= 3) break;
  }
  return out;
}

function parseInboxConversationRow(raw: unknown): InboxConversationRow | null {
  const o = asRecord(raw);
  if (!o) return null;
  const conversation_id = asString(o.conversation_id);
  const kind = asString(o.kind);
  const created_at = asString(o.created_at);
  if (!conversation_id || !kind || !created_at) return null;
  const unreadRaw = o.unread_count;
  const unread_count =
    typeof unreadRaw === "number" && Number.isFinite(unreadRaw)
      ? Math.max(0, Math.floor(unreadRaw))
      : 0;
  const memberCountRaw = asNonNegInt(o.member_count);
  const isGroup = kind === "group";
  // Only parse when the key is present so pre-migration RPCs do not look like
  // "confirmed empty preview" and wipe warmer identity data.
  let member_preview: InboxMemberPreview[] | null = null;
  if (isGroup && Object.prototype.hasOwnProperty.call(o, "member_preview")) {
    member_preview = parseInboxMemberPreviewList(o.member_preview) ?? [];
  }
  let viewer_role: ConversationMemberRole | null = null;
  if (isGroup) {
    const roleRaw = asString(o.viewer_role);
    if (roleRaw === "admin" || roleRaw === "member") {
      viewer_role = roleRaw;
    }
  }
  return {
    conversation_id,
    kind,
    other_user_id: asNullableString(o.other_user_id),
    display_name: asNullableString(o.display_name),
    username: asNullableString(o.username),
    avatar_url: asNullableString(o.avatar_url),
    title: asNullableString(o.title),
    last_message_at: asNullableString(o.last_message_at),
    last_message_preview: asNullableString(o.last_message_preview),
    last_message_sender_id: asNullableString(o.last_message_sender_id),
    unread_count,
    is_last_from_me: asBoolean(o.is_last_from_me),
    created_at,
    member_count: memberCountRaw,
    member_preview,
    viewer_role,
    is_request: asBoolean(o.is_request),
    notifications_muted: asBoolean(o.notifications_muted),
  };
}

function parseDirectMessagingAccess(raw: unknown): DirectMessagingAccess | null {
  const o = asRecord(raw);
  if (!o) return null;
  const conversation_id = asString(o.conversation_id);
  const kind = asString(o.kind);
  if (!conversation_id || !kind) return null;

  const countRaw = o.qualifying_sent_count;
  const qualifying_sent_count =
    typeof countRaw === "number" && Number.isFinite(countRaw)
      ? Math.max(0, Math.floor(countRaw))
      : 0;

  let messages_remaining: number | null = null;
  if (o.messages_remaining === null || o.messages_remaining === undefined) {
    messages_remaining = null;
  } else if (
    typeof o.messages_remaining === "number" &&
    Number.isFinite(o.messages_remaining)
  ) {
    messages_remaining = Math.max(0, Math.floor(o.messages_remaining));
  }

  const restrictionRaw = asNullableString(o.restriction);
  const restriction: DirectMessagingRestriction | null =
    restrictionRaw === "waiting_for_reply" ||
    restrictionRaw === "blocked" ||
    restrictionRaw === "private"
      ? restrictionRaw
      : null;

  return {
    conversation_id,
    kind,
    unlocked: asBoolean(o.unlocked),
    can_send: asBoolean(o.can_send),
    qualifying_sent_count,
    messages_remaining,
    restriction,
    is_request: asBoolean(o.is_request),
  };
}

/**
 * R1B: read-only direct messaging access for composer UI.
 * Call for direct conversations only; groups should skip.
 */
export async function getDirectMessagingAccess(
  conversationId: string
): Promise<{ data: DirectMessagingAccess | null; error: unknown }> {
  try {
    const { data, error } = await supabase.rpc("get_direct_messaging_access", {
      p_conversation_id: conversationId,
    });

    if (error) {
      console.error("[getDirectMessagingAccess] RPC error:", error);
      return { data: null, error };
    }

    const parsed = parseDirectMessagingAccess(data);
    if (!parsed) {
      console.warn("[getDirectMessagingAccess] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return { data: parsed, error: null };
  } catch (err) {
    console.error("[getDirectMessagingAccess] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/** In-flight dedupe for list_my_conversations (keyed by auth user id). */
const listMyConversationsInflight = new Map<
  string,
  Promise<{ data: ListMyConversationsResult | null; error: unknown }>
>();

export function clearListMyConversationsInflight(): void {
  listMyConversationsInflight.clear();
}

async function listMyConversationsOnce(
  safeLimit: number
): Promise<{ data: ListMyConversationsResult | null; error: unknown }> {
  try {
    const { data, error } = await supabase.rpc("list_my_conversations", {
      p_limit: safeLimit,
    });

    if (error) {
      console.error("[listMyConversations] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const raw = o?.conversations;
    if (!o || !Array.isArray(raw)) {
      console.warn("[listMyConversations] Unexpected RPC shape");
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    const conversations: InboxConversationRow[] = [];
    for (const row of raw) {
      const parsed = parseInboxConversationRow(row);
      if (parsed) conversations.push(parsed);
    }

    return { data: { conversations }, error: null };
  } catch (err) {
    console.error("[listMyConversations] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Viewer inbox: active conversations with partner peek + unread + last-message summary.
 * Concurrent callers for the same auth user share one in-flight Promise.
 */
export async function listMyConversations(
  limit: number = DEFAULT_INBOX_LIMIT
): Promise<{ data: ListMyConversationsResult | null; error: unknown }> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), 50)
      : DEFAULT_INBOX_LIMIT;

  let viewerKey = "anon";
  try {
    const { data: authData } = await supabase.auth.getUser();
    const id = authData.user?.id?.trim();
    if (id) viewerKey = id;
  } catch {
    /* anon guard — still run once without sharing across users */
  }

  if (viewerKey === "anon") {
    return listMyConversationsOnce(safeLimit);
  }

  const existing = listMyConversationsInflight.get(viewerKey);
  if (existing) return existing;

  const promise = listMyConversationsOnce(safeLimit).finally(() => {
    listMyConversationsInflight.delete(viewerKey);
  });
  listMyConversationsInflight.set(viewerKey, promise);
  return promise;
}

/**
 * Toggle push mute for the caller's active membership (direct + group).
 */
export async function setConversationNotificationsMuted(
  conversationId: string,
  muted: boolean
): Promise<{
  data: SetConversationNotificationsMutedResult | null;
  error: unknown;
}> {
  try {
    const trimmed = (conversationId ?? "").trim();
    if (!trimmed) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc(
      "set_conversation_notifications_muted",
      {
        p_conversation_id: trimmed,
        p_muted: muted === true,
      }
    );

    if (error) {
      console.error("[setConversationNotificationsMuted] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id) || trimmed;
    if (!o) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        notifications_muted: asBoolean(o.notifications_muted),
      },
      error: null,
    };
  } catch (err) {
    console.error("[setConversationNotificationsMuted] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Viewer-local DM Delete chat: hide from inbox + clear prior history for this viewer.
 * Does not leave the conversation or delete shared messages.
 */
export async function hideDirectConversationForMe(
  conversationId: string
): Promise<{
  data: HideDirectConversationForMeResult | null;
  error: unknown;
}> {
  try {
    const trimmed = (conversationId ?? "").trim();
    if (!trimmed) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc(
      "hide_direct_conversation_for_me",
      {
        p_conversation_id: trimmed,
      }
    );

    if (error) {
      console.error("[hideDirectConversationForMe] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id) || trimmed;
    if (!o) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        hidden: asBoolean(o.hidden),
      },
      error: null,
    };
  } catch (err) {
    console.error("[hideDirectConversationForMe] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Viewer-local Group Delete chat: hide from inbox + clear prior history for this viewer.
 * Does not leave membership, dissolve the group, or delete shared messages.
 */
export async function hideGroupConversationForMe(
  conversationId: string
): Promise<{
  data: HideGroupConversationForMeResult | null;
  error: unknown;
}> {
  try {
    const trimmed = (conversationId ?? "").trim();
    if (!trimmed) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc(
      "hide_group_conversation_for_me",
      {
        p_conversation_id: trimmed,
      }
    );

    if (error) {
      console.error("[hideGroupConversationForMe] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id) || trimmed;
    if (!o) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        hidden: asBoolean(o.hidden),
      },
      error: null,
    };
  } catch (err) {
    console.error("[hideGroupConversationForMe] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Soft Delete group: set dissolved_at, close linked Group Ups, soft-leave all members.
 * Active conversation admin only. Idempotent for historical admin membership.
 */
export async function dissolveGroupConversation(
  conversationId: string
): Promise<{
  data: DissolveGroupConversationResult | null;
  error: unknown;
}> {
  try {
    const trimmed = (conversationId ?? "").trim();
    if (!trimmed) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc(
      "dissolve_group_conversation",
      {
        p_conversation_id: trimmed,
      }
    );

    if (error) {
      console.error("[dissolveGroupConversation] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id) || trimmed;
    if (!o) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        dissolved: asBoolean(o.dissolved),
      },
      error: null,
    };
  } catch (err) {
    console.error("[dissolveGroupConversation] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Mark conversation read through a seen tip. Null tip = server noop (no blind zero).
 * Uses FOR UPDATE + LEAST decrease on the server.
 */
export async function markConversationRead(
  conversationId: string,
  seenThrough?: MessageListCursor | null
): Promise<{ data: MarkConversationReadResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const createdAt = seenThrough?.created_at?.trim() || null;
    const id = seenThrough?.id?.trim() || null;
    if ((createdAt == null) !== (id == null)) {
      return {
        data: null,
        error: new Error("Invalid cursor: created_at and id are both required"),
      };
    }

    // Client must not call with nothing seen; skip network for null tip.
    if (!createdAt || !id) {
      return {
        data: {
          conversation_id: trimmedConversationId,
          unread_count: 0,
          updated: false,
        },
        error: null,
      };
    }

    const { data, error } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: trimmedConversationId,
      p_seen_through_created_at: createdAt,
      p_seen_through_id: id,
    });

    if (error) {
      console.error("[markConversationRead] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    if (!o || !conversation_id) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }
    const unreadRaw = o.unread_count;
    const unread_count =
      typeof unreadRaw === "number" && Number.isFinite(unreadRaw)
        ? Math.max(0, Math.floor(unreadRaw))
        : 0;

    return {
      data: {
        conversation_id,
        unread_count,
        updated: asBoolean(o.updated),
      },
      error: null,
    };
  } catch (err) {
    console.error("[markConversationRead] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/** Parse a Realtime messages INSERT payload into MessageRow when possible. */
export function parseRealtimeMessageRow(raw: unknown): MessageRow | null {
  const parsed = parseMessageRow(raw);
  if (parsed) return parsed;

  const o = asRecord(raw);
  if (!o) return null;
  const id = asString(o.id);
  const conversation_id = asString(o.conversation_id);
  const sender_user_id = asString(o.sender_user_id);
  const created_at = asString(o.created_at);
  if (!id || !conversation_id || !sender_user_id || !created_at) return null;

  const body = typeof o.body === "string" ? o.body : "";
  const client_message_id = asString(o.client_message_id) || id;
  const kindRaw = asString(o.message_kind);
  const message_kind = parseMessageKind(kindRaw);
  if (!message_kind) return null;

  let reference_type: MessageReferenceType | null = null;
  let reference_id: string | null = null;
  let reference_snapshot: SharedPostSnapshot | MatchContextSnapshot | null =
    null;
  if (message_kind === "shared_post") {
    const refType = asString(o.reference_type);
    const refId = asString(o.reference_id);
    const snap = parseSharedPostSnapshot(o.reference_snapshot);
    if (refType === "post" && refId) {
      reference_type = "post";
      reference_id = refId;
      reference_snapshot = snap;
    }
  } else if (message_kind === "match_context") {
    const refType = asString(o.reference_type);
    const refId = asString(o.reference_id);
    const snap = parseMatchContextSnapshot(o.reference_snapshot);
    if (
      (refType === "open_plan_request" || refType === "pair_up_match") &&
      refId &&
      snap
    ) {
      reference_type = refType;
      reference_id = refId;
      reference_snapshot = snap;
    } else {
      return null;
    }
  }

  return {
    id,
    conversation_id,
    sender_user_id,
    body,
    client_message_id,
    created_at,
    message_kind,
    reference_type,
    reference_id,
    reference_snapshot,
  };
}

function parseConversationMemberRow(raw: unknown): ConversationMemberRow | null {
  const o = asRecord(raw);
  if (!o) return null;
  const user_id = asString(o.user_id);
  const role = asString(o.role);
  const joined_at = asString(o.joined_at);
  if (!user_id || !role || !joined_at) return null;
  return {
    user_id,
    role,
    joined_at,
    display_name: asNullableString(o.display_name),
    username: asNullableString(o.username),
    avatar_url: asNullableString(o.avatar_url),
  };
}

/**
 * Create a persistent group conversation (creator admin; ≥2 other members).
 */
export async function createGroupConversation(
  title: string,
  memberUserIds: string[]
): Promise<{ data: CreateGroupConversationResult | null; error: unknown }> {
  try {
    const trimmedTitle = (title ?? "").trim();
    if (!trimmedTitle) {
      return { data: null, error: new Error("Group title is required") };
    }

    const ids = [
      ...new Set(
        (memberUserIds ?? [])
          .map((id) => (id ?? "").trim())
          .filter((id) => id.length > 0)
      ),
    ];

    const { data, error } = await supabase.rpc("create_group_conversation", {
      p_title: trimmedTitle,
      p_member_user_ids: ids,
    });

    if (error) {
      console.error("[createGroupConversation] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const resultTitle = asString(o?.title);
    const member_count = asNonNegInt(o?.member_count);
    if (!o || !conversation_id || !resultTitle || member_count == null) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        kind: asString(o.kind) || "group",
        title: resultTitle,
        member_count,
        created: asBoolean(o.created),
      },
      error: null,
    };
  } catch (err) {
    console.error("[createGroupConversation] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Admin: add or reactivate group members (fresh period on rejoin).
 */
export async function addConversationMembers(
  conversationId: string,
  userIds: string[]
): Promise<{ data: AddConversationMembersResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const ids = [
      ...new Set(
        (userIds ?? [])
          .map((id) => (id ?? "").trim())
          .filter((id) => id.length > 0)
      ),
    ];

    const { data, error } = await supabase.rpc("add_conversation_members", {
      p_conversation_id: trimmedConversationId,
      p_user_ids: ids,
    });

    if (error) {
      console.error("[addConversationMembers] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const member_count = asNonNegInt(o?.member_count);
    if (!o || !conversation_id || member_count == null) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        added_user_ids: asUuidArray(o.added_user_ids),
        member_count,
      },
      error: null,
    };
  } catch (err) {
    console.error("[addConversationMembers] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Admin: remove another active group member.
 */
export async function removeConversationMember(
  conversationId: string,
  userId: string
): Promise<{ data: RemoveConversationMemberResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    const trimmedUserId = (userId ?? "").trim();
    if (!trimmedConversationId || !trimmedUserId) {
      return { data: null, error: new Error("Missing conversation or user id") };
    }

    const { data, error } = await supabase.rpc("remove_conversation_member", {
      p_conversation_id: trimmedConversationId,
      p_user_id: trimmedUserId,
    });

    if (error) {
      console.error("[removeConversationMember] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const removed_user_id = asString(o?.removed_user_id);
    const member_count = asNonNegInt(o?.member_count);
    if (!o || !conversation_id || !removed_user_id || member_count == null) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: { conversation_id, removed_user_id, member_count },
      error: null,
    };
  } catch (err) {
    console.error("[removeConversationMember] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Leave a group conversation (last-admin auto-promotes).
 */
export async function leaveConversation(
  conversationId: string
): Promise<{ data: LeaveConversationResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc("leave_conversation", {
      p_conversation_id: trimmedConversationId,
    });

    if (error) {
      console.error("[leaveConversation] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const member_count = asNonNegInt(o?.member_count);
    if (!o || !conversation_id || member_count == null) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        left: asBoolean(o.left),
        member_count,
      },
      error: null,
    };
  } catch (err) {
    console.error("[leaveConversation] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Admin: rename a group conversation.
 */
export async function renameGroupConversation(
  conversationId: string,
  title: string
): Promise<{ data: RenameGroupConversationResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    const trimmedTitle = (title ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }
    if (!trimmedTitle) {
      return { data: null, error: new Error("Group title is required") };
    }

    const { data, error } = await supabase.rpc("rename_group_conversation", {
      p_conversation_id: trimmedConversationId,
      p_title: trimmedTitle,
    });

    if (error) {
      console.error("[renameGroupConversation] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const resultTitle = asString(o?.title);
    if (!o || !conversation_id || !resultTitle) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: { conversation_id, title: resultTitle },
      error: null,
    };
  } catch (err) {
    console.error("[renameGroupConversation] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * Admin: atomically update group title + optional description (max 200).
 * Always send both fields; whitespace-only description clears to null.
 */
export async function updateGroupDetails(
  conversationId: string,
  title: string,
  description: string | null
): Promise<{ data: UpdateGroupDetailsResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    const trimmedTitle = (title ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }
    if (!trimmedTitle) {
      return { data: null, error: new Error("Group title is required") };
    }

    const trimmedDescription =
      description == null ? null : description.trim() || null;

    const { data, error } = await supabase.rpc("update_group_details", {
      p_conversation_id: trimmedConversationId,
      p_title: trimmedTitle,
      p_description: trimmedDescription,
    });

    if (error) {
      console.error("[updateGroupDetails] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const conversation_id = asString(o?.conversation_id);
    const resultTitle = asString(o?.title);
    if (!o || !conversation_id || !resultTitle) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    // Absent or JSON null → null; otherwise require a string.
    const rawDesc = o.description;
    let resultDescription: string | null;
    if (rawDesc === null || rawDesc === undefined) {
      resultDescription = null;
    } else if (typeof rawDesc === "string") {
      resultDescription = rawDesc.length > 0 ? rawDesc : null;
    } else {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    return {
      data: {
        conversation_id,
        title: resultTitle,
        description: resultDescription,
      },
      error: null,
    };
  } catch (err) {
    console.error("[updateGroupDetails] Unexpected error:", err);
    return { data: null, error: err };
  }
}

/**
 * List active group members with profile peek (caller must be a member).
 */
export async function listConversationMembers(
  conversationId: string
): Promise<{ data: ListConversationMembersResult | null; error: unknown }> {
  try {
    const trimmedConversationId = (conversationId ?? "").trim();
    if (!trimmedConversationId) {
      return { data: null, error: new Error("Missing conversation id") };
    }

    const { data, error } = await supabase.rpc("list_conversation_members", {
      p_conversation_id: trimmedConversationId,
    });

    if (error) {
      console.error("[listConversationMembers] RPC error:", error);
      return { data: null, error };
    }

    const o = asRecord(data);
    const raw = o?.members;
    if (!o || !Array.isArray(raw)) {
      return {
        data: null,
        error: { message: "Unexpected RPC response shape" },
      };
    }

    const members: ConversationMemberRow[] = [];
    for (const row of raw) {
      const parsed = parseConversationMemberRow(row);
      if (parsed) members.push(parsed);
    }

    return { data: { members }, error: null };
  } catch (err) {
    console.error("[listConversationMembers] Unexpected error:", err);
    return { data: null, error: err };
  }
}
