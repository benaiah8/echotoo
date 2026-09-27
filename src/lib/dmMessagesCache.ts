/**
 * Phase 2 / M1D — bounded in-memory newest-window cache for DM threads.
 * Memory only; keyed by viewer + conversation. Server remains source of truth.
 */

import type {
  MessageListCursor,
  MessageRow,
} from "../api/services/messaging";

export type DmMessagesCacheEntry = {
  messages: MessageRow[];
  hasMoreOlder: boolean;
  olderCursor: MessageListCursor | null;
  updatedAt: number;
};

const MAX_CONVERSATIONS = 5;
const MAX_MESSAGES_PER_ENTRY = 60;

/** No first-page list_messages while younger than this. */
export const DM_MESSAGES_FRESH_MS = 60_000;
/** Paint + silent merge while younger than this. */
export const DM_MESSAGES_STALE_USABLE_MS = 5 * 60_000;

const store = new Map<string, DmMessagesCacheEntry>();

function cacheKey(viewerUserId: string, conversationId: string): string | null {
  const viewer = (viewerUserId ?? "").trim();
  const id = (conversationId ?? "").trim();
  if (!viewer || !id) return null;
  return `${viewer}:${id}`;
}

function ageMs(entry: DmMessagesCacheEntry): number {
  return Math.max(0, Date.now() - entry.updatedAt);
}

export function isDmMessagesFresh(entry: DmMessagesCacheEntry): boolean {
  return ageMs(entry) < DM_MESSAGES_FRESH_MS;
}

export function isDmMessagesUsable(entry: DmMessagesCacheEntry): boolean {
  return ageMs(entry) < DM_MESSAGES_STALE_USABLE_MS;
}

function trimOldest(messages: MessageRow[]): MessageRow[] {
  if (messages.length <= MAX_MESSAGES_PER_ENTRY) return messages;
  return messages.slice(messages.length - MAX_MESSAGES_PER_ENTRY);
}

function touchOrder(key: string, entry: DmMessagesCacheEntry) {
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_CONVERSATIONS) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

/** Returns entry if present (even stale). Does not delete on age. */
export function getDmMessagesCache(
  viewerUserId: string,
  conversationId: string
): DmMessagesCacheEntry | null {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return null;
  return store.get(key) ?? null;
}

export function setDmMessagesCache(
  viewerUserId: string,
  conversationId: string,
  messages: MessageRow[],
  hasMoreOlder: boolean,
  olderCursor: MessageListCursor | null
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  const entry: DmMessagesCacheEntry = {
    messages: trimOldest(messages),
    hasMoreOlder,
    olderCursor,
    updatedAt: Date.now(),
  };
  touchOrder(key, entry);
}

export function appendDmMessageCache(
  viewerUserId: string,
  conversationId: string,
  message: MessageRow
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  const existing = store.get(key);
  if (!existing) return;

  const already = existing.messages.some(
    (m) =>
      m.id === message.id ||
      (message.client_message_id &&
        m.client_message_id === message.client_message_id)
  );
  if (already) {
    touchOrder(key, { ...existing, updatedAt: Date.now() });
    return;
  }

  touchOrder(key, {
    messages: trimOldest([...existing.messages, message]),
    hasMoreOlder: existing.hasMoreOlder,
    olderCursor: existing.olderCursor,
    updatedAt: Date.now(),
  });
}

/** Drop one thread after viewer-local DM delete (or leave). */
export function removeDmMessagesCache(
  viewerUserId: string,
  conversationId: string
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  store.delete(key);
}

export function clearDmMessagesCache(): void {
  store.clear();
}

export function clearAllDmMessagingCaches(): void {
  clearDmMessagesCache();
}
