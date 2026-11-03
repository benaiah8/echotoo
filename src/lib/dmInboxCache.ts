/**
 * Phase 3 / M1D — bounded in-memory inbox list cache (SWR).
 * Memory only. Server listMyConversations remains source of truth.
 */

import type { InboxConversationRow } from "../api/services/messaging";
import {
  removeGroupConversationIdentity,
  seedGroupIdentitiesFromInbox,
} from "./groupConversationIdentityCache";

/** Sort key: message activity, or creation time when no messages yet. */
export function inboxConversationSortAt(row: InboxConversationRow): number {
  const raw = row.last_message_at || row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

export type DmInboxCacheEntry = {
  conversations: InboxConversationRow[];
  updatedAt: number;
};

/** No list RPC while younger than this. */
export const DM_INBOX_FRESH_MS = 45_000;
/** Paint + silent revalidate while younger than this; do not wipe rows. */
export const DM_INBOX_STALE_USABLE_MS = 5 * 60_000;

const store = new Map<string, DmInboxCacheEntry>();

function viewerKey(viewerUserId: string): string {
  return (viewerUserId ?? "").trim();
}

function ageMs(entry: DmInboxCacheEntry): number {
  return Math.max(0, Date.now() - entry.updatedAt);
}

export function isDmInboxFresh(entry: DmInboxCacheEntry): boolean {
  return ageMs(entry) < DM_INBOX_FRESH_MS;
}

export function isDmInboxUsable(entry: DmInboxCacheEntry): boolean {
  return ageMs(entry) < DM_INBOX_STALE_USABLE_MS;
}

/** Returns entry if present (even stale). Does not delete on age. */
export function getDmInboxCache(
  viewerUserId: string
): DmInboxCacheEntry | null {
  const key = viewerKey(viewerUserId);
  if (!key) return null;
  return store.get(key) ?? null;
}

export function setDmInboxCache(
  viewerUserId: string,
  conversations: InboxConversationRow[]
): void {
  const key = viewerKey(viewerUserId);
  if (!key) return;
  store.clear();
  store.set(key, {
    conversations: [...conversations],
    updatedAt: Date.now(),
  });
  seedGroupIdentitiesFromInbox(key, conversations);
}

export function clearDmInboxCache(): void {
  store.clear();
}

export function patchDmInboxUnread(
  viewerUserId: string,
  conversationId: string,
  unreadCount: number
): InboxConversationRow[] | null {
  const entry = getDmInboxCache(viewerUserId);
  if (!entry) return null;
  const id = conversationId.trim();
  const next = entry.conversations.map((row) =>
    row.conversation_id === id
      ? { ...row, unread_count: Math.max(0, Math.floor(unreadCount)) }
      : row
  );
  setDmInboxCache(viewerUserId, next);
  return next;
}

export function patchDmInboxNotificationsMuted(
  viewerUserId: string,
  conversationId: string,
  notificationsMuted: boolean
): InboxConversationRow[] | null {
  const entry = getDmInboxCache(viewerUserId);
  if (!entry) return null;
  const id = conversationId.trim();
  if (!id) return null;
  let found = false;
  const next = entry.conversations.map((row) => {
    if (row.conversation_id !== id) return row;
    found = true;
    return { ...row, notifications_muted: notificationsMuted === true };
  });
  if (!found) return null;
  setDmInboxCache(viewerUserId, next);
  return next;
}

/** Drop a conversation from the viewer inbox list. */
export function removeDmInboxConversation(
  viewerUserId: string,
  conversationId: string,
  opts?: { preserveGroupIdentity?: boolean }
): InboxConversationRow[] | null {
  const entry = getDmInboxCache(viewerUserId);
  if (!entry) return null;
  const id = conversationId.trim();
  if (!id) return null;
  const next = entry.conversations.filter((row) => row.conversation_id !== id);
  if (next.length === entry.conversations.length) return null;
  // Leave / DM delete clear identity; Group Delete chat keeps membership caches.
  if (opts?.preserveGroupIdentity !== true) {
    removeGroupConversationIdentity(viewerUserId, id);
  }
  setDmInboxCache(viewerUserId, next);
  return next;
}

export function patchDmInboxConversationSummary(
  viewerUserId: string,
  conversationId: string,
  patch: Partial<
    Pick<
      InboxConversationRow,
      | "last_message_at"
      | "last_message_preview"
      | "last_message_sender_id"
      | "is_last_from_me"
    >
  >
): InboxConversationRow[] | null {
  const entry = getDmInboxCache(viewerUserId);
  if (!entry) return null;
  const id = conversationId.trim();
  let found = false;
  const next = entry.conversations.map((row) => {
    if (row.conversation_id !== id) return row;
    found = true;
    return { ...row, ...patch };
  });
  if (!found) return null;

  next.sort((a, b) => {
    const at = inboxConversationSortAt(a);
    const bt = inboxConversationSortAt(b);
    if (bt !== at) return bt - at;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

  setDmInboxCache(viewerUserId, next);
  return next;
}

/**
 * A known direct with no messages yet can become a Request on the first
 * inbound text or shared_post. The server classifies that; the client must
 * reload instead of trusting is_request: false. Later messages, groups, and
 * the viewer's own send are stable and must not reload.
 * A null sender is an unread bump from the other person.
 */
export function knownDirectInboundNeedsAuthoritativeRequestRefresh(
  row:
    | Pick<InboxConversationRow, "kind" | "is_request" | "last_message_at">
    | undefined,
  incomingSenderId: string | null,
  viewerUserId: string
): boolean {
  if (!row || row.kind !== "direct" || row.is_request) return false;
  const at = row.last_message_at;
  if (typeof at === "string" && at.trim().length > 0) return false;
  const viewer = viewerUserId.trim();
  if (!viewer) return false;
  const sender = (incomingSenderId ?? "").trim();
  if (sender && sender === viewer) return false;
  return true;
}

/** Confirmed qualifying reply only. Opening or a failed send must not call this. */
export function shouldPromoteRequestAfterReply(input: {
  wasRequest: boolean;
  delivered: boolean;
  messageKind: string;
}): boolean {
  if (!input.delivered || !input.wasRequest) return false;
  return input.messageKind === "text" || input.messageKind === "shared_post";
}

/** In-place classification update. Does not insert a row. Groups stay unchanged. */
export function patchDmInboxIsRequest(
  viewerUserId: string,
  conversationId: string,
  isRequest: boolean
): InboxConversationRow[] | null {
  const entry = getDmInboxCache(viewerUserId);
  if (!entry) return null;
  const id = conversationId.trim();
  if (!id) return null;
  let found = false;
  let changed = false;
  const next = entry.conversations.map((row) => {
    if (row.conversation_id !== id) return row;
    found = true;
    if (row.kind === "group" || row.is_request === isRequest) return row;
    changed = true;
    return { ...row, is_request: isRequest };
  });
  if (!found) return null;
  if (changed) setDmInboxCache(viewerUserId, next);
  return next;
}
