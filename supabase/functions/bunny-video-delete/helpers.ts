/**
 * Pure helpers for bunny-video-delete (testable without Deno.serve).
 */

export const LOG_PREFIX = "[bunny-video-delete]";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VideoDeleteRequest = {
  publishPostId: string;
  mediaId: string;
};

export type ValidationResult =
  | { ok: true; data: VideoDeleteRequest }
  | { ok: false; error: string; status: number };

export type PostMediaDeleteRow = {
  id: string;
  publish_post_id: string;
  owner_user_id: string;
  post_id: string | null;
  bunny_video_id: string;
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateVideoDeleteRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  const record = body as Record<string, unknown>;
  const publishPostId =
    typeof record.publishPostId === "string"
      ? record.publishPostId.trim()
      : "";
  const mediaId =
    typeof record.mediaId === "string" ? record.mediaId.trim() : "";

  if (!isUuid(publishPostId)) {
    return { ok: false, error: "Invalid publishPostId", status: 400 };
  }
  if (!isUuid(mediaId)) {
    return { ok: false, error: "Invalid mediaId", status: 400 };
  }

  return { ok: true, data: { publishPostId, mediaId } };
}

export function canDeleteUnattachedCreateMedia(
  row: PostMediaDeleteRow,
  actorUserId: string,
  publishPostId: string,
  mediaId: string,
):
  | { ok: true }
  | { ok: false; error: string; status: number } {
  if (row.id !== mediaId) {
    return { ok: false, error: "Media not found", status: 404 };
  }
  if (row.publish_post_id !== publishPostId) {
    return { ok: false, error: "Media not found", status: 404 };
  }
  if (row.owner_user_id !== actorUserId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  if (row.post_id != null) {
    return {
      ok: false,
      error: "Published media cannot be removed here",
      status: 409,
    };
  }
  return { ok: true };
}

export function isBunnyDeleteNotFoundStatus(status: number): boolean {
  return status === 404 || status === 410;
}
