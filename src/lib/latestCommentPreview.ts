/**
 * Compact latest top-level comment preview bundled by list RPCs
 * (`latest_comment_preview` on Home / Created / Saved).
 */

export type LatestCommentPreview = {
  id: string;
  author_label: string;
  text: string;
};

export function normalizeLatestCommentPreview(
  raw: unknown,
): LatestCommentPreview | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const authorLabel =
    typeof obj.author_label === "string" ? obj.author_label.trim() : "";
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!id || !authorLabel || !text) return null;
  return {
    id,
    author_label: authorLabel,
    text: text.length > 160 ? text.slice(0, 160) : text,
  };
}

/** Display-name → username → Unknown User (matches RPC + Comment.tsx). */
export function buildCommentAuthorLabel(input: {
  display_name?: string | null;
  username?: string | null;
}): string {
  const display = (input.display_name ?? "").trim();
  if (display) return display;
  const username = (input.username ?? "").trim();
  if (username) return username;
  return "Unknown User";
}
