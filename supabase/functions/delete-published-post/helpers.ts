/**
 * Pure helpers for delete-published-post (testable without Deno.serve).
 */

export const LOG_PREFIX = "[delete-published-post]";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DeletePublishedPostRequest = {
  postId: string;
};

export type ValidationResult =
  | { ok: true; data: DeletePublishedPostRequest }
  | { ok: false; error: string; status: number };

export type PostDeleteRow = {
  id: string;
  author_id: string;
  type?: string | null;
  status?: string | null;
  caption?: string | null;
};

export type AttachedVideoMediaRow = {
  id: string;
  bunny_video_id: string | null;
  kind?: string | null;
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateDeletePublishedPostRequest(
  body: unknown,
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  const record = body as Record<string, unknown>;
  const postId =
    typeof record.postId === "string" ? record.postId.trim() : "";

  if (!isUuid(postId)) {
    return { ok: false, error: "Invalid postId", status: 400 };
  }

  return { ok: true, data: { postId } };
}

export function isBunnyDeleteNotFoundStatus(status: number): boolean {
  return status === 404 || status === 410;
}

/**
 * Owner of the post, or report reviewer (admin moderation).
 * Does not leak whether a missing post exists — caller handles missing first.
 */
export function canDeletePublishedPost(
  post: PostDeleteRow,
  actorUserId: string,
  isReportReviewer: boolean,
): { ok: true; mode: "owner" | "admin" } | { ok: false; status: number } {
  if (post.author_id === actorUserId) {
    return { ok: true, mode: "owner" };
  }
  if (isReportReviewer) {
    return { ok: true, mode: "admin" };
  }
  return { ok: false, status: 403 };
}

/** Collect non-empty Bunny video ids from attached post_media (0..N). */
export function collectAttachedBunnyVideoIds(
  rows: AttachedVideoMediaRow[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = typeof row.bunny_video_id === "string"
      ? row.bunny_video_id.trim()
      : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Bunny must succeed (including 404/already gone) before DB delete.
 * Any hard Bunny failure blocks DB deletion.
 */
export function bunnyDeletesAllowDbDelete(
  results: Array<{ ok: boolean }>,
): boolean {
  return results.every((r) => r.ok);
}

/** Generic client-facing failure — never Bunny/HTTP details. */
export const DELETE_PUBLISHED_POST_USER_ERROR =
  "Couldn't delete the post. Try again.";
