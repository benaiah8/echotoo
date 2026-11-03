/**
 * Pure helpers for DM thread list merge / dedupe (open reconcile + load older).
 */

import type {
  MessageListCursor,
  MessageRow,
} from "../api/services/messaging";

export function messageKey(m: MessageRow): string {
  return m.id || m.client_message_id;
}

/** Prepend older chronological page; skip rows already present by id / client id. */
export function dedupePrepend(
  existing: MessageRow[],
  olderChronological: MessageRow[]
): MessageRow[] {
  const seen = new Set(existing.map(messageKey));
  const toAdd: MessageRow[] = [];
  for (const m of olderChronological) {
    const key = messageKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    toAdd.push(m);
  }
  return [...toAdd, ...existing];
}

/**
 * Merge newest chronological page into existing list; keep older session pages.
 * Dedupes by server id and client_message_id (via messageKey).
 */
export function mergeNewestPage(
  existing: MessageRow[],
  newestChronological: MessageRow[]
): MessageRow[] {
  if (newestChronological.length === 0) return existing;
  const byKey = new Map<string, MessageRow>();
  for (const m of existing) byKey.set(messageKey(m), m);
  for (const m of newestChronological) byKey.set(messageKey(m), m);
  const merged = Array.from(byKey.values());
  merged.sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    if (at !== bt) return at - bt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return merged;
}

export function tipFromMessages(
  messages: MessageRow[]
): MessageListCursor | null {
  if (messages.length === 0) return null;
  const tip = messages[messages.length - 1];
  return { created_at: tip.created_at, id: tip.id };
}
