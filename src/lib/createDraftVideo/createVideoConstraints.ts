/**
 * Create-flow public video acceptance contract (PASS B0.2).
 * Adaptive preparation policy remains internal (B0.1) after these checks pass.
 */

import {
  MAX_BUNNY_VIDEO_FILE_BYTES,
  normalizeBunnyVideoMimeType,
} from "../bunnyUpload/bunnyVideoConstraints";
import { ADD_VIDEO_FAILED_USER_MESSAGE } from "./localVideoAsset";

export {
  MAX_CREATE_VIDEO_LONG_EDGE_PX,
  MAX_CREATE_VIDEO_PIXEL_AREA,
  MAX_CREATE_VIDEO_SHORT_EDGE_PX,
  isCreateVideoResolutionOverLimit,
  toCreateVideoDisplaySize,
} from "./createVideoResolutionConstraints";
export type { VideoDisplaySize } from "./createVideoResolutionConstraints";

/** Public Create max duration (inclusive). */
export const MAX_CREATE_VIDEO_DURATION_SECONDS = 90;

/** Keep existing 200 MB source ceiling. */
export const MAX_CREATE_VIDEO_SOURCE_BYTES = MAX_BUNNY_VIDEO_FILE_BYTES;

/** Alias for preparation policy / docs. */
export const SOURCE_MAX_BYTES = MAX_CREATE_VIDEO_SOURCE_BYTES;

/** Public Create formats — MP4 + MOV/QuickTime only. */
export const ALLOWED_CREATE_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
] as const;

export const CREATE_VIDEO_FILE_ACCEPT = ALLOWED_CREATE_VIDEO_MIME_TYPES.join(",");

export const VIDEO_TOO_LONG_USER_MESSAGE =
  "Video is too long. Maximum 90 seconds.";

export const VIDEO_TOO_LARGE_USER_MESSAGE =
  "Video is too large. Maximum 200 MB.";

export const VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE =
  "This video format isn't supported. Choose an MP4 or MOV video.";

export const VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE =
  "Video resolution is too high. Maximum supported resolution is 4K.";

/** Genuine unreadable pick — not a validation failure. */
export const VIDEO_READ_FAILED_USER_MESSAGE =
  "Couldn't read the selected media.";

/** Picker URI / grant / copy inaccessible (often cloud-backed library assets). */
export const VIDEO_INACCESSIBLE_USER_MESSAGE =
  "Couldn't access this video. Download it to your device and try again.";

/** Unexpected ingest failure — draft media preserved. */
export const VIDEO_INGEST_UNEXPECTED_USER_MESSAGE =
  "Something went wrong while adding your video. Your existing draft is safe.";

/** Temporary info after add when policy requires future preparation (no encoder yet). */
export const VIDEO_WILL_PREPARE_USER_MESSAGE =
  "Video will be prepared before posting.";

export const REPLACE_VIDEO_CONFIRM_TITLE = "Replace video?";

export const REPLACE_VIDEO_CONFIRM_BODY =
  "You can only add ONE VIDEO PER POST.";

export const REPLACE_VIDEO_CONFIRM_LEAD = "You can only add";

export const REPLACE_VIDEO_CONFIRM_EMPHASIS = "ONE VIDEO PER POST";

export type CreateVideoAcquisitionFailureReason =
  | "too_long"
  | "too_large"
  | "too_high_resolution"
  | "unsupported_format"
  | "read_failed"
  | "persist_failed"
  | "file_inaccessible"
  | "unexpected";

/** Scannable two-level toast content for limit/format validation only. */
export type CreateVideoValidationToastContent = {
  primary: string;
  action: string;
  /** Full sentence for screen readers / aria-label. */
  accessibleMessage: string;
};

export function getCreateVideoValidationToastContent(
  reason: CreateVideoAcquisitionFailureReason,
): CreateVideoValidationToastContent | null {
  switch (reason) {
    case "too_long":
      return {
        primary: "Video too long",
        action: "90 seconds max",
        accessibleMessage: VIDEO_TOO_LONG_USER_MESSAGE,
      };
    case "too_large":
      return {
        primary: "Video too large",
        action: "200 MB max",
        accessibleMessage: "Video is too large. Maximum 200 megabytes.",
      };
    case "too_high_resolution":
      return {
        primary: "Resolution too high",
        action: "4K max",
        accessibleMessage: VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
      };
    case "unsupported_format":
      return {
        primary: "Format not supported",
        action: "Use MP4 or MOV",
        accessibleMessage: VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
      };
    default:
      return null;
  }
}

