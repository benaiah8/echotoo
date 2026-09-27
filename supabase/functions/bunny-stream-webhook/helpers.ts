/**
 * Pure helpers for bunny-stream-webhook (testable without Deno.serve).
 */

export const LOG_PREFIX = "[bunny-stream-webhook]";

export type PostMediaStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export const POST_MEDIA_STATUS_RANK: Record<
  Exclude<PostMediaStatus, "failed">,
  number
> = {
  pending: 0,
  uploading: 1,
  processing: 2,
  ready: 3,
};

export type BunnyWebhookPayload = {
  videoGuid: string;
  status: number;
  videoLibraryId?: number;
};

export type BunnyVideoMetadata = {
  poster_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  failure_reason: string | null;
};

/**
 * Bunny Stream webhook Status enum (not VideoModel.status).
 * @see https://docs.bunny.net/stream/webhooks
 */
export function mapBunnyStatusToPostMediaStatus(
  bunnyStatus: number,
): PostMediaStatus | null {
  switch (bunnyStatus) {
    case 0: // Queued
    case 1: // Processing
    case 2: // Encoding
      return "processing";
    case 3: // Finished
    case 4: // ResolutionFinished (first playable)
      return "ready";
    case 5: // Failed
    case 8: // PresignedUploadFailed
      return "failed";
    case 6: // PresignedUploadStarted
      return "uploading";
    case 7: // PresignedUploadFinished
      return "processing";
    case 9: // CaptionsGenerated
    case 10: // TitleOrDescriptionGenerated
      return null;
    default:
      return null;
  }
}

export function parseBunnyWebhookPayload(
  json: unknown,
):
  | { ok: true; payload: BunnyWebhookPayload }
  | { ok: false; error: string } {
  if (!json || typeof json !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const record = json as Record<string, unknown>;
  const videoGuidRaw =
    record.VideoGuid ?? record.videoGuid ?? record.video_guid;
  const statusRaw = record.Status ?? record.status;
  const libraryRaw =
    record.VideoLibraryId ?? record.videoLibraryId ?? record.video_library_id;

  const videoGuid = typeof videoGuidRaw === "string" ? videoGuidRaw.trim() : "";
  if (!videoGuid) {
    return { ok: false, error: "Missing VideoGuid" };
  }

  if (typeof statusRaw !== "number" || !Number.isFinite(statusRaw)) {
    return { ok: false, error: "Invalid Status" };
  }

  const payload: BunnyWebhookPayload = {
    videoGuid,
    status: statusRaw,
  };

  if (typeof libraryRaw === "number" && Number.isFinite(libraryRaw)) {
    payload.videoLibraryId = libraryRaw;
  }

  return { ok: true, payload };
}

export async function computeBunnyWebhookSignatureHex(
  rawBody: string,
  readOnlyApiKey: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(readOnlyApiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export const BUNNY_WEBHOOK_SIGNATURE_VERSION = "v1";
export const BUNNY_WEBHOOK_SIGNATURE_ALGORITHM = "hmac-sha256";

export type BunnyWebhookSignatureVerificationInput = {
  rawBody: string;
  versionHeader: string | null;
  algorithmHeader: string | null;
  signatureHeader: string | null;
  secret: string;
};

export async function verifyBunnyWebhookSignature(
  input: BunnyWebhookSignatureVerificationInput,
): Promise<boolean> {
  const version = input.versionHeader?.trim();
  if (version !== BUNNY_WEBHOOK_SIGNATURE_VERSION) {
    return false;
  }

  const algorithm = input.algorithmHeader?.trim().toLowerCase();
  if (algorithm !== BUNNY_WEBHOOK_SIGNATURE_ALGORITHM) {
    return false;
  }

  const signature = input.signatureHeader?.trim();
  const secret = input.secret.trim();
  if (!signature || !secret) {
    return false;
  }

  const expected = await computeBunnyWebhookSignatureHex(input.rawBody, secret);
  return timingSafeEqualHex(expected, signature);
}

export function shouldApplyStatusUpdate(
  currentStatus: string,
  nextStatus: PostMediaStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (currentStatus === "failed") {
    return false;
  }

  if (currentStatus === "ready") {
    return nextStatus === "ready";
  }

  if (nextStatus === "failed") {
    return true;
  }

  const currentRank =
    POST_MEDIA_STATUS_RANK[currentStatus as keyof typeof POST_MEDIA_STATUS_RANK];
  const nextRank = POST_MEDIA_STATUS_RANK[nextStatus];

  if (currentRank === undefined) {
    return true;
  }

  return nextRank >= currentRank;
}

export function sanitizeFailureReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 500 ? `${trimmed.slice(0, 499).trimEnd()}…` : trimmed;
}

export function extractFailureReasonFromVideoMetadata(
  video: Record<string, unknown>,
): string {
  const messages = video.transcodingMessages;
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const item = messages[i];
      if (!item || typeof item !== "object") continue;
      const reason = sanitizeFailureReason(
        (item as Record<string, unknown>).message,
      );
      if (reason) return reason;
    }
  }
  return "Bunny encoding failed";
}

export function parseBunnyVideoMetadata(
  video: Record<string, unknown>,
): BunnyVideoMetadata {
  const posterUrlRaw = video.thumbnailUrl;
  const poster_url =
    typeof posterUrlRaw === "string" && posterUrlRaw.trim()
      ? posterUrlRaw.trim()
      : null;

  const lengthRaw = video.length;
  const duration_sec =
    typeof lengthRaw === "number" && Number.isFinite(lengthRaw) && lengthRaw >= 0
      ? lengthRaw
      : null;

  const widthRaw = video.width;
  const width =
    typeof widthRaw === "number" && Number.isFinite(widthRaw) && widthRaw > 0
      ? Math.round(widthRaw)
      : null;

  const heightRaw = video.height;
  const height =
    typeof heightRaw === "number" && Number.isFinite(heightRaw) && heightRaw > 0
      ? Math.round(heightRaw)
      : null;

  return {
    poster_url,
    duration_sec,
    width,
    height,
    failure_reason: extractFailureReasonFromVideoMetadata(video),
  };
}
