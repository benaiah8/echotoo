/**
 * Pure helpers for bunny-upload-init (testable without Deno.serve).
 */

export const LOG_PREFIX = "[bunny-upload-init]";

export const MAX_VIDEO_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_NAME_LEN = 255;
export const MAX_ACTIVE_UNATTACHED_VIDEOS = 3;
export const VIDEO_SLOT_SORT_ORDER = 0;
export const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
export const TUS_AUTH_TTL_SECONDS = 6 * 60 * 60;

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const REUSABLE_VIDEO_STATUSES = [
  "pending",
  "uploading",
  "processing",
] as const;

export const ACTIVE_UNATTACHED_STATUSES = [
  "pending",
  "uploading",
  "processing",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UploadInitRequest = {
  publishPostId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Optional owner-scoped media-bucket poster object key (not a URL). */
  posterStoragePath?: string | null;
};

export type ValidationResult =
  | { ok: true; data: UploadInitRequest }
  | { ok: false; error: string; status: number };

export type PostMediaVideoStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export type UploadInitSuccessBody = {
  mediaId: string;
  videoId: string;
  libraryId: string;
  videoStatus: PostMediaVideoStatus;
  uploadRequired: boolean;
  tusEndpoint?: string;
  authorizationExpire?: number;
  authorizationSignature?: string;
  reused?: boolean;
};

export type ExistingSlotAction =
  | { kind: "reuse_upload" }
  | { kind: "reuse_no_upload" }
  | { kind: "reject_failed" };

export function isPostMediaVideoStatus(
  value: string,
): value is PostMediaVideoStatus {
  return (
    value === "pending" ||
    value === "uploading" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  );
}

export function isUploadRequiredForVideoStatus(
  videoStatus: PostMediaVideoStatus,
): boolean {
  return videoStatus === "pending" || videoStatus === "uploading";
}

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

const POSTER_EXT_RE = /\.(webp|jpg|jpeg|png)$/i;

/**
 * Validate optional posterStoragePath for bunny-upload-init.
 * Must be `{auth.uid()}/post/{file}.{webp|jpg|jpeg|png}` — never a URL.
 */
export function validatePosterStoragePath(
  raw: unknown,
  ownerUserId: string,
): { ok: true; path: string | null } | { ok: false; error: string; status: number } {
  if (raw == null || raw === "") {
    return { ok: true, path: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Invalid posterStoragePath", status: 400 };
  }
  const path = raw.trim().replace(/^\/+/, "");
  if (!path) return { ok: true, path: null };
  if (
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("://") ||
    path.startsWith("http")
  ) {
    return { ok: false, error: "Invalid posterStoragePath", status: 400 };
  }
  const uid = ownerUserId.trim();
  const prefix = `${uid}/post/`;
  if (!uid || !path.startsWith(prefix)) {
    return { ok: false, error: "Invalid posterStoragePath", status: 403 };
  }
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes("/") || !POSTER_EXT_RE.test(rest)) {
    return { ok: false, error: "Invalid posterStoragePath", status: 400 };
  }
  if (!/^[a-zA-Z0-9._-]+$/i.test(rest)) {
    return { ok: false, error: "Invalid posterStoragePath", status: 400 };
  }
  return { ok: true, path };
}

/** Derive public media-bucket URL for a validated storage path. */
export function buildMediaBucketPublicUrl(
  supabaseUrl: string,
  storagePath: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = storagePath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/media/${path}`;
}

export function validateUploadInitRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  const record = body as Record<string, unknown>;
  const publishPostId =
    typeof record.publishPostId === "string" ? record.publishPostId.trim() : "";
  const fileName =
    typeof record.fileName === "string" ? record.fileName.trim() : "";
  const mimeType =
    typeof record.mimeType === "string" ? record.mimeType.trim().toLowerCase() : "";
  const fileSize = record.fileSize;
  const posterStoragePathRaw = record.posterStoragePath;

  if (!publishPostId || !isValidUuid(publishPostId)) {
    return { ok: false, error: "Invalid publishPostId", status: 400 };
  }

  if (typeof fileSize !== "number" || !Number.isFinite(fileSize)) {
    return { ok: false, error: "Invalid fileSize", status: 400 };
  }

  if (fileSize <= 0) {
    return { ok: false, error: "fileSize must be greater than 0", status: 400 };
  }

  if (fileSize > MAX_VIDEO_FILE_BYTES) {
    return { ok: false, error: "fileSize exceeds 200MB limit", status: 400 };
  }

  if (!mimeType || !ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: "Unsupported mimeType", status: 400 };
  }

  if (!fileName || fileName.length > MAX_FILE_NAME_LEN) {
    return { ok: false, error: "Invalid fileName", status: 400 };
  }

  // Poster path ownership is validated later with auth.uid(); here only shape.
  let posterStoragePath: string | null | undefined;
  if (posterStoragePathRaw != null && posterStoragePathRaw !== "") {
    if (typeof posterStoragePathRaw !== "string") {
      return { ok: false, error: "Invalid posterStoragePath", status: 400 };
    }
    posterStoragePath = posterStoragePathRaw.trim() || null;
  } else {
    posterStoragePath = null;
  }

  return {
    ok: true,
    data: {
      publishPostId,
      fileName,
      fileSize,
      mimeType,
      posterStoragePath,
    },
  };
}

export function buildBunnyVideoTitle(publishPostId: string): string {
  return `echotoo-${publishPostId}`;
}

export function computeAuthorizationExpire(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + TUS_AUTH_TTL_SECONDS;
}

export async function computeTusAuthorizationSignature(
  libraryId: string,
  apiKey: string,
  authorizationExpire: number,
  videoId: string,
): Promise<string> {
  const payload = `${libraryId}${apiKey}${authorizationExpire}${videoId}`;
  const encoded = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function buildSuccessResponse(params: {
  mediaId: string;
  videoId: string;
  libraryId: string;
  videoStatus: PostMediaVideoStatus;
  reused: boolean;
  authorizationExpire?: number;
  authorizationSignature?: string;
}): UploadInitSuccessBody {
  const uploadRequired = isUploadRequiredForVideoStatus(params.videoStatus);
  const body: UploadInitSuccessBody = {
    mediaId: params.mediaId,
    videoId: params.videoId,
    libraryId: params.libraryId,
    videoStatus: params.videoStatus,
    uploadRequired,
    reused: params.reused,
  };

  if (!uploadRequired) {
    return body;
  }

  if (
    params.authorizationExpire == null ||
    !params.authorizationSignature?.trim()
  ) {
    throw new Error("TUS credentials required when uploadRequired");
  }

  return {
    ...body,
    tusEndpoint: TUS_ENDPOINT,
    authorizationExpire: params.authorizationExpire,
    authorizationSignature: params.authorizationSignature,
  };
}

export function resolveExistingSlotAction(
  videoStatus: string,
): ExistingSlotAction | null {
  if (videoStatus === "pending" || videoStatus === "uploading") {
    return { kind: "reuse_upload" };
  }
  if (videoStatus === "processing" || videoStatus === "ready") {
    return { kind: "reuse_no_upload" };
  }
  if (videoStatus === "failed") {
    return { kind: "reject_failed" };
  }
  return null;
}

export function isActiveUnattachedCapExceeded(count: number): boolean {
  return count >= MAX_ACTIVE_UNATTACHED_VIDEOS;
}

/**
 * Decide whether an existing posts.id may receive Edit video staging.
 * Create path: post must not exist.
 * Edit path:
 *   - post exists and actor is AUTHOR → edit_staging
 *   - post exists and actor is report reviewer → edit_staging
 *   - otherwise → 403
 * Caller must look up report_reviewers server-side (never trust client flags alone).
 */
export function resolveOwnedPostUploadInitGate(options: {
  postExists: boolean;
  authorId: string | null | undefined;
  actorUserId: string;
  /** Server-verified membership in public.report_reviewers. */
  actorIsReportReviewer?: boolean;
}):
  | { ok: true; mode: "create" }
  | { ok: true; mode: "edit_staging" }
  | { ok: false; error: string; status: number } {
  if (!options.postExists) {
    return { ok: true, mode: "create" };
  }
  const author = options.authorId?.trim() || "";
  const actor = options.actorUserId.trim();
  if (!actor) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  if (author && author === actor) {
    return { ok: true, mode: "edit_staging" };
  }
  if (options.actorIsReportReviewer === true) {
    return { ok: true, mode: "edit_staging" };
  }
  return { ok: false, error: "Forbidden", status: 403 };
}

/** sort_order reserved for detached former primaries (avoids unattached uniq clash with staging slot 0). */
export const RETIRED_UNATTACHED_SORT_ORDER = 1000;

export function responseContainsSecret(
  body: UploadInitSuccessBody,
  apiKey: string,
): boolean {
  const serialized = JSON.stringify(body);
  return serialized.includes(apiKey);
}

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
