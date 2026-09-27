/**
 * Canonical post_media.id for posts.media_order video items (PV1 / PV1.1).
 * Never Bunny video ids, draft localIds, or placeholder tokens.
 */

import { LOCAL_DRAFT_VIDEO_MEDIA_ID } from "./createDraftVideo/types";

export const PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE =
  "Published video mediaId is required when media order includes video.";

/** User-facing copy when the invariant trips; technical message stays in console. */
export const GENERIC_PUBLISH_FAILED_MESSAGE = "Publish failed";

export const PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE =
  "Published media_order must include video when an active draft video exists.";

export function isPublishedVideoMediaIdRequiredError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message === PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE
  );
}

export function isPublishedVideoOrderRequiredError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message === PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE
  );
}

/**
 * Accept only a real remote post_media.id.
 * Rejects placeholders and empty values.
 */
export function isCanonicalPublishedVideoMediaId(
  value: string | null | undefined,
): value is string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return false;
  if (
    id === LOCAL_DRAFT_VIDEO_MEDIA_ID ||
    id === "pending" ||
    id === "error" ||
    id === "draft-local"
  ) {
    return false;
  }
  return true;
}

/**
 * Resolve publishedVideoMediaId for the current Publish transaction.
 * Prefer explicitly returned upload mediaId (synchronous), then draft remote,
 * then job mediaId — never wait on React state flush.
 */
export function resolvePublishedVideoMediaId(options: {
  /** From createPublishVideoUpload / uploadVideoForPublish return value. */
  uploadResultMediaId?: string | null;
  /** draftVideo.remoteMediaId (localStorage; sync). */
  draftRemoteMediaId?: string | null;
  /** videoJob.mediaId — may be stale; last resort. */
  videoJobMediaId?: string | null;
}): string | null {
  const candidates = [
    options.uploadResultMediaId,
    options.draftRemoteMediaId,
    options.videoJobMediaId,
  ];
  for (const raw of candidates) {
    if (isCanonicalPublishedVideoMediaId(raw)) {
      return raw.trim();
    }
  }
  return null;
}
