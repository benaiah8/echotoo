/**
 * Client-only inbox display filters for Messages M1A.
 * Does not mutate cache or change RPCs — empty DMs stay in cache, just hidden in UI.
 */

import type { InboxConversationRow } from "../api/services/messaging";

/** Hide directs with no messages yet; keep empty groups. */
export function eligibleInboxConversations(
  rows: InboxConversationRow[]
): InboxConversationRow[] {
  return rows.filter((row) => {
    if (row.kind === "group") return true;
    const at = row.last_message_at;
    return typeof at === "string" && at.trim().length > 0;
  });
}

function inboxSearchHaystack(row: InboxConversationRow): string {
  if (row.kind === "group") {
    return (row.title ?? "").trim().toLowerCase();
  }
  const parts = [row.display_name, row.username]
    .map((s) => (s ?? "").trim().toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

/** Case-insensitive local match on DM name/username or group title. */
export function filterInboxByQuery(
  rows: InboxConversationRow[],
  query: string
): InboxConversationRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => inboxSearchHaystack(row).includes(q));
}
