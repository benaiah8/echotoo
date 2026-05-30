import type { InviteThreadParticipant } from "../../../api/services/inviteThreads";

const MENTION_QUERY_RE = /^[\w.-]*$/;
const MENTION_VISIBLE_LIMIT = 5;

export type ActiveMentionToken = {
  /** Index of `@` in the full value */
  atIndex: number;
  /** Query characters between `@` and caret (may be empty) */
  query: string;
};

/**
 * If the caret sits inside an active @-mention token, return its span.
 * Active @ is at line/text start or after whitespace/newline; query is word chars only until caret.
 */
export function parseActiveMentionQuery(
  value: string,
  caret: number,
): ActiveMentionToken | null {
  const end = Math.min(caret, value.length);
  const before = value.slice(0, end);

  let atIndex = -1;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== "@") continue;
    const prev = i === 0 ? "\n" : before[i - 1];
    if (!/[\s\n]/.test(prev)) continue;
    const afterAt = before.slice(i + 1);
    if (!MENTION_QUERY_RE.test(afterAt)) continue;
    atIndex = i;
  }

  if (atIndex === -1) return null;
  const query = before.slice(atIndex + 1);
  if (!MENTION_QUERY_RE.test(query)) return null;
  return { atIndex, query };
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** `@username ` or best-effort from display name; never empty. */
export function mentionInsertForParticipant(p: InviteThreadParticipant): string {
  const u = (p.username ?? "").trim();
  if (u) return `@${u} `;
  const d = (p.display_name ?? "").trim();
  if (d) {
    const slug = d.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
    if (slug) return `@${slug} `;
    return `@${d} `;
  }
  return "@member ";
}

export function filterMentionParticipants(
  participants: InviteThreadParticipant[],
  viewerUserId: string | null,
  query: string,
  limit = MENTION_VISIBLE_LIMIT,
): InviteThreadParticipant[] {
  const q = norm(query);
  const filtered = participants.filter((p) => {
    const uid = (p.user_id ?? "").trim();
    if (viewerUserId && uid && uid === viewerUserId.trim()) return false;
    if (!q) return true;
    const u = norm(p.username);
    const d = norm(p.display_name);
    return (
      (u && (u.startsWith(q) || u.includes(q))) ||
      (d && (d.startsWith(q) || d.includes(q)))
    );
  });
  return filtered.slice(0, limit);
}
