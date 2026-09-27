/**
 * Map held inbox rows → Compose PeopleGrid people (recent DM counterparts).
 * No RPCs — uses already-loaded inbox data only.
 */

import type { InboxConversationRow } from "../../api/services/messaging";
import type { PeopleGridPerson } from "../../components/people/PeopleGridItem";

function identityLabel(row: InboxConversationRow): string {
  return (
    row.display_name?.trim() ||
    row.username?.trim() ||
    "Member"
  );
}

/**
 * Direct conversations with at least one message, newest first.
 * Dedupe by other_user_id.
 */
export function inboxDirectsToComposePeople(
  rows: InboxConversationRow[]
): PeopleGridPerson[] {
  const seen = new Set<string>();
  const directs = rows
    .filter((r) => {
      if (r.kind === "group") return false;
      const uid = (r.other_user_id ?? "").trim();
      if (!uid) return false;
      const at = r.last_message_at;
      return typeof at === "string" && at.trim().length > 0;
    })
    .slice()
    .sort((a, b) => {
      const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bt - at;
    });

  const out: PeopleGridPerson[] = [];
  for (const r of directs) {
    const id = (r.other_user_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      displayName: identityLabel(r),
      username: r.username,
      avatarUrl: r.avatar_url,
    });
  }
  return out;
}