export function messageForCreateVideoAcquisitionFailure(
  reason: CreateVideoAcquisitionFailureReason,
): string {
  switch (reason) {
    case "too_long":
      return VIDEO_TOO_LONG_USER_MESSAGE;
    case "too_large":
      return VIDEO_TOO_LARGE_USER_MESSAGE;
    case "too_high_resolution":
      return VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE;
    case "unsupported_format":
      return VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE;
    case "persist_failed":
      return ADD_VIDEO_FAILED_USER_MESSAGE;
    case "file_inaccessible":
      return VIDEO_INACCESSIBLE_USER_MESSAGE;
    case "unexpected":
      return VIDEO_INGEST_UNEXPECTED_USER_MESSAGE;
    case "read_failed":
    default:
      return VIDEO_READ_FAILED_USER_MESSAGE;
  }
}

export function mapCreateVideoSourceValidationReason(
  reason: "unsupported" | "too-large" | "empty",
): CreateVideoAcquisitionFailureReason {
  if (reason === "too-large") return "too_large";
  if (reason === "unsupported") return "unsupported_format";
  return "read_failed";
}

export const VIDEO_REQUIREMENTS_TITLE = "Video requirements";

/** Structured public requirements — only `emphasis` is brand-accented in UI. */
export const VIDEO_REQUIREMENTS_ITEMS = [
  { before: "Up to ", emphasis: "90 seconds", after: "" },
  { before: "Up to ", emphasis: "200 MB", after: "" },
  { before: "Up to ", emphasis: "4K", after: "" },
  { before: "", emphasis: "MP4 or MOV", after: "" },
] as const;

/** Plain-text lines (tests / accessibility). */
export const VIDEO_REQUIREMENTS_LINES = VIDEO_REQUIREMENTS_ITEMS.map(
  (item) => `${item.before}${item.emphasis}${item.after}`,
);

export const VIDEO_REQUIREMENTS_OPTIMIZATION_LINE =
  "Videos may be optimized before posting.";

/**
 * @capacitor/camera 8.2.x exposes separate `takePhoto()` and `recordVideo()`.
 * There is no supported single native camera UI that switches Photo ↔ Video.
 */
export const SUPPORTS_UNIFIED_NATIVE_CAMERA_CAPTURE = false;

export function isAllowedCreateVideoMimeType(mimeType: string): boolean {
  return (ALLOWED_CREATE_VIDEO_MIME_TYPES as readonly string[]).includes(
    normalizeBunnyVideoMimeType(mimeType),
  );
}

export function normalizeCreateVideoDurationSeconds(
  value: unknown,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function isCreateVideoDurationOverLimit(
  durationSeconds: number | null | undefined,
): boolean {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) {
    return false;
  }
  return durationSeconds > MAX_CREATE_VIDEO_DURATION_SECONDS;
}

export type CreateVideoSourceValidation =
  | { ok: true; mimeType: string }
  | {
      ok: false;
      reason: "unsupported" | "too-large" | "empty";
      message: string;
    };

export function validateCreateVideoSource(file: {
  name: string;
  type: string;
  size: number;
}): CreateVideoSourceValidation {
  const mimeType = normalizeBunnyVideoMimeType(file.type || "");
  if (!mimeType || !isAllowedCreateVideoMimeType(mimeType)) {
    return {
      ok: false,
      reason: "unsupported",
      message: VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
    };
  }
  if (file.size <= 0) {
    return {
      ok: false,
      reason: "empty",
      message: ADD_VIDEO_FAILED_USER_MESSAGE,
    };
  }
  if (file.size > MAX_CREATE_VIDEO_SOURCE_BYTES) {
    return {
      ok: false,
      reason: "too-large",
      message: VIDEO_TOO_LARGE_USER_MESSAGE,
    };
  }
  if (!file.name?.trim()) {
    return {
      ok: false,
      reason: "unsupported",
      message: VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
    };
  }
  return { ok: true, mimeType };
}
